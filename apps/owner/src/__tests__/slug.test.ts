import { describe, expect, it } from 'vitest';
import { deriveSlugBase, nextAvailableSlug } from '@/lib/slug';

describe('deriveSlugBase', () => {
  it('lowercases and strips spaces', () => {
    expect(deriveSlugBase('Blue Lagoon')).toBe('bluelagoon');
    expect(deriveSlugBase('Cafe')).toBe('cafe');
  });

  it('collapses any whitespace and strips non-letters defensively', () => {
    expect(deriveSlugBase('Blue   Lagoon')).toBe('bluelagoon');
    expect(deriveSlugBase('Bar & Grill 2')).toBe('bargrill');
  });
});

describe('nextAvailableSlug', () => {
  const takenSet = (...slugs: string[]) => {
    const set = new Set(slugs);
    return (slug: string) => Promise.resolve(set.has(slug));
  };

  it('returns the base when nothing is taken', async () => {
    expect(await nextAvailableSlug('cafe', takenSet())).toBe('cafe');
  });

  it('appends the first free numeric suffix', async () => {
    expect(await nextAvailableSlug('cafe', takenSet('cafe', 'cafe2'))).toBe('cafe3');
    expect(await nextAvailableSlug('cafe', takenSet('cafe'))).toBe('cafe2');
  });

  it('does not bump when the rename predicate excludes the venue’s own slug', async () => {
    // Rename case: every other venue's slug counts as taken, but the venue's own ("cafe") doesn't —
    // so re-deriving "cafe" returns "cafe" unchanged even though the slug "exists".
    const ownSlug = 'cafe';
    const otherVenueSlugs = new Set(['bistro', 'bistro2']);
    const isTaken = (slug: string) =>
      Promise.resolve(slug !== ownSlug && otherVenueSlugs.has(slug));
    expect(await nextAvailableSlug('cafe', isTaken)).toBe('cafe');
  });
});
