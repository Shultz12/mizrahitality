// The Gemini `responseSchema` for the per-variant copy call. Mirrors the `CopyBundle` shape from
// `@mizrahitality/contracts` (`copy.ts`) — keeps it next to the other AI plumbing so the contract
// author doesn't have to know SDK shape. JSON-shape failures become effectively impossible; the
// content-level rules (word/sentence counts, char caps — things JSON schema can't express) stay
// in `validateCopyBundle`, and the retry-with-error-feedback loop in `copy.ts` covers those.

import { Type, type Schema } from '@google/genai';
import { allVisitorVariants } from '@mizrahitality/contracts';

export const COPY_BUNDLE_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    variant: {
      type: Type.STRING,
      enum: allVisitorVariants(),
    },
    tagline: { type: Type.STRING },
    heroTrustPrimer: { type: Type.STRING },
    story: {
      type: Type.OBJECT,
      properties: {
        hook: { type: Type.STRING },
        detail: { type: Type.STRING },
        detailBullets: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        nudge: { type: Type.STRING },
      },
      required: ['hook', 'detail', 'detailBullets', 'nudge'],
      propertyOrdering: ['hook', 'detail', 'detailBullets', 'nudge'],
    },
    highlightStripLine: { type: Type.STRING },
    closingHeading: { type: Type.STRING },
    closingTrustLine: { type: Type.STRING },
  },
  required: [
    'variant',
    'tagline',
    'heroTrustPrimer',
    'story',
    'highlightStripLine',
    'closingHeading',
    'closingTrustLine',
  ],
  propertyOrdering: [
    'variant',
    'tagline',
    'heroTrustPrimer',
    'story',
    'highlightStripLine',
    'closingHeading',
    'closingTrustLine',
  ],
};
