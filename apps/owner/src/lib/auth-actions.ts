'use server';

// Server Actions for owner sign-up / sign-in / sign-out. Thin wrappers over `auth.ts` +
// `validation.ts` — exercised by the manual click-through, not unit tests. `redirect()` throws a
// control-flow signal, so every redirect is on the action's happy path, never inside a try/catch.

import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import { createSession, destroySession, hashPassword, verifyPassword } from './auth';
import { normalizeEmail, validateEmail, validatePassword } from './validation';

export type AuthState = {
  /** Top-level error (sign-in uses only this — a generic message). */
  error?: string;
  /** Per-field errors (sign-up). */
  fieldErrors?: { email?: string; password?: string };
  /** The typed email, echoed back so a rejected submit repopulates it. Never echo the password. */
  values?: { email?: string };
};

const GENERIC_SIGN_IN_ERROR = 'Invalid email or password.';
// A well-formed bcrypt hash that nothing matches — compared against in the not-found branch so
// sign-in spends ~equal time whether or not the email exists.
const DUMMY_BCRYPT_HASH = '$2a$12$' + 'x'.repeat(53);

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const rawEmail = String(formData.get('email') ?? '');
  const rawPassword = String(formData.get('password') ?? '');

  const email = validateEmail(rawEmail);
  const password = validatePassword(rawPassword);

  if (!email.ok || !password.ok) {
    const fieldErrors: { email?: string; password?: string } = {};
    if (!email.ok) fieldErrors.email = email.message;
    if (!password.ok) fieldErrors.password = password.message;
    return { fieldErrors, values: { email: rawEmail } };
  }

  const existing = await prisma.owner.findUnique({ where: { email: email.value } });
  if (existing) {
    return {
      fieldErrors: { email: 'That email is already registered. Try signing in instead.' },
      values: { email: email.value },
    };
  }

  const owner = await prisma.owner.create({
    data: { email: email.value, passwordHash: await hashPassword(password.value) },
  });
  await createSession(owner.id);
  redirect('/dashboard');
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const rawEmail = String(formData.get('email') ?? '');
  const rawPassword = String(formData.get('password') ?? '');

  // Sign-in only checks the email is well-formed and the password is non-empty — never reveals
  // whether the account exists, so any mismatch yields the same generic message.
  const email = validateEmail(rawEmail);
  if (!email.ok || rawPassword.length === 0) {
    return { error: GENERIC_SIGN_IN_ERROR, values: { email: normalizeEmail(rawEmail) } };
  }

  const owner = await prisma.owner.findUnique({ where: { email: email.value } });
  if (!owner) {
    // Spend ~equal time so a missing email isn't observably faster.
    await verifyPassword(rawPassword, DUMMY_BCRYPT_HASH);
    return { error: GENERIC_SIGN_IN_ERROR, values: { email: email.value } };
  }

  const ok = await verifyPassword(rawPassword, owner.passwordHash);
  if (!ok) {
    return { error: GENERIC_SIGN_IN_ERROR, values: { email: email.value } };
  }

  await createSession(owner.id);
  redirect('/dashboard');
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect('/sign-in');
}
