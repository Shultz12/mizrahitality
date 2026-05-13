import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against a throwaway SQLite DB (apps/owner/prisma/vitest-tmp.db, gitignored), never
// prisma/dev.db. `globalSetup` (vitest.global-setup.ts) runs `prisma db push` against it and
// deletes it on teardown. The env below also keeps `lib/env.ts` from throwing during tests.
const TEST_DATABASE_URL = 'file:./vitest-tmp.db';
const TEST_SESSION_SECRET = 'mizrahitality-test-session-secret';

// Make these visible to globalSetup (main process) and the `prisma db push` subprocess too,
// not just the worker processes that pick them up from `test.env`. GOOGLE_API_KEY is forced
// empty so `isAiConfigured()` is deterministically false in tests regardless of the shell — the
// AI-step tests inject a fake client (the gate is bypassed) or assert the not-configured path.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.SESSION_SECRET = TEST_SESSION_SECRET;
process.env.GOOGLE_API_KEY = '';

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
      GOOGLE_API_KEY: '',
    },
    globalSetup: ['./vitest.global-setup.ts'],
    // The integration tests share one throwaway SQLite file and clean up with unscoped
    // `deleteMany()` in `afterEach` — so test files must not run concurrently, or one file's
    // teardown nukes another file's rows mid-test. The suite is small; the cost is negligible.
    fileParallelism: false,
  },
});
