// Fail-fast environment access for mizrahitality-owner. `env` throws at module load if a
// required variable is missing — so `pnpm dev`, `pnpm build` (it imports the route modules,
// which reach `lib/auth.ts` → here), `pnpm db:push` and `pnpm test` all need a populated `.env`
// (or `test.env`). Copy `.env.example` → `.env` first; `next build` reads it automatically.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  /** SQLite connection string for Prisma. */
  DATABASE_URL: required('DATABASE_URL'),
  /** Secret used to HMAC session tokens before storing them (`lib/auth.ts`). */
  SESSION_SECRET: required('SESSION_SECRET'),
  // Optional — the app boots without it; enhance & publish are gated on isAiConfigured() and
  // return a clear "set GOOGLE_API_KEY" message when empty.
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? '',
  /** Public base URL of the mizrahitality-customer site — used to build "visit the live page"
   *  links from the owner UI (`<CUSTOMER_BASE_URL>/<slug>`). Defaults to the dev port. */
  CUSTOMER_BASE_URL: process.env.CUSTOMER_BASE_URL ?? 'http://localhost:5112',
} as const;
