// The "copy bundle" — the per-audience copy Claude returns at publish time, plus the validator
// and parser the owner app runs before storing it. This is the shared half of the slot contract:
// #5 (published-page-ssr) renders a CopyBundle and #6 (analytics-api) serves it, so both need the
// type and `validateCopyBundle`. The owner-internal wrapper actually persisted on
// `PageVariant.content` — `{ schemaVersion, copy }` — lives in apps/owner/src/lib/page-variant.ts,
// not here (the *rendered-page* DTO, which folds in the image URL + body typography + fixed
// strings, is feature #5's). The output shape below mirrors plans/copy-rules/_BASE-PROMPT.md
// exactly; the constraint numbers are deliberately lenient — see COPY_BUNDLE_CONSTRAINTS.

import { isVisitorType, type VisitorType } from './visitor';

/**
 * Versions the copy-bundle / slot contract and the stored `PageVariant.content` blob. Bump if the
 * bundle shape changes — lets #5/#9 detect stale stored content.
 */
export const SLOT_SCHEMA_VERSION = 1 as const;

/** Zone 2 — exactly three paragraphs of story copy. */
export interface CopyStory {
  /** Zone 2 ¶1 — 2–3 sentences; acknowledges this audience's desires. */
  hook: string;
  /** Zone 2 ¶2 prose — what makes the venue special. */
  detail: string;
  /** `[]` or 3–4 short bullet points rendered inside ¶2. */
  detailBullets: string[];
  /** Zone 2 ¶3 — 1–2 sentences; emotional appeal to act. */
  nudge: string;
}

/** One audience's copy bundle — the exact JSON contract from plans/copy-rules/_BASE-PROMPT.md. */
export interface CopyBundle {
  /** Must equal the persona block's variant id. */
  variant: VisitorType;
  /** Zone 1 H2 — strictly 10–20 words; the audience's "Dream Outcome". */
  tagline: string;
  /** Micro-copy under the hero "Book Now" — a friction-reducer. */
  heroTrustPrimer: string;
  /** Zone 2 — exactly 3 paragraphs. */
  story: CopyStory;
  /** Zone 3 highlight band — one punchy line. */
  highlightStripLine: string;
  /** Zone 4 H3 above the closing "Book Now". */
  closingHeading: string;
  /** Micro-copy under the closing "Book Now". */
  closingTrustLine: string;
}

/**
 * Every length / word / count rule for a {@link CopyBundle}, with concrete numbers.
 *
 * Leniency principle: the blueprint's HARD rules are enforced exactly (tagline 10–20 words; story
 * = 3 non-empty paragraphs, hook 2–3 sentences, nudge 1–2; detailBullets `[]` or 3–4), but every
 * char cap below is deliberately WIDER than the persona guidance — these bounds catch overflow /
 * underfill and structural breaks, not prose quality, so a good-faith Claude reply passes on the
 * first try. Tighten only if real generations consistently overflow.
 */
export const COPY_BUNDLE_CONSTRAINTS = {
  schemaVersion: SLOT_SCHEMA_VERSION,
  tagline: { minWords: 10, maxWords: 20, maxChars: 200 }, // blueprint hard rule: "strictly 10–20 words"
  heroTrustPrimer: { minChars: 1, maxChars: 120 },
  story: {
    hook: { minChars: 20, maxChars: 600, minSentences: 2, maxSentences: 3 }, // "2–3 sentences"
    detail: { minChars: 40, maxChars: 1400 },
    nudge: { minChars: 15, maxChars: 400, minSentences: 1, maxSentences: 2 }, // "1–2 sentences"
    detailBullets: {
      allowEmpty: true,
      minItems: 3,
      maxItems: 4,
      itemMinChars: 1,
      itemMaxChars: 160,
    }, // "[] or 3–4"
  },
  highlightStripLine: { minChars: 8, maxChars: 200 },
  closingHeading: { minChars: 3, maxChars: 80 },
  closingTrustLine: { minChars: 1, maxChars: 120 },
} as const;

export type CopyBundleResult = { ok: true; value: CopyBundle } | { ok: false; errors: string[] };

// --- private pure helpers ---------------------------------------------------------------------
// Crude but deterministic — for catching gross violations, not grading prose.

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function countSentences(s: string): number {
  const trimmed = s.trim();
  if (trimmed.length === 0) return 0;
  const matches = trimmed.match(/[.!?]+(\s|$)/g);
  return matches && matches.length > 0 ? matches.length : 1;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// --- validation -------------------------------------------------------------------------------

/**
 * Validate an arbitrary value against the {@link CopyBundle} contract + {@link COPY_BUNDLE_CONSTRAINTS}.
 * Pure, zero-dependency. Collects *all* errors (never bails on the first — the retry nudge wants
 * the full list). On success the returned bundle has every string field `.trim()`med (and empty
 * bullets dropped, provided that still leaves a valid count).
 */
export function validateCopyBundle(value: unknown): CopyBundleResult {
  if (!isPlainObject(value)) {
    return { ok: false, errors: ['copy bundle must be a JSON object'] };
  }

  const C = COPY_BUNDLE_CONSTRAINTS;
  const errors: string[] = [];

  // (b) variant
  if (!isVisitorType(value.variant)) {
    errors.push(`variant must be one of the 7 visitor types; got ${JSON.stringify(value.variant)}`);
  }

  // (c)+(d) the simple top-level string fields: required, a string, within char bounds.
  function checkString(
    name: string,
    raw: unknown,
    bounds: { minChars: number; maxChars: number },
  ): void {
    if (typeof raw !== 'string') {
      errors.push(`${name} is required and must be a string`);
      return;
    }
    const len = raw.trim().length;
    if (len < bounds.minChars)
      errors.push(`${name} is too short (min ${bounds.minChars} characters)`);
    if (len > bounds.maxChars)
      errors.push(`${name} is too long (max ${bounds.maxChars} characters)`);
  }

  // tagline — word count + a char cap.
  if (typeof value.tagline !== 'string') {
    errors.push('tagline is required and must be a string');
  } else {
    const words = countWords(value.tagline);
    if (words < C.tagline.minWords || words > C.tagline.maxWords) {
      errors.push(
        `tagline must be ${C.tagline.minWords}–${C.tagline.maxWords} words; got ${words}`,
      );
    }
    if (value.tagline.trim().length > C.tagline.maxChars) {
      errors.push(`tagline is too long (max ${C.tagline.maxChars} characters)`);
    }
  }

  checkString('heroTrustPrimer', value.heroTrustPrimer, C.heroTrustPrimer);
  checkString('highlightStripLine', value.highlightStripLine, C.highlightStripLine);
  checkString('closingHeading', value.closingHeading, C.closingHeading);
  checkString('closingTrustLine', value.closingTrustLine, C.closingTrustLine);

  // story — a plain object with hook/detail/nudge strings + a detailBullets string[].
  let cleanedBullets: string[] = [];
  if (!isPlainObject(value.story)) {
    errors.push('story is required and must be an object');
  } else {
    const story = value.story;

    if (typeof story.hook !== 'string') {
      errors.push('story.hook is required and must be a string');
    } else {
      const len = story.hook.trim().length;
      if (len < C.story.hook.minChars)
        errors.push(`story.hook is too short (min ${C.story.hook.minChars} characters)`);
      if (len > C.story.hook.maxChars)
        errors.push(`story.hook is too long (max ${C.story.hook.maxChars} characters)`);
      const sentences = countSentences(story.hook);
      if (sentences < C.story.hook.minSentences || sentences > C.story.hook.maxSentences) {
        errors.push(
          `story.hook must be ${C.story.hook.minSentences}–${C.story.hook.maxSentences} sentences; got ${sentences}`,
        );
      }
    }

    if (typeof story.detail !== 'string') {
      errors.push('story.detail is required and must be a string');
    } else {
      const len = story.detail.trim().length;
      if (len < C.story.detail.minChars)
        errors.push(`story.detail is too short (min ${C.story.detail.minChars} characters)`);
      if (len > C.story.detail.maxChars)
        errors.push(`story.detail is too long (max ${C.story.detail.maxChars} characters)`);
    }

    if (typeof story.nudge !== 'string') {
      errors.push('story.nudge is required and must be a string');
    } else {
      const len = story.nudge.trim().length;
      if (len < C.story.nudge.minChars)
        errors.push(`story.nudge is too short (min ${C.story.nudge.minChars} characters)`);
      if (len > C.story.nudge.maxChars)
        errors.push(`story.nudge is too long (max ${C.story.nudge.maxChars} characters)`);
      const sentences = countSentences(story.nudge);
      if (sentences < C.story.nudge.minSentences || sentences > C.story.nudge.maxSentences) {
        errors.push(
          `story.nudge must be ${C.story.nudge.minSentences}–${C.story.nudge.maxSentences} sentences; got ${sentences}`,
        );
      }
    }

    if (
      !Array.isArray(story.detailBullets) ||
      !story.detailBullets.every((b): b is string => typeof b === 'string')
    ) {
      errors.push('story.detailBullets is required and must be an array of strings');
    } else {
      const { minItems, maxItems, itemMaxChars } = C.story.detailBullets;
      cleanedBullets = story.detailBullets.map((b) => b.trim()).filter((b) => b.length > 0);
      if (
        cleanedBullets.length !== 0 &&
        (cleanedBullets.length < minItems || cleanedBullets.length > maxItems)
      ) {
        errors.push(
          `story.detailBullets must be empty or have ${minItems}–${maxItems} items; got ${cleanedBullets.length}`,
        );
      }
      cleanedBullets.forEach((b, i) => {
        if (b.length > itemMaxChars)
          errors.push(`story.detailBullets[${i}] is too long (max ${itemMaxChars} characters)`);
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // Every check passed — narrow and build the trimmed bundle. (The casts are safe: validated above.)
  const story = value.story as Record<string, unknown>;
  const trimmed: CopyBundle = {
    variant: value.variant as VisitorType,
    tagline: (value.tagline as string).trim(),
    heroTrustPrimer: (value.heroTrustPrimer as string).trim(),
    story: {
      hook: (story.hook as string).trim(),
      detail: (story.detail as string).trim(),
      detailBullets: cleanedBullets,
      nudge: (story.nudge as string).trim(),
    },
    highlightStripLine: (value.highlightStripLine as string).trim(),
    closingHeading: (value.closingHeading as string).trim(),
    closingTrustLine: (value.closingTrustLine as string).trim(),
  };
  return { ok: true, value: trimmed };
}

/**
 * Defensively extract a JSON object from Claude's raw reply, then {@link validateCopyBundle} it:
 * strips a leading/trailing ```` ```json ```` / ```` ``` ```` fence, falls back to the first `{`
 * through the last `}`, then `JSON.parse`s in a try/catch. The base prompt forbids fences/prose
 * around the JSON, but a good model occasionally adds them anyway — this absorbs that.
 */
export function parseCopyBundle(rawText: string): CopyBundleResult {
  let text = rawText.trim();

  // Strip a code fence (``` or ```json … ```), if the reply got wrapped in one despite the prompt.
  if (text.startsWith('```')) {
    text = text
      .replace(/^```[^\n]*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim();
  }

  // If it still isn't a bare object, take the substring from the first `{` to the last `}`.
  if (!text.startsWith('{')) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1 || last < first) {
      return { ok: false, errors: ['reply did not contain a JSON object'] };
    }
    text = text.slice(first, last + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      errors: [`reply was not valid JSON: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  return validateCopyBundle(parsed);
}
