import { describe, expect, it } from 'vitest';
import {
  SLOT_SCHEMA_VERSION,
  allVisitorVariants,
  validateCopyBundle,
} from '@mizrahitality/contracts';
import { parsePageVariantContent } from '@/lib/page-variant';
import hotelMizrahi from '../../../../scripts/seed-data/hotel-mizrahi.json';
import theLevantHouse from '../../../../scripts/seed-data/the-levant-house.json';

// `scripts/seed.mjs` (feature #9 demo-seed) ships canned, committed `CopyBundle` JSON — one file
// per demo venue, keyed by the 7 `VisitorType` strings — so the seed needs no ANTHROPIC_API_KEY.
// This pure (DB-less) test is the drift guard: every canned bundle must still validate, carry the
// right `variant`, and wrap cleanly into the `PageVariant.content` blob `parsePageVariantContent`
// expects, and each file must cover exactly the 7 visitor variants.

const SEED_DATA_FILES: Record<string, Record<string, unknown>> = {
  'hotel-mizrahi.json': hotelMizrahi,
  'the-levant-house.json': theLevantHouse,
};

describe('seed canned copy bundles', () => {
  for (const [fileName, byVariant] of Object.entries(SEED_DATA_FILES)) {
    describe(fileName, () => {
      it('covers exactly the 7 visitor variants', () => {
        expect(new Set(Object.keys(byVariant))).toEqual(new Set(allVisitorVariants()));
      });

      for (const [variant, bundle] of Object.entries(byVariant)) {
        it(`${variant}: validates, matches its key, and wraps into PageVariant.content`, () => {
          const result = validateCopyBundle(bundle);
          expect(result.ok ? null : result.errors.join('; ')).toBeNull();
          expect((bundle as { variant?: unknown }).variant).toBe(variant);

          const wrapped = parsePageVariantContent({
            schemaVersion: SLOT_SCHEMA_VERSION,
            copy: bundle,
          });
          expect(wrapped.ok).toBe(true);
        });
      }
    });
  }
});
