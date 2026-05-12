import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest global setup: provision the throwaway SQLite DB the integration tests use.
// `vitest.config.ts` points DATABASE_URL at `file:./vitest-tmp.db` (relative to prisma/schema —
// i.e. apps/owner/prisma/vitest-tmp.db); here we (re-)create it via `prisma db push` and remove
// it (plus its -journal) on teardown so it never lingers or gets committed.

const appDir = fileURLToPath(new URL('.', import.meta.url));
const dbFile = fileURLToPath(new URL('./prisma/vitest-tmp.db', import.meta.url));

function removeDb(): void {
  rmSync(dbFile, { force: true });
  rmSync(`${dbFile}-journal`, { force: true });
}

export function setup(): void {
  removeDb();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: appDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:./vitest-tmp.db' },
  });
}

export function teardown(): void {
  removeDb();
}
