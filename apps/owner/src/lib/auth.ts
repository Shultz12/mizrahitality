// Server-side auth for mizrahitality-owner: password hashing, opaque cookie sessions backed by
// a `Session` row, and the helpers that page/layout Server Components use to read or require the
// current owner. The raw session token lives only in the cookie; the DB stores only its HMAC.
//
// Not multi-tenant — tenancy is per-`Owner`. No session renewal: a fixed 30-day expiry, checked
// on every lookup (expired → row deleted, treated as signed-out). Demo-only — kept deliberately
// simple (no rate limiting, lockout, or CSRF beyond Server Actions' origin check + sameSite=lax).

import { createHmac, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import bcrypt from 'bcryptjs';
import type { Owner, Venue } from '@prisma/client';
import { prisma } from './prisma';
import { env } from './env';

export const SESSION_COOKIE_NAME = 'mizrahitality_owner_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const BCRYPT_COST = 10;

/** An owner plus their venue (`null` until the builder in #3 creates one). */
export type OwnerWithVenue = Owner & { venue: Venue | null };

// ---------------------------------------------------------------------------
// Crypto primitives (pure — unit-tested directly).
// ---------------------------------------------------------------------------

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** A 256-bit opaque session token, URL-safe. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Keyed digest of a session token — this (never the raw token) is what we store. */
export function hashSessionToken(token: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(token).digest('base64url');
}

// ---------------------------------------------------------------------------
// Cookie + session row management.
// ---------------------------------------------------------------------------

function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // dev runs on http://localhost, so `secure` would drop the cookie there.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** Mint a fresh 30-day session for `ownerId` and set the cookie. */
export async function createSession(ownerId: string): Promise<void> {
  const token = generateSessionToken();
  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      ownerId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  (await cookies()).set(SESSION_COOKIE_NAME, token, sessionCookieOptions(SESSION_TTL_MS / 1000));
}

/** Delete the current session row (if any) and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  jar.delete(SESSION_COOKIE_NAME);
}

/**
 * Resolve the owner behind a raw session token, or `null`. Does not touch `cookies()` — so it's
 * testable against a temp DB. Expired sessions are deleted on read and treated as signed-out.
 */
export async function resolveOwnerByToken(token: string): Promise<OwnerWithVenue | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { owner: { include: { venue: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }
  return session.owner;
}

// ---------------------------------------------------------------------------
// Request-scoped helpers for Server Components.
// ---------------------------------------------------------------------------

/**
 * The current owner, or `null` if signed out. Wrapped in React `cache()` so a layout and a page
 * in the same render don't double-query.
 */
export const getCurrentOwner = cache(async (): Promise<OwnerWithVenue | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? resolveOwnerByToken(token) : null;
});

/** The current owner, or redirect to `/sign-in`. The security boundary for `(authed)` routes. */
export async function requireOwner(): Promise<OwnerWithVenue> {
  const owner = await getCurrentOwner();
  if (!owner) redirect('/sign-in');
  return owner;
}
