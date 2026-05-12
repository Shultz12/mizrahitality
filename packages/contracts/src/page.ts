// The "rendered page" DTO — the payload the SSR published page renders and the one feature #6's
// `GET /api/venues/<slug>/page` returns. It's deliberately self-describing: alongside the audience
// `CopyBundle` it folds in the chosen hero image's URL, the per-variant body typography, and the
// fixed, template-owned UI strings ("Book Now", "Powered by Mizrahitality"), so a consumer needs
// nothing else to render the page. Built by apps/owner's `lib/rendered-page.ts` (#5 published-page-ssr);
// feature #6 reuses that builder in-process (passing a `baseUrl` so `imageUrl` is absolutized);
// feature #8's customer site re-implements its own renderer against this same DTO.

import type { CopyBundle } from './copy';
import type { VisitorType } from './visitor';

/** Versions the {@link RenderedPage} DTO, independently of `SLOT_SCHEMA_VERSION` (the copy-bundle shape). */
export const RENDERED_PAGE_SCHEMA_VERSION = 1 as const;

/** The fixed CTA label — both the hero and the closing "Book Now" buttons. Never AI-generated. */
export const BOOK_NOW_LABEL = 'Book Now';
/** The fixed footer attribution line. Never AI-generated. */
export const POWERED_BY_TEXT = 'Powered by Mizrahitality';

/** The per-variant body-text type scale (headings keep the global Playfair Display scale). */
export interface RenderedPageTypography {
  /** Body font-size in px (always ≥ 16 — the iOS-zoom mobile minimum). */
  bodyFontSizePx: number;
  /** Body line-height (unitless). */
  bodyLineHeight: number;
}

/** Everything needed to render one published venue page for one visitor type. */
export interface RenderedPage {
  schemaVersion: typeof RENDERED_PAGE_SCHEMA_VERSION;
  /** The venue's public slug. */
  slug: string;
  /** The variant *actually* served — after the neutral fallback, so never a requested type that missed. */
  visitorType: VisitorType;
  /** The venue name — Zone 1 H1 and the footer; owner input, not AI. */
  venueName: string;
  /** The hero image URL — app-relative (`/uploads/…` | `/stock/…`) unless a `baseUrl` absolutized it. */
  imageUrl: string;
  /** Alt text for the hero image. */
  imageAlt: string;
  /** The audience copy bundle for {@link RenderedPage.visitorType}. */
  copy: CopyBundle;
  /** The per-variant body typography. */
  typography: RenderedPageTypography;
  /** The fixed, template-owned UI strings. */
  fixed: { ctaLabel: string; poweredBy: string };
}
