# Database changelog — mizrahitality-owner

Schema changes, newest first. Maintained per the `update-database` skill. The owner app is
the sole owner of this database; the customer app never touches it.

## 12-05-2026 — `add-event-model` (feature #6 analytics-api)

Migration: `migrations/20260512194312_add_event_model/`. The third migration. A plain
`CREATE TABLE "events" (...)` + `CREATE INDEX` — non-destructive, no SQLite table-redefine
(unlike #3's `venues` rebuild).

- Added model `Event` — `id` (cuid), `venueId` + `venue` relation (`onDelete: Cascade`), `type`
  (one of `ANALYTICS_EVENT_TYPES` — `'visit' | 'book-now-hover' | 'book-now-click'`; plain string,
  SQLite has no enums; the enum lives in `@mizrahitality/contracts`), `visitorType` (one of the 7
  `VisitorType` values, incl. `'neutral'`), `sessionId` (`String?`), `createdAt`. `@@index([venueId])`,
  `@@map("events")`. Added relation `events Event[]` to `model Venue`.
- The customer site (feature #8) POSTs events here via `POST /api/venues/<slug>/events` over the
  open REST API (feature #6); the **read-only consumer** is the analytics dashboard (feature #7),
  which aggregates a venue's events in memory / a single `groupBy`.

### Notes

- `sessionId` is **nullable** on purpose — the customer site mints an opaque per-browser-session
  correlator and sends it on every event (it powers #7's "clickers who hovered ≥ once ÷ all
  clickers" funnel %), but the API DTO field is optional and the POST route is lenient: it stores
  `null` when absent and never 400s on a missing one (keeps `curl`/seed usage and the README's
  `{ type, visitorType }` body valid — a clean superset).
- **Single `@@index([venueId])`** — demo-scale data; #7 aggregates a venue's events in memory.
  Composite indexes (`[venueId, type]`, `[venueId, createdAt]`) are premature; #7 can add one later
  if a query ever needs it.
- **No `updatedAt`** — events are immutable; they're recorded once and never modified (the other
  models carry `updatedAt`, but events genuinely never update).
- Non-destructive (`CREATE TABLE` + index only); no data backfill. Cascade-deletes with the venue
  (and thus the owner).

## 12-05-2026 — `add-venue-content-and-page-variant` (feature #3 site-builder)

Migration: `migrations/20260512102303_add_venue_content_and_page_variant/`. The second migration.

- Extended model `Venue` with the builder's content columns and a publish-flow skeleton:
  - `name` (English letters + spaces, 1–60 chars — validated in app code), `slug` (`@unique`;
    derived from `name` — lowercased, spaces removed, numeric suffix on collision), `description`
    (`@default("")` — free text, may be empty until the owner writes it), `imageKind`
    (`'stock' | 'upload'`) + `imageValue` (stock: a stock-image id like `'atlantis-paradise'`;
    upload: the relative key `venues/<venueId>/<file>`) — one pair, the kind says how to read
    the value.
  - `publishState` (`@default("draft")` — `'draft' | 'publishing' | 'published'`; plain string,
    SQLite has no enums; owner-internal, not in `@mizrahitality/contracts`), `slugLockedAt`
    (`DateTime?` — set at first publish; once set the slug is immutable), `publishedAt`
    (`DateTime?`). Relation `variants PageVariant[]`.
- Added model `PageVariant` — `id` (cuid), `venueId` + `venue` relation (`onDelete: Cascade`),
  `visitorType` (one of the 7 `VisitorType` values), `content` (`Json` — stored as TEXT/JSONB by
  Prisma+SQLite; **shape intentionally unmodeled until feature #4 ai-copy-and-variants**),
  `createdAt`, `updatedAt`. `@@unique([venueId, visitorType])`, `@@index([venueId])`,
  `@@map("page_variants")`. **The table is created but never written in #3** — #4 populates it.

### Notes

- Slug is **frozen at first publish** via `Venue.slugLockedAt`; before that, renaming re-derives
  the slug freely (numeric-suffix collision handling). `slug @unique` is the DB backstop — the app
  derives with a collision loop and catches `P2002` as a last resort.
- SQLite can't add a non-null column to a non-empty table, so the migration redefines `venues`
  (create `new_venues`, copy rows, swap). In practice `venues` is empty — the builder doesn't
  exist before #3 — so this is non-destructive. **If `prisma migrate dev` ever balks on the new
  non-null columns, the disposable `apps/owner/prisma/dev.db*` is empty in practice — wipe it and
  re-run; don't add throwaway `@default`s.**

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
