# Database changelog — mizrahitality-owner

Schema changes, newest first. Maintained per the `update-database` skill. The owner app is
the sole owner of this database; the customer app never touches it.

## 12-05-2026 — `add-owner-venue-session` (feature #2 owner-auth)

Migration: `migrations/20260512093834_add_owner_venue_session/`. **First migration in the repo**
— `prisma migrate dev` from here on (not `db push`).

- Added model `Owner` — `id` (cuid), `email` (`@unique`), `passwordHash` (bcryptjs hash),
  `createdAt`, `updatedAt`; relations `sessions Session[]`, `venue Venue?` (optional — a venue
  doesn't exist until the builder in #3 creates it). `@@map("owners")`.
- Added model `Venue` — `id` (cuid), `ownerId` (`@unique` → enforces one venue per owner,
  REQ-22), `owner` relation `onDelete: Cascade`, `createdAt`, `updatedAt`. Minimal for now;
  content fields (name, slug, description, image) land in feature #3 via a follow-up migration.
  `@@map("venues")`.
- Added model `Session` — `id` (cuid), `tokenHash` (`@unique`; `HMAC-SHA256(SESSION_SECRET,
  rawToken)` — only the hash is stored, the raw token lives only in the cookie), `ownerId`,
  `owner` relation `onDelete: Cascade`, `createdAt`, `expiresAt` (fixed 30-day TTL, no renewal).
  Indexes on `ownerId` and `expiresAt`. `@@map("sessions")`.

### Notes

- Not multi-tenant — tenancy is per-`Owner`; there's no `organizationId`.
- `onDelete: Cascade` on `Venue.owner` and `Session.owner` — deleting an owner removes their
  venue and sessions.
- Non-destructive (`CREATE TABLE`s + indexes only); no data backfill.

## 12-05-2026 — Initial empty schema (feature #1 monorepo-foundation)

- Added `generator client` (prisma-client-js) and `datasource db` (sqlite, `env("DATABASE_URL")`).
- No models yet. `prisma generate` produces a model-less client; `pnpm db:push` is a no-op
  until models exist.
- The first models — `Owner` (email unique, bcrypt hash), `Venue` (1—1 with `Owner`, created
  in the builder), `Session` (opaque token, owner FK, expiry) — land in feature #2 (owner-auth).
- Migration: none (empty schema).
