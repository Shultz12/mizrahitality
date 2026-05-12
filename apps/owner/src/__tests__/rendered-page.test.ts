import { describe, expect, it } from 'vitest';
import {
  BOOK_NOW_LABEL,
  POWERED_BY_TEXT,
  RENDERED_PAGE_SCHEMA_VERSION,
  SLOT_SCHEMA_VERSION,
  type CopyBundle,
  type VisitorType,
} from '@mizrahitality/contracts';
import { buildRenderedPage } from '@/lib/rendered-page';
import { templateEntry } from '@/lib/templates';

// `buildRenderedPage` is pure (no DB) — exercised here with synthetic `PageVariant` rows.

function bundle(variant: VisitorType): CopyBundle {
  return {
    variant,
    tagline: 'A genuinely calm and comfortable place to stay near everything that matters here', // 13 words
    heroTrustPrimer: 'Takes less than two minutes.',
    story: {
      hook: 'You want a stay that just works. This place gives you exactly that.',
      detail:
        'Comfortable rooms, a quiet setting, and an easy location make this a straightforward choice.',
      detailBullets: ['Fast Wi-Fi', 'Easy check-in', 'Great location'],
      nudge: 'Your dates are still open right now.',
    },
    highlightStripLine: 'Comfort, quiet, and a location that just works.',
    closingHeading: 'Your stay is waiting',
    closingTrustLine: 'Instant confirmation.',
  };
}

/** A stored `PageVariant.content` row whose copy bundle's `variant` matches `variant`. */
function variantRow(variant: VisitorType) {
  return {
    visitorType: variant,
    content: { schemaVersion: SLOT_SCHEMA_VERSION, copy: bundle(variant) },
  };
}

const stockVenue = {
  name: 'Blue Lagoon',
  slug: 'bluelagoon',
  imageKind: 'stock',
  imageValue: 'atlantis-paradise',
};
const uploadVenue = {
  name: 'Blue Lagoon',
  slug: 'bluelagoon',
  imageKind: 'upload',
  imageValue: 'venues/abc123/photo.jpg',
};

const allRows = [variantRow('male-18-30'), variantRow('female-50+'), variantRow('neutral')];

describe('buildRenderedPage', () => {
  it('builds the DTO for a requested variant — copy, typography, fixed strings, schemaVersion', () => {
    const r = buildRenderedPage({
      venue: stockVenue,
      variants: allRows,
      requestedType: 'female-50+',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.schemaVersion).toBe(RENDERED_PAGE_SCHEMA_VERSION);
    expect(r.value.visitorType).toBe('female-50+');
    expect(r.value.copy.variant).toBe('female-50+');
    expect(r.value.venueName).toBe('Blue Lagoon');
    expect(r.value.slug).toBe('bluelagoon');
    expect(r.value.imageAlt).toContain('Blue Lagoon');
    expect(r.value.typography).toEqual({
      bodyFontSizePx: templateEntry('female-50+').typography.bodyFontSizePx,
      bodyLineHeight: templateEntry('female-50+').typography.bodyLineHeight,
    });
    expect(r.value.fixed).toEqual({ ctaLabel: BOOK_NOW_LABEL, poweredBy: POWERED_BY_TEXT });
  });

  it('uses the served variant’s typography (per-variant differs from the neutral default)', () => {
    const male = buildRenderedPage({
      venue: stockVenue,
      variants: allRows,
      requestedType: 'male-18-30',
    });
    expect(male.ok && male.value.typography).toEqual(templateEntry('male-18-30').typography);
    const neutral = buildRenderedPage({
      venue: stockVenue,
      variants: allRows,
      requestedType: 'neutral',
    });
    expect(neutral.ok && neutral.value.typography).toEqual(templateEntry('neutral').typography);
  });

  it('falls back to the neutral row when the requested variant has no stored row', () => {
    const rowsWithoutMale = [variantRow('female-50+'), variantRow('neutral')];
    const r = buildRenderedPage({
      venue: stockVenue,
      variants: rowsWithoutMale,
      requestedType: 'male-18-30',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.visitorType).toBe('neutral');
    expect(r.value.copy.variant).toBe('neutral');
  });

  it('resolves a known stock-image id to its public path', () => {
    const r = buildRenderedPage({ venue: stockVenue, variants: allRows, requestedType: 'neutral' });
    expect(r.ok && r.value.imageUrl).toBe('/stock/atlantis-paradise.jpg');
  });

  it('resolves an unknown stock id to /stock/<id>.jpg', () => {
    const r = buildRenderedPage({
      venue: { ...stockVenue, imageValue: 'mystery' },
      variants: allRows,
      requestedType: 'neutral',
    });
    expect(r.ok && r.value.imageUrl).toBe('/stock/mystery.jpg');
  });

  it('builds an /uploads/ URL for an uploaded image', () => {
    const r = buildRenderedPage({
      venue: uploadVenue,
      variants: allRows,
      requestedType: 'neutral',
    });
    expect(r.ok && r.value.imageUrl).toBe('/uploads/venues/abc123/photo.jpg');
  });

  it('absolutizes the image URL against a baseUrl when given', () => {
    const r = buildRenderedPage({
      venue: stockVenue,
      variants: allRows,
      requestedType: 'neutral',
      baseUrl: 'http://localhost:5111',
    });
    expect(r.ok && r.value.imageUrl).toBe('http://localhost:5111/stock/atlantis-paradise.jpg');

    const u = buildRenderedPage({
      venue: uploadVenue,
      variants: allRows,
      requestedType: 'neutral',
      baseUrl: 'http://example.test',
    });
    expect(u.ok && u.value.imageUrl).toBe('http://example.test/uploads/venues/abc123/photo.jpg');
  });

  it('fails when there is no variant row at all', () => {
    const r = buildRenderedPage({ venue: stockVenue, variants: [], requestedType: 'neutral' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/re-publish/i);
  });

  it('fails when the stored content is unparseable (stale schema version)', () => {
    const r = buildRenderedPage({
      venue: stockVenue,
      variants: [{ visitorType: 'neutral', content: { schemaVersion: 999, copy: {} } }],
      requestedType: 'neutral',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unreadable/i);
  });

  it('fails when the stored content is missing entirely', () => {
    const r = buildRenderedPage({
      venue: stockVenue,
      variants: [{ visitorType: 'neutral', content: null }],
      requestedType: 'neutral',
    });
    expect(r.ok).toBe(false);
  });
});
