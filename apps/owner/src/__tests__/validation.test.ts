import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from '@/lib/validation';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Owner@Example.COM  ')).toBe('owner@example.com');
  });
});

describe('validateEmail', () => {
  it('rejects an empty email', () => {
    expect(validateEmail('')).toEqual({ ok: false, message: expect.any(String) });
    expect(validateEmail('   ')).toEqual({ ok: false, message: expect.any(String) });
  });

  it('rejects an address with no "@"', () => {
    expect(validateEmail('not-an-email').ok).toBe(false);
  });

  it('rejects an address with no dot in the domain', () => {
    expect(validateEmail('owner@example').ok).toBe(false);
  });

  it('rejects an address with whitespace', () => {
    expect(validateEmail('own er@example.com').ok).toBe(false);
    expect(validateEmail('owner@exa mple.com').ok).toBe(false);
  });

  it('rejects an address longer than 254 chars', () => {
    const long = `${'a'.repeat(250)}@b.co`; // 250 + 5 = 255
    expect(validateEmail(long).ok).toBe(false);
  });

  it('accepts and normalizes a valid address', () => {
    expect(validateEmail('  Owner@Example.com ')).toEqual({ ok: true, value: 'owner@example.com' });
  });
});

describe('validatePassword', () => {
  it('rejects an empty password', () => {
    expect(validatePassword('').ok).toBe(false);
  });

  it(`rejects a password shorter than ${PASSWORD_MIN_LENGTH} chars`, () => {
    expect(validatePassword('short12').ok).toBe(false); // 7 chars
  });

  it(`accepts a password of exactly ${PASSWORD_MIN_LENGTH} chars`, () => {
    expect(validatePassword('12345678')).toEqual({ ok: true, value: '12345678' });
  });

  it('does not trim the password', () => {
    const padded = '  spaces  '; // 10 chars including the spaces
    expect(validatePassword(padded)).toEqual({ ok: true, value: padded });
  });

  it('rejects a password longer than 72 UTF-8 bytes', () => {
    expect(validatePassword('a'.repeat(73)).ok).toBe(false);
    // 24 three-byte characters = 72 bytes (OK); 25 = 75 bytes (rejected).
    expect(validatePassword('あ'.repeat(24)).ok).toBe(true);
    expect(validatePassword('あ'.repeat(25)).ok).toBe(false);
  });
});
