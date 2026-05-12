import { describe, expect, it } from 'vitest';
import {
  VENUE_DESCRIPTION_MAX_LENGTH,
  VENUE_NAME_MAX_LENGTH,
  normalizeVenueName,
  validateVenueDescription,
  validateVenueName,
} from '@/lib/validation';

describe('normalizeVenueName', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizeVenueName('  Blue   Lagoon  ')).toBe('Blue Lagoon');
  });
});

describe('validateVenueName', () => {
  it('accepts English-letter words separated by single spaces', () => {
    expect(validateVenueName('Blue Lagoon')).toEqual({ ok: true, value: 'Blue Lagoon' });
    expect(validateVenueName('Cafe')).toEqual({ ok: true, value: 'Cafe' });
  });

  it('collapses internal whitespace before validating', () => {
    expect(validateVenueName('Blue   Lagoon')).toEqual({ ok: true, value: 'Blue Lagoon' });
  });

  it('rejects empty / whitespace-only names', () => {
    expect(validateVenueName('').ok).toBe(false);
    expect(validateVenueName('   ').ok).toBe(false);
  });

  it('rejects digits, punctuation, and accented characters', () => {
    expect(validateVenueName('Cafe 2').ok).toBe(false);
    expect(validateVenueName('Café').ok).toBe(false);
    expect(validateVenueName('Bar & Grill').ok).toBe(false);
    expect(validateVenueName('😀').ok).toBe(false);
  });

  it(`rejects names longer than ${VENUE_NAME_MAX_LENGTH} characters`, () => {
    expect(validateVenueName('a'.repeat(VENUE_NAME_MAX_LENGTH)).ok).toBe(true);
    expect(validateVenueName('a'.repeat(VENUE_NAME_MAX_LENGTH + 1)).ok).toBe(false);
  });
});

describe('validateVenueDescription', () => {
  it('accepts an empty description', () => {
    expect(validateVenueDescription('')).toEqual({ ok: true, value: '' });
    expect(validateVenueDescription('   ')).toEqual({ ok: true, value: '' });
  });

  it('trims and accepts text up to the cap', () => {
    expect(validateVenueDescription('  A cosy place by the sea.  ')).toEqual({
      ok: true,
      value: 'A cosy place by the sea.',
    });
    expect(validateVenueDescription('x'.repeat(VENUE_DESCRIPTION_MAX_LENGTH)).ok).toBe(true);
  });

  it('rejects text longer than the cap', () => {
    expect(validateVenueDescription('x'.repeat(VENUE_DESCRIPTION_MAX_LENGTH + 1)).ok).toBe(false);
  });
});
