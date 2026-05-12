// Pure email/password validation for the owner sign-up / sign-in forms. No Next.js imports —
// unit-tested directly. Server Actions in `auth-actions.ts` call these and map the results
// into form state.

/** Minimum password length. */
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt only hashes the first 72 bytes of the password — reject longer ones, don't truncate. */
export const PASSWORD_MAX_BYTES = 72;
/** RFC-ish cap on email length; just a sanity bound. */
export const EMAIL_MAX_LENGTH = 254;

// Pragmatic, not RFC-5322: one `@`, a dot in the domain, no whitespace. Good enough for a demo.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidationResult = { ok: true; value: string } | { ok: false; message: string };

/** Canonical form of an email: trimmed and lowercased. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string): ValidationResult {
  const value = normalizeEmail(raw);
  if (value.length === 0) {
    return { ok: false, message: 'Email is required.' };
  }
  if (value.length > EMAIL_MAX_LENGTH) {
    return { ok: false, message: 'Email is too long.' };
  }
  if (!EMAIL_RE.test(value)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  return { ok: true, value };
}

export function validatePassword(raw: string): ValidationResult {
  // Passwords are not trimmed — leading/trailing spaces are significant.
  if (raw.length === 0) {
    return { ok: false, message: 'Password is required.' };
  }
  if (raw.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (new TextEncoder().encode(raw).length > PASSWORD_MAX_BYTES) {
    return { ok: false, message: 'Password is too long.' };
  }
  return { ok: true, value: raw };
}

// ---------------------------------------------------------------------------
// Venue builder (feature #3) — name + description.
// ---------------------------------------------------------------------------

/** A venue name must be at least this many characters (after trim/whitespace-collapse). */
export const VENUE_NAME_MIN_LENGTH = 1;
/** Upper bound on a venue name — keeps slugs and headings sane. */
export const VENUE_NAME_MAX_LENGTH = 60;
/** Upper bound on the free-text description; generous, just a sanity cap. */
export const VENUE_DESCRIPTION_MAX_LENGTH = 5000;

// English letters in space-separated words: "Blue Lagoon", "Cafe". No leading/trailing/double
// spaces (callers normalize first), no digits, punctuation, or accented characters.
const VENUE_NAME_RE = /^[A-Za-z]+( [A-Za-z]+)*$/;

/** Canonical venue name: trim, then collapse internal whitespace runs to single ASCII spaces. */
export function normalizeVenueName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function validateVenueName(raw: string): ValidationResult {
  const value = normalizeVenueName(raw);
  if (value.length < VENUE_NAME_MIN_LENGTH) {
    return { ok: false, message: 'Venue name is required.' };
  }
  if (value.length > VENUE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `Venue name is too long (max ${VENUE_NAME_MAX_LENGTH} characters).`,
    };
  }
  if (!VENUE_NAME_RE.test(value)) {
    return {
      ok: false,
      message:
        'Venue name can only contain English letters and spaces — no numbers, punctuation, or accented characters.',
    };
  }
  return { ok: true, value };
}

/** Description: trimmed, may be empty, capped at {@link VENUE_DESCRIPTION_MAX_LENGTH} chars. */
export function validateVenueDescription(raw: string): ValidationResult {
  const value = raw.trim();
  if (value.length > VENUE_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      message: `Description is too long (max ${VENUE_DESCRIPTION_MAX_LENGTH} characters).`,
    };
  }
  return { ok: true, value };
}
