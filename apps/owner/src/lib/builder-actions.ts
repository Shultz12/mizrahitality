'use server';

// Server Actions for the venue builder. `saveVenueAction` persists the owner's three inputs (name →
// derived slug, free-text description, one image — a stock pick or an upload) onto their single
// `Venue` (feature #3). Feature #4 adds the AI surface: `publishAction` — a stateful `useActionState`
// action that delegates to the publish pipeline (lib/publish.ts → generates + validates the 7
// PageVariant copy bundles, all-or-nothing, with retries); `enhanceDescriptionAction` — polishes
// the description text (the owner accepts or keeps their own); `regenerateVariantAction` — re-runs
// one published variant (re-validates before swapping). The AI steps live in lib/ai/ (a lazily-
// constructed Anthropic client + the two text steps); the prompt assets are transcribed in
// lib/templates.ts. Thin orchestration over auth.ts / validation.ts / slug.ts / uploads.ts /
// stock-images.ts / lib/ai / lib/publish / Prisma — exercised by the manual click-through plus the
// helper unit/integration tests (publish.integration.test.ts targets `runPublishPipeline`), not by
// direct action tests (actions need a request context for `cookies()`).

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import {
  SLOT_SCHEMA_VERSION,
  isVisitorType,
  type CopyBundleResult,
} from '@mizrahitality/contracts';
import { prisma } from './prisma';
import { requireOwner } from './auth';
import {
  VENUE_DESCRIPTION_MAX_LENGTH,
  validateVenueDescription,
  validateVenueName,
} from './validation';
import { deriveSlugBase, nextAvailableSlug } from './slug';
import { isStockImageId } from './stock-images';
import { UploadValidationError, deleteUploadByKey, saveVenueUpload } from './uploads';
import {
  AiNotConfiguredError,
  enhanceDescription,
  generateVariantCopy,
  isAiConfigured,
} from './ai';
import { runPublishPipeline, type PublishState } from './publish';

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

  await prisma.venue.update({
    where: { id: venue.id },
    data: { name, slug, description, ...(imageUpdate ?? {}) },
  });

  // If we replaced an uploaded file, best-effort delete the old one.
  if (imageUpdate && venue.imageKind === 'upload' && venue.imageValue !== imageUpdate.imageValue) {
    await deleteUploadByKey(venue.imageValue);
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Feature #4 — the AI surface: publish (generate the 7 variants), enhance, regenerate.
// ---------------------------------------------------------------------------

/**
 * Publish — a stateful `useActionState` action. Delegates to the publish pipeline (lib/publish.ts):
 * generates + validates all 7 audience copy bundles and commits transactionally, or changes nothing
 * and reports which variants failed. No `redirect()` — `<PublishSection>` shows the result inline
 * and `router.refresh()`es; `revalidatePath('/dashboard')` updates the dashboard's `Status:` line.
 */
export async function publishAction(
  _prev: PublishState,
  _formData: FormData,
): Promise<PublishState> {
  const state = await runPublishPipeline(await requireOwner());
  if (state.ok) revalidatePath('/dashboard');
  return state;
}

/**
 * Enhance the description text with AI — called directly from `<BuilderForm>` (takes an arg, returns
 * data, persists nothing). Signed-in gate only (no venue required — works pre-create). The owner
 * reviews the suggestion client-side and clicks "Use this" (fills the textarea; still Saves) or
 * "Keep mine" (dismiss). Persists nothing — `saveVenueAction` (→ `validateVenueDescription`) does that.
 */
export async function enhanceDescriptionAction(
  text: string,
): Promise<{ ok: true; enhanced: string } | { ok: false; error: string }> {
  await requireOwner();
  if (!isAiConfigured())
    return { ok: false, error: 'AI is not configured — set ANTHROPIC_API_KEY to use this.' };

  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Write a few words first, then enhance.' };
  if (trimmed.length > VENUE_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: `Description is too long (max ${VENUE_DESCRIPTION_MAX_LENGTH} characters).`,
    };
  }

  try {
    return { ok: true, enhanced: await enhanceDescription(trimmed) };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof AiNotConfiguredError
          ? 'AI is not configured — set ANTHROPIC_API_KEY to use this.'
          : 'The AI service is unavailable right now — please try again.',
    };
  }
}

/**
 * Regenerate one published audience page — called directly from `<RegenerateButton>`. Re-runs the
 * variant copy step, re-validates, and swaps just that `PageVariant` row. Only operates on a
 * published venue (full Re-publish handles the unpublished / all-7 case).
 */
export async function regenerateVariantAction(
  visitorType: string,
): Promise<{ ok: true } | { ok: false; error: string; errors?: string[] }> {
  const owner = await requireOwner();
  if (!owner.venue) return { ok: false, error: 'Create your venue first.' };
  const venue = owner.venue;
  if (venue.publishState !== 'published') {
    return { ok: false, error: 'Publish first — then you can regenerate individual pages.' };
  }
  if (!isVisitorType(visitorType)) return { ok: false, error: 'Unknown audience.' };
  if (!isAiConfigured())
    return { ok: false, error: 'AI is not configured — set ANTHROPIC_API_KEY.' };

  let result: CopyBundleResult;
  try {
    result = await generateVariantCopy({
      venueName: venue.name,
      description: venue.description,
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
