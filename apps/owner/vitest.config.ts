import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against a throwaway SQLite DB (apps/owner/prisma/vitest-tmp.db, gitignored), never
// prisma/dev.db. `globalSetup` (vitest.global-setup.ts) runs `prisma db push` against it and
// deletes it on teardown. The env below also keeps `lib/env.ts` from throwing during tests.
const TEST_DATABASE_URL = 'file:./vitest-tmp.db';
const TEST_SESSION_SECRET = 'mizrahitality-test-session-secret';

// Make these visible to globalSetup (main process) and the `prisma db push` subprocess too,
// not just the worker processes that pick them up from `test.env`.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.SESSION_SECRET = TEST_SESSION_SECRET;

export default defineConfig({
  resolve: {
    // Mirror the `@/*` → `src/*` path alias from tsconfig.json.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      SESSION_SECRET: TEST_SESSION_SECRET,
    },
    globalSetup: ['./vitest.global-setup.ts'],
  },
});
