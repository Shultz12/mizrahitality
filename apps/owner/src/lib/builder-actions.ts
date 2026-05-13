'use server';

// Server Actions for the venue builder. `saveVenueAction` persists the owner's three inputs (name →
// derived slug, free-text description, one image — a stock pick or an upload) onto their single
// `Venue` (feature #3). The AI surface: `publishAction` — a stateful `useActionState` action that
// delegates to the publish pipeline (lib/publish.ts → polishes the description, generates +
// validates the 7 PageVariant copy bundles from the polished text, persists everything
// transactionally, all-or-nothing, with retries); `regenerateVariantAction` — re-runs one published
// variant (re-validates before swapping). The AI steps live in lib/ai/ (a lazily-constructed Google
// GenAI client + the two text steps); the prompt assets are transcribed in lib/templates.ts. Thin
// orchestration over auth.ts / validation.ts / slug.ts / uploads.ts / stock-images.ts / lib/ai /
// lib/publish / Prisma — exercised by the manual click-through plus the helper unit/integration
// tests (publish.integration.test.ts targets `runPublishPipeline`), not by direct action tests
// (actions need a request context for `cookies()`).

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import {
  SLOT_SCHEMA_VERSION,
  isVisitorType,
  type CopyBundleResult,
} from '@mizrahitality/contracts';
import { prisma } from './prisma';
import { requireOwner } from './auth';
import { validateVenueDescription, validateVenueName } from './validation';
import { deriveSlugBase, nextAvailableSlug } from './slug';
import { isStockImageId } from './stock-images';
import { UploadValidationError, deleteUploadByKey, saveVenueUpload } from './uploads';
import { enhanceDescription, generateVariantCopy, isAiConfigured } from './ai';
import { runPublishPipeline, type PublishState } from './publish';
import {
  completePublishJob,
  createPublishJob,
  getPublishJob,
  setPublishJobProgress,
  type PublishJobStatus,
} from './publish-jobs';

export type BuilderState = {
  /** Top-level error (rare — unexpected failure). */
  error?: string;
  /** Per-field validation errors. */
  fieldErrors?: { name?: string; description?: string; image?: string };
  /** Typed values echoed back so a rejected submit repopulates the form. */
  values?: { name?: string; description?: string };
  /** `true` after a successful save — the form shows "Saved." and `router.refresh()`es. */
  ok?: boolean;
};

type ImageMode = 'stock' | 'upload' | 'keep';

function parseImageMode(value: FormDataEntryValue | null): ImageMode | null {
  return value === 'stock' || value === 'upload' || value === 'keep' ? value : null;
}

function isUniqueSlugViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    // `meta.target` is the offending unique constraint — a string or string[] depending on driver.
    String((err.meta as { target?: unknown } | undefined)?.target ?? '').includes('slug')
  );
}

/** Is `slug` already used by some venue other than `exceptId`? Used as the `nextAvailableSlug` probe. */
function slugTakenInDb(exceptId?: string): (slug: string) => Promise<boolean> {
  return async (slug) => {
    const hit = await prisma.venue.findUnique({ where: { slug }, select: { id: true } });
    return hit !== null && hit.id !== exceptId;
  };
}

export async function saveVenueAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const owner = await requireOwner();

  const rawName = String(formData.get('name') ?? '');
  const rawDescription = String(formData.get('description') ?? '');
  const imageMode = parseImageMode(formData.get('imageMode'));
  const rawStockImageId = String(formData.get('stockImageId') ?? '');
  const imageEntry = formData.get('imageFile');
  const imageFile = imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;

  const nameResult = validateVenueName(rawName);
  const descriptionResult = validateVenueDescription(rawDescription);

  const fieldErrors: NonNullable<BuilderState['fieldErrors']> = {};
  if (!nameResult.ok) fieldErrors.name = nameResult.message;
  if (!descriptionResult.ok) fieldErrors.description = descriptionResult.message;

  // Validate the image choice for the selected mode.
  if (imageMode === 'stock') {
    if (!isStockImageId(rawStockImageId)) fieldErrors.image = 'Please choose a stock photo.';
  } else if (imageMode === 'upload') {
    if (!imageFile) fieldErrors.image = 'Please choose an image to upload.';
  } else if (imageMode === 'keep') {
    if (!owner.venue || owner.venue.imageKind !== 'upload') {
      fieldErrors.image = 'Please choose an image.';
    }
  } else {
    fieldErrors.image = 'Please choose an image.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values: { name: rawName, description: rawDescription } };
  }

  // From here the validators succeeded — narrow them.
  const name = nameResult.ok ? nameResult.value : rawName;
  const description = descriptionResult.ok ? descriptionResult.value : rawDescription;
  const echo = { name: rawName, description: rawDescription };

  // ---- No venue yet: create it (the create form requires name + image). ----
  if (!owner.venue) {
    // `keep` was already rejected above when there's no venue, so the mode is 'stock' or 'upload'.
    const base = deriveSlugBase(name);

    if (imageMode === 'stock') {
      try {
        const slug = await nextAvailableSlug(base, slugTakenInDb());
        await prisma.venue.create({
          data: {
            ownerId: owner.id,
            name,
            slug,
            description,
            imageKind: 'stock',
            imageValue: rawStockImageId,
          },
        });
      } catch (err) {
        if (!isUniqueSlugViolation(err)) throw err;
        const slug = await nextAvailableSlug(`${base}${Date.now() % 1000}`, slugTakenInDb());
        await prisma.venue.create({
          data: {
            ownerId: owner.id,
            name,
            slug,
            description,
            imageKind: 'stock',
            imageValue: rawStockImageId,
          },
        });
      }
      return { ok: true };
    }

    // imageMode === 'upload' — create with a placeholder image, then store the file and update.
    // `imageFile` is non-null here (validated above).
    let venueId: string;
    try {
      const slug = await nextAvailableSlug(base, slugTakenInDb());
      const venue = await prisma.venue.create({
        data: {
          ownerId: owner.id,
          name,
          slug,
          description,
          imageKind: 'stock',
          imageValue: 'atlantis-paradise',
        },
      });
      venueId = venue.id;
    } catch (err) {
      if (!isUniqueSlugViolation(err)) throw err;
      const slug = await nextAvailableSlug(`${base}${Date.now() % 1000}`, slugTakenInDb());
      const venue = await prisma.venue.create({
        data: {
          ownerId: owner.id,
          name,
          slug,
          description,
          imageKind: 'stock',
          imageValue: 'atlantis-paradise',
        },
      });
      venueId = venue.id;
    }
    try {
      const { key } = await saveVenueUpload(venueId, imageFile!);
      await prisma.venue.update({
        where: { id: venueId },
        data: { imageKind: 'upload', imageValue: key },
      });
    } catch (err) {
      // Roll the venue back so we don't leave a half-created row (and free the reserved slug).
      await prisma.venue.delete({ where: { id: venueId } }).catch(() => undefined);
      if (err instanceof UploadValidationError)
        return { fieldErrors: { image: err.message }, values: echo };
      throw err;
    }
    return { ok: true };
  }

  // ---- Existing venue: update name/description/slug/image. ----
  const venue = owner.venue;

  // Slug: re-derived on rename only while not yet locked; immutable once `slugLockedAt` is set.
  let slug = venue.slug;
  if (venue.slugLockedAt == null && name !== venue.name) {
    slug = await nextAvailableSlug(deriveSlugBase(name), slugTakenInDb(venue.id));
  }

  // Image: resolve the update (or leave undefined for 'keep').
  let imageUpdate: { imageKind: string; imageValue: string } | undefined;
  if (imageMode === 'upload') {
    try {
      const { key } = await saveVenueUpload(venue.id, imageFile!);
      imageUpdate = { imageKind: 'upload', imageValue: key };
    } catch (err) {
      if (err instanceof UploadValidationError)
        return { fieldErrors: { image: err.message }, values: echo };
      throw err;
    }
  } else if (imageMode === 'stock') {
    imageUpdate = { imageKind: 'stock', imageValue: rawStockImageId };
  }

  // If the typed description actually changed, clear the polished version: the read-only
  // "polished" box empties and the next Publish/Regenerate will prompt the enhance-missing modal
  // (predictable behaviour — never silently use a stale polished version of a different text).
  const enhancedUpdate =
    description !== venue.description ? { enhancedDescription: null } : {};

  await prisma.venue.update({
    where: { id: venue.id },
    data: { name, slug, description, ...enhancedUpdate, ...(imageUpdate ?? {}) },
  });

  // If we replaced an uploaded file, best-effort delete the old one.
  if (imageUpdate && venue.imageKind === 'upload' && venue.imageValue !== imageUpdate.imageValue) {
    await deleteUploadByKey(venue.imageValue);
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Feature #4 — the AI surface: enhance (separate step, post-#9), publish (generate the 7
// variants), regenerate.
// ---------------------------------------------------------------------------

/**
 * Polish the description the owner has currently typed into the form and store both that text
 * (as `venue.description`) and the polished version (as `venue.enhancedDescription`). Idempotent
 * — re-clicking regenerates against whatever is in the form right now. Takes the typed text from
 * the client because the form's textarea state doesn't reach the server otherwise — reading
 * `venue.description` from the DB here would always use the last *saved* text, not what the owner
 * sees in the textarea. Save is implicit: clicking Enhance commits the description without
 * touching name/slug/image.
 */
export type EnhanceResult =
  | { ok: true; enhancedDescription: string }
  | { ok: false; error: string };

export async function enhanceDescriptionAction(typedDescription: string): Promise<EnhanceResult> {
  const owner = await requireOwner();
  if (!owner.venue) return { ok: false, error: 'Create your venue first.' };
  const venue = owner.venue;
  if (!isAiConfigured())
    return { ok: false, error: 'AI is not configured — set GOOGLE_API_KEY to enhance.' };

  const validated = validateVenueDescription(typedDescription);
  if (!validated.ok) return { ok: false, error: validated.message };
  const description = validated.value;
  if (description.trim().length === 0) {
    return { ok: false, error: 'Write a description first, then click Enhance.' };
  }

  let polished: string;
  try {
    polished = await enhanceDescription(description);
  } catch {
    return { ok: false, error: 'The AI service is unavailable right now — please try again.' };
  }

  await prisma.venue.update({
    where: { id: venue.id },
    data: { description, enhancedDescription: polished },
  });
  revalidatePath('/builder');
  return { ok: true, enhancedDescription: polished };
}

/**
 * Publish — async, in-memory-job-backed. The client calls `startPublishAction()` to kick off the
 * pipeline, then polls `pollPublishJobAction(jobId)` to render an in-button "X / 7" progress bar
 * while it runs. The pipeline commits transactionally / all-or-nothing.
 *
 * Pre-flight: if `venue.enhancedDescription` is null/empty AND the caller didn't pass
 * `allowWithoutEnhanced: true`, this returns `{ ok: false, needsEnhanceConfirm: true }` instead of
 * starting a job — the UI swaps the normal confirm modal for the "enhance-missing" mode; on
 * confirm, the client re-invokes with `{ allowWithoutEnhanced: true }` and the pipeline uses the
 * typed description as-is (without ever overwriting it).
 */
export type StartPublishResult =
  | { ok: true; jobId: string; total: number }
  | { ok: false; error: string }
  | { ok: false; needsEnhanceConfirm: true };

export async function startPublishAction(
  opts?: { allowWithoutEnhanced?: boolean },
): Promise<StartPublishResult> {
  const owner = await requireOwner();
  if (!owner.venue) return { ok: false, error: 'Create your venue before publishing.' };
  if (!isAiConfigured())
    return { ok: false, error: 'AI is not configured — set GOOGLE_API_KEY to publish.' };
  if (owner.venue.description.trim().length === 0) {
    return { ok: false, error: 'Write a venue description before publishing.' };
  }
  if (
    !owner.venue.enhancedDescription?.trim() &&
    !opts?.allowWithoutEnhanced
  ) {
    return { ok: false, needsEnhanceConfirm: true };
  }

  // Eagerly snapshot a job so the client gets a non-null id even before the pipeline's first
  // `onProgress` tick. Total mirrors `allVisitorVariants().length` (7).
  const job = createPublishJob(owner.id, 7);

  // Kick the pipeline off in the background. Errors here are swallowed into the job result —
  // never thrown to the action caller (which has already returned the jobId).
  void runPublishPipeline(owner, {
    allowWithoutEnhanced: opts?.allowWithoutEnhanced,
    onProgress: (done) => setPublishJobProgress(job.id, done),
  })
    .then((state) => {
      completePublishJob(job.id, state);
      if (state.ok) revalidatePath('/dashboard');
    })
    .catch((err) => {
      completePublishJob(job.id, {
        error:
          err instanceof Error
            ? `Publish failed unexpectedly: ${err.message}`
            : 'Publish failed unexpectedly.',
      });
    });

  return { ok: true, jobId: job.id, total: job.total };
}

export type PollPublishResult =
  | {
      ok: true;
      status: PublishJobStatus;
      done: number;
      total: number;
      result?: PublishState;
    }
  | { ok: false; error: string };

export async function pollPublishJobAction(jobId: string): Promise<PollPublishResult> {
  const owner = await requireOwner();
  const job = getPublishJob(jobId, owner.id);
  if (!job) return { ok: false, error: 'Unknown publish job — please try again.' };
  return {
    ok: true,
    status: job.status,
    done: job.done,
    total: job.total,
    result: job.result,
  };
}

/**
 * Regenerate one published audience page — called directly from `<RegenerateButton>`. Re-runs the
 * variant copy step, re-validates, and swaps just that `PageVariant` row. Only operates on a
 * published venue (full Re-publish handles the unpublished / all-7 case).
 *
 * Source-text selection mirrors `runPublishPipeline`: prefer `venue.enhancedDescription` if
 * present; otherwise — only with `allowWithoutEnhanced` — fall back to the typed description.
 * Without that flag and an empty `enhancedDescription`, returns `{ ok: false,
 * needsEnhanceConfirm: true }` so the button can prompt the same confirm modal as Re-publish.
 */
export type RegenerateResult =
  | { ok: true }
  | { ok: false; error: string; errors?: string[] }
  | { ok: false; needsEnhanceConfirm: true };

export async function regenerateVariantAction(
  visitorType: string,
  opts?: { allowWithoutEnhanced?: boolean },
): Promise<RegenerateResult> {
  const owner = await requireOwner();
  if (!owner.venue) return { ok: false, error: 'Create your venue first.' };
  const venue = owner.venue;
  if (venue.publishState !== 'published') {
    return { ok: false, error: 'Publish first — then you can regenerate individual pages.' };
  }
  if (!isVisitorType(visitorType)) return { ok: false, error: 'Unknown audience.' };
  if (!isAiConfigured())
    return { ok: false, error: 'AI is not configured — set GOOGLE_API_KEY.' };

  const enhanced = venue.enhancedDescription?.trim() ?? '';
  if (enhanced.length === 0 && !opts?.allowWithoutEnhanced) {
    return { ok: false, needsEnhanceConfirm: true };
  }
  const sourceText = enhanced.length > 0 ? enhanced : venue.description;

  let result: CopyBundleResult;
  try {
    result = await generateVariantCopy({
      venueName: venue.name,
      description: sourceText,
      variant: visitorType,
    });
  } catch {
    return { ok: false, error: 'The AI service is unavailable right now — please try again.' };
  }
  if (!result.ok) {
    return {
      ok: false,
      error: 'The regenerated copy failed validation — please try again.',
      errors: result.errors,
    };
  }

  try {
    await prisma.pageVariant.update({
      where: { venueId_visitorType: { venueId: venue.id, visitorType } },
      data: {
        content: {
          schemaVersion: SLOT_SCHEMA_VERSION,
          copy: result.value,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return { ok: false, error: 'That page is missing — re-publish to regenerate all of them.' };
    }
    throw err;
  }

  revalidatePath('/builder');
  revalidatePath('/dashboard');
  return { ok: true };
}
