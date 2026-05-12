'use server';

// Server Actions for the venue builder (feature #3): save the owner's three inputs (name →
// derived slug, free-text description, one image — a stock pick or an upload) onto their single
// `Venue`, and a publish stub. Thin orchestration over `auth.ts` + `validation.ts` + `slug.ts` +
// `uploads.ts` + `stock-images.ts` + Prisma — exercised by the manual click-through plus the
// helper unit/integration tests, not by direct action tests (actions need a request context for
// `cookies()`). `redirect()` throws a control-flow signal, so it's never inside a try/catch.

import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { requireOwner } from './auth';
import { validateVenueDescription, validateVenueName } from './validation';
import { deriveSlugBase, nextAvailableSlug } from './slug';
import { isStockImageId } from './stock-images';
import { UploadValidationError, deleteUploadByKey, saveVenueUpload } from './uploads';

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

export async function publishAction(): Promise<void> {
  const owner = await requireOwner();
  if (!owner.venue) redirect('/builder');

  await prisma.venue.update({
    where: { id: owner.venue.id },
    data: {
      publishState: 'published',
      publishedAt: new Date(),
      // Freeze the slug at first publish; re-publishes keep the existing lock.
      slugLockedAt: owner.venue.slugLockedAt ?? new Date(),
    },
  });
  // TODO(feature #4 ai-copy-and-variants): generate + structurally validate the 7 PageVariant rows here before flipping publishState.

  redirect('/builder?published=1');
}
