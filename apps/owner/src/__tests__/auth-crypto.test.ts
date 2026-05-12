import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashPassword, hashSessionToken, verifyPassword } from '@/lib/auth';

// The stable test SESSION_SECRET comes from vitest.config.ts; hashSessionToken relies on it.

describe('password hashing', () => {
  it('round-trips: the right password verifies, a wrong one does not', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });
});

describe('generateSessionToken', () => {
  it('returns distinct ~43-char base64url strings', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    // 32 random bytes → 43 base64url chars (no padding).
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('hashSessionToken', () => {
  it('is deterministic for a fixed secret and token', () => {
    expect(hashSessionToken('token-abc')).toBe(hashSessionToken('token-abc'));
  });

  it('varies with the token', () => {
    expect(hashSessionToken('token-abc')).not.toBe(hashSessionToken('token-xyz'));
  });

  it('produces a base64url digest, not the raw token', () => {
    const digest = hashSessionToken('token-abc');
    expect(digest).not.toBe('token-abc');
    expect(digest).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('varies with the secret', () => {
    const withOtherSecret = createHmac('sha256', 'a-different-secret')
      .update('token-abc')
      .digest('base64url');
    expect(hashSessionToken('token-abc')).not.toBe(withOtherSecret);
  });
});
