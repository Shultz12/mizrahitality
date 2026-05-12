import { describe, expect, it } from 'vitest';
import {
  AGE_GROUPS,
  ANALYTICS_EVENT_TYPES,
  NEUTRAL_VISITOR_TYPE,
  SLOT_TYPES,
  VISITOR_GENDERS,
  allVisitorVariants,
  isVisitorType,
  parseVisitorType,
} from './index';

describe('visitor variants', () => {
  it('produces exactly 7 variants (6 typed + neutral)', () => {
    const variants = allVisitorVariants();
    expect(variants).toHaveLength(7);
    expect(variants).toHaveLength(VISITOR_GENDERS.length * AGE_GROUPS.length + 1);
  });

  it('has no duplicates and includes the neutral default', () => {
    const variants = allVisitorVariants();
    expect(new Set(variants).size).toBe(7);
    expect(variants).toContain(NEUTRAL_VISITOR_TYPE);
  });

  it('recognises every variant via isVisitorType', () => {
    for (const variant of allVisitorVariants()) {
      expect(isVisitorType(variant)).toBe(true);
    }
  });

  it('rejects unknown values', () => {
    expect(isVisitorType('alien')).toBe(false);
    expect(isVisitorType('male-99')).toBe(false);
    expect(isVisitorType(undefined)).toBe(false);
    expect(isVisitorType(42)).toBe(false);
  });

  it('parseVisitorType passes through valid values and falls back to neutral', () => {
    expect(parseVisitorType('male-18-30')).toBe('male-18-30');
    expect(parseVisitorType('female-50+')).toBe('female-50+');
    expect(parseVisitorType('bogus')).toBe('neutral');
    expect(parseVisitorType(null)).toBe('neutral');
    expect(parseVisitorType(undefined)).toBe('neutral');
  });
});

describe('slot & analytics constants', () => {
  it('slot types are rich-text and image (no title slot)', () => {
    expect([...SLOT_TYPES]).toEqual(['rich-text', 'image']);
  });

  it('analytics event types are visit / book-now-hover / book-now-click', () => {
    expect([...ANALYTICS_EVENT_TYPES]).toEqual(['visit', 'book-now-hover', 'book-now-click']);
  });
});
