// The owner-internal wrapper actually persisted on `PageVariant.content`: the schema-versioned
// blob `{ schemaVersion, copy }`. The CopyBundle type + its validator live in
// @mizrahitality/contracts (shared with #5/#6); only this thin wrapper — and the rendered-page DTO
// #5 will add — are owner-internal. The image lives on `Venue` (all 7 variants share it) and the
// body-typography is static per variant id (lib/templates.ts), so neither is in the stored blob.

import { SLOT_SCHEMA_VERSION, validateCopyBundle, type CopyBundle } from '@mizrahitality/contracts';

/** What `PageVariant.content` holds: the schema version + the validated copy bundle. */
export interface PageVariantContent {
  schemaVersion: typeof SLOT_SCHEMA_VERSION;
  copy: CopyBundle;
}

export type PageVariantContentResult =
  | { ok: true; value: PageVariantContent }
  | { ok: false; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse + re-validate a stored `PageVariant.content` blob: checks `schemaVersion` matches, then
 * runs `validateCopyBundle` on `copy`. Used by the builder's "Generated pages" list (and by #5's
 * renderer) to defend against stale or corrupted stored content.
 */
export function parsePageVariantContent(value: unknown): PageVariantContentResult {
  if (!isPlainObject(value)) return { ok: false, errors: ['stored content is not an object'] };
  if (value.schemaVersion !== SLOT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `stored content has schema version ${String(value.schemaVersion)}; expected ${SLOT_SCHEMA_VERSION}`,
      ],
    };
  }
  const copy = validateCopyBundle(value.copy);
  if (!copy.ok) return { ok: false, errors: copy.errors };
  return { ok: true, value: { schemaVersion: SLOT_SCHEMA_VERSION, copy: copy.value } };
}
