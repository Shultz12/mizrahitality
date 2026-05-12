import { describe, expect, it } from 'vitest';
import {
  COPY_BUNDLE_CONSTRAINTS,
  SLOT_SCHEMA_VERSION,
  parseCopyBundle,
  validateCopyBundle,
  type CopyBundle,
} from './copy';

// A fully-valid bundle: tagline 12 words, hook 2 sentences, nudge 1 sentence, detailBullets [].
function validBundle(overrides: Partial<CopyBundle> = {}): CopyBundle {
  return {
    variant: 'male-18-30',
    tagline: 'A genuinely calm and comfortable place to stay near everything that matters', // 12 words
    heroTrustPrimer: 'Takes less than two minutes.',
    story: {
      hook: 'You want a stay that just works. This place gives you exactly that.',
      detail:
        'Comfortable rooms, a quiet setting, and an easy location make this a straightforward choice for a short trip.',
      detailBullets: [],
      nudge: 'Your dates are still open right now.',
    },
    highlightStripLine: 'Comfort, quiet, and a location that just works.',
    closingHeading: 'Your stay is waiting',
    closingTrustLine: 'Instant confirmation.',
    ...overrides,
  };
}

describe('SLOT_SCHEMA_VERSION', () => {
  it('is 1 and matches COPY_BUNDLE_CONSTRAINTS.schemaVersion', () => {
    expect(SLOT_SCHEMA_VERSION).toBe(1);
    expect(COPY_BUNDLE_CONSTRAINTS.schemaVersion).toBe(SLOT_SCHEMA_VERSION);
  });
});

describe('validateCopyBundle — accepts good bundles', () => {
  it('accepts a fully-valid bundle and trims string fields', () => {
    const result = validateCopyBundle(
      validBundle({
        tagline: '  A genuinely calm and comfortable place to stay near everything that matters  ',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tagline).toBe(
        'A genuinely calm and comfortable place to stay near everything that matters',
      );
      expect(result.value.story.detailBullets).toEqual([]);
    }
  });

  it('accepts detailBullets of length 3 and 4', () => {
    for (const n of [3, 4]) {
      const bullets = Array.from({ length: n }, (_v, i) => `Point ${i + 1}`);
      const result = validateCopyBundle(
        validBundle({ story: { ...validBundle().story, detailBullets: bullets } }),
      );
      expect(result.ok, `length ${n}`).toBe(true);
    }
  });

  it('drops blank bullets when that still leaves a valid count', () => {
    const result = validateCopyBundle(
      validBundle({ story: { ...validBundle().story, detailBullets: ['  a  ', 'b', '   ', 'c'] } }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.story.detailBullets).toEqual(['a', 'b', 'c']);
  });
});

describe('validateCopyBundle — rejects bad bundles', () => {
  function expectFail(value: unknown): string[] {
    const result = validateCopyBundle(value);
    expect(result.ok).toBe(false);
    return result.ok ? [] : result.errors;
  }

  it('rejects a tagline that is too short, too long, or over the char cap', () => {
    expect(
      expectFail(validBundle({ tagline: 'Short and sweet and to the point' })).join(' '),
    ).toMatch(/tagline/); // 7 words
    expect(
      expectFail(
        validBundle({
          tagline:
            'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone',
        }),
      ).join(' '),
    ).toMatch(/tagline/); // 21 words
    const longTagline = Array.from({ length: 15 }, () => 'accommodating').join(' '); // 15 words, ~209 chars
    expect(expectFail(validBundle({ tagline: longTagline })).join(' ')).toMatch(/tagline.*200/);
  });

  it('rejects detailBullets of length 1, 2, and 5', () => {
    for (const n of [1, 2, 5]) {
      const bullets = Array.from({ length: n }, (_v, i) => `Point ${i + 1}`);
      const errors = expectFail(
        validBundle({ story: { ...validBundle().story, detailBullets: bullets } }),
      );
      expect(errors.join(' '), `length ${n}`).toMatch(/detailBullets/);
    }
  });

  it('rejects a missing tagline', () => {
    const bad: Record<string, unknown> = { ...validBundle() };
    delete bad.tagline;
    expect(expectFail(bad).join(' ')).toMatch(/tagline/);
  });

  it('rejects story that is not an object', () => {
    expect(
      expectFail(validBundle({ story: 'nope' as unknown as CopyBundle['story'] })).join(' '),
    ).toMatch(/story/);
  });

  it('rejects an empty story.hook', () => {
    expect(
      expectFail(validBundle({ story: { ...validBundle().story, hook: '   ' } })).join(' '),
    ).toMatch(/story\.hook/);
  });

  it('rejects a 1-sentence hook fragment', () => {
    expect(
      expectFail(
        validBundle({
          story: {
            ...validBundle().story,
            hook: 'A short hook that has no terminal punctuation at all here',
          },
        }),
      ).join(' '),
    ).toMatch(/story\.hook.*sentence/);
  });

  it('rejects a 3-sentence nudge run', () => {
    expect(
      expectFail(
        validBundle({
          story: { ...validBundle().story, nudge: 'Act now. Time is short. Do not wait.' },
        }),
      ).join(' '),
    ).toMatch(/story\.nudge.*sentence/);
  });

  it('rejects an unknown variant', () => {
    expect(
      expectFail(validBundle({ variant: 'alien' as unknown as CopyBundle['variant'] })).join(' '),
    ).toMatch(/variant/);
    expect(
      expectFail(validBundle({ variant: 'male-99' as unknown as CopyBundle['variant'] })).join(' '),
    ).toMatch(/variant/);
  });

  it('rejects a too-long bullet', () => {
    const bullets = ['x'.repeat(200), 'short two', 'short three'];
    expect(
      expectFail(validBundle({ story: { ...validBundle().story, detailBullets: bullets } })).join(
        ' ',
      ),
    ).toMatch(/detailBullets\[0\]/);
  });

  it('rejects non-object values', () => {
    for (const value of ['a string', [1, 2, 3], null, 42]) {
      expect(validateCopyBundle(value).ok, JSON.stringify(value)).toBe(false);
    }
  });

  it('collects every violation when several apply', () => {
    const errors = expectFail({
      variant: 'alien',
      tagline: 'too short',
      heroTrustPrimer: 123,
      story: { hook: '', detail: '', nudge: '', detailBullets: 'not an array' },
      highlightStripLine: '',
      closingHeading: '',
      closingTrustLine: 5,
    });
    expect(errors.length).toBeGreaterThan(1);
  });
});

describe('parseCopyBundle', () => {
  it('parses a bare valid JSON object', () => {
    expect(parseCopyBundle(JSON.stringify(validBundle())).ok).toBe(true);
  });

  it('parses the same object inside a ```json fence', () => {
    expect(parseCopyBundle('```json\n' + JSON.stringify(validBundle()) + '\n```').ok).toBe(true);
  });

  it('parses the same object with leading prose', () => {
    expect(
      parseCopyBundle('Here is the JSON you asked for:\n' + JSON.stringify(validBundle())).ok,
    ).toBe(true);
  });

  it('fails on text with no JSON object', () => {
    const result = parseCopyBundle('not json at all');
    expect(result.ok).toBe(false);
  });

  it('fails (with structural errors) on a JSON object that is not a copy bundle', () => {
    const result = parseCopyBundle('{"foo":1}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it('fails on malformed JSON', () => {
    expect(parseCopyBundle('{ bad json').ok).toBe(false);
  });
});
