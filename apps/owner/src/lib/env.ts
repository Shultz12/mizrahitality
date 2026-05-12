// Fail-fast environment access for mizrahitality-owner. `env` throws at module load if a
// required variable is missing. In the foundation skeleton only `lib/prisma.ts` imports this,
// and nothing renders the Prisma client yet — so `next build` doesn't evaluate it, but
// `pnpm dev` / `pnpm db:push` do (copy `.env.example` → `.env` first).

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
  // TODO(feature #4 ai-copy-and-variants): make this `required('ANTHROPIC_API_KEY')`.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  // TODO(feature #2 owner-auth): make this `required('SESSION_SECRET')`.
  SESSION_SECRET: process.env.SESSION_SECRET ?? '',
} as const;
