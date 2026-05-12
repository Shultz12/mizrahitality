// The shared "build a RenderedPage" module: composes a stored `PageVariant` copy bundle + the
// venue's chosen hero image + the per-variant body typography + the fixed UI strings into the
// `RenderedPage` DTO from `@mizrahitality/contracts`. The SSR published page (#5, `app/preview/`)
// renders the result; feature #6's `GET /api/venues/<slug>/page` reuses this same builder
// in-process, passing a `baseUrl` so `imageUrl` comes out absolute (in-app rendering keeps it
// app-relative). Pure — no DB, no I/O — so the caller does the Prisma query and this is unit-tested
// directly.

import {
  BOOK_NOW_LABEL,
  NEUTRAL_VISITOR_TYPE,
  POWERED_BY_TEXT,
  RENDERED_PAGE_SCHEMA_VERSION,
  type RenderedPage,
  type VisitorType,
} from '@mizrahitality/contracts';
import { isStockImageId, stockImagePath } from './stock-images';
import { templateEntry } from './templates';
import { parsePageVariantContent } from './page-variant';

/** A stored `PageVariant` row, narrowed to the columns the builder needs. */
export interface VariantRowInput {
  visitorType: string;
  content: unknown;
}

export interface BuildRenderedPageArgs {
  venue: { name: string; slug: string; imageKind: string; imageValue: string };
  variants: VariantRowInput[];
  /** The visitor type to render — already coerced via `parseVisitorType` (so it's one of the 7). */
  requestedType: VisitorType;
  /** When given, `imageUrl` is resolved to an absolute URL against it (feature #6's API). */
  baseUrl?: string;
}

export type BuildRenderedPageResult =
  | { ok: true; value: RenderedPage }
  | { ok: false; error: string };

/** App-relative URL for a venue's hero image — mirrors `venue-preview.tsx`'s `imageSrc`. */
function imageUrlFor(kind: string, value: string): string {
  if (kind === 'upload') return `/uploads/${value}`;
  return isStockImageId(value) ? stockImagePath(value) : `/stock/${value}.jpg`;
}

/**
 * Build the `RenderedPage` DTO for one venue + one visitor type. Picks the `requestedType` variant
 * row, else the `neutral` row; re-validates the stored blob via `parsePageVariantContent`. Returns
 * `{ ok:false }` when there's no row to render or the stored content is unreadable — neither happens
 * for a normally-published venue (publish is all-or-nothing), so callers can surface a terse
 * "re-publish" notice rather than a deep fallback.
 */
export function buildRenderedPage(args: BuildRenderedPageArgs): BuildRenderedPageResult {
  const { venue, variants, requestedType, baseUrl } = args;

  const row =
    variants.find((v) => v.visitorType === requestedType) ??
    variants.find((v) => v.visitorType === NEUTRAL_VISITOR_TYPE);
  if (!row) {
    return { ok: false, error: 'no stored page variant to render — re-publish the venue' };
  }

  const parsed = parsePageVariantContent(row.content);
  if (!parsed.ok) {
    return { ok: false, error: `stored page content is unreadable: ${parsed.errors.join('; ')}` };
  }

  const { copy } = parsed.value;
  // The bundle's own `variant` is the variant actually served (the neutral row → 'neutral').
  const servedVariant: VisitorType = copy.variant;
  const { typography } = templateEntry(servedVariant);

  const relativeImageUrl = imageUrlFor(venue.imageKind, venue.imageValue);
  const imageUrl = baseUrl ? new URL(relativeImageUrl, baseUrl).toString() : relativeImageUrl;

  return {
    ok: true,
    value: {
      schemaVersion: RENDERED_PAGE_SCHEMA_VERSION,
      slug: venue.slug,
      visitorType: servedVariant,
      venueName: venue.name,
      imageUrl,
      imageAlt: `${venue.name} — venue photo`,
      copy,
      typography: {
        bodyFontSizePx: typography.bodyFontSizePx,
        bodyLineHeight: typography.bodyLineHeight,
      },
      fixed: { ctaLabel: BOOK_NOW_LABEL, poweredBy: POWERED_BY_TEXT },
    },
  };
}
