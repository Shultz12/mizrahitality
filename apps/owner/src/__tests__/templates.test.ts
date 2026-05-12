import { describe, expect, it } from 'vitest';
import { allVisitorVariants } from '@mizrahitality/contracts';
import {
  BASE_COPY_PROMPT,
  ENHANCE_DESCRIPTION_PROMPT,
  TEMPLATE_REGISTRY,
  allTemplateEntries,
  templateEntry,
} from '@/lib/templates';

// Coverage guard for the transcribed prompt assets (the plans/copy-rules/*.md files stay the
// source of truth; this catches a missed re-sync).

describe('templates registry', () => {
  it('has exactly 7 entries — one per visitor variant', () => {
    expect(allTemplateEntries()).toHaveLength(7);
    expect(new Set(Object.keys(TEMPLATE_REGISTRY))).toEqual(new Set(allVisitorVariants()));
  });

  it('templateEntry is defined for every variant', () => {
    for (const variant of allVisitorVariants()) {
      const entry = templateEntry(variant);
      expect(entry).toBeDefined();
      expect(entry.variant).toBe(variant);
    }
  });

  it('each persona block keeps its variant marker and "variant" instruction', () => {
    for (const entry of allTemplateEntries()) {
      expect(entry.personaBlock).toContain(`<!-- variant: ${entry.variant} -->`);
      expect(entry.personaBlock).toContain(`"variant": "${entry.variant}"`);
      expect(entry.personaLabel.length).toBeGreaterThan(0);
    }
  });

  it('every variant body type respects the 16px mobile minimum', () => {
    for (const entry of allTemplateEntries()) {
      expect(entry.typography.bodyFontSizePx).toBeGreaterThanOrEqual(16);
      expect(entry.typography.bodyLineHeight).toBeGreaterThan(0);
    }
  });
});

describe('prompt assets', () => {
  it('BASE_COPY_PROMPT is non-empty and carries the output contract', () => {
    expect(BASE_COPY_PROMPT.length).toBeGreaterThan(0);
    expect(BASE_COPY_PROMPT).toContain('"variant"');
    expect(BASE_COPY_PROMPT).toContain('"detailBullets"');
  });

  it('ENHANCE_DESCRIPTION_PROMPT is non-empty', () => {
    expect(ENHANCE_DESCRIPTION_PROMPT.length).toBeGreaterThan(0);
  });
});
