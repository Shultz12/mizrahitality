# Database changelog — mizrahitality-owner

Schema changes, newest first. Maintained per the `update-database` skill. The owner app is
the sole owner of this database; the customer app never touches it.

## 12-05-2026 — Initial empty schema (feature #1 monorepo-foundation)

- Added `generator client` (prisma-client-js) and `datasource db` (sqlite, `env("DATABASE_URL")`).
- No models yet. `prisma generate` produces a model-less client; `pnpm db:push` is a no-op
  until models exist.
- The first models — `Owner` (email unique, bcrypt hash), `Venue` (1—1 with `Owner`, created
  in the builder), `Session` (opaque token, owner FK, expiry) — land in feature #2 (owner-auth).
- Migration: none (empty schema).
