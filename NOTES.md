# Build notes

Working doc for building Mizrahitality. The product spec lives in `VISION.md` and `PRD.md` — that's the source of truth for *what* and *why*. This file is *how we're going about it*: build order, decisions made, open questions.

We build feature by feature in **plan mode**: plan → approve → implement → next. No spec/audit pipeline.

## Build order

Build top to bottom; each row depends on the rows above it.

| # | Feature | Depends on | What it adds |
|---|---------|-----------|--------------|
| 1 | **monorepo-foundation** ✅ | — | pnpm workspace, `@mizrahitality/contracts`, Prisma + SQLite scaffold, Tailwind + shadcn/ui, both Next.js apps as runnable skeletons. *(Landed — `pnpm install && pnpm dev` runs both apps; plan: `plans/01-monorepo-foundation-plan.md`.)* |
| 2 | **owner-auth** ✅ | 1 | first real Prisma models (`Owner`, `Venue` — one venue per owner — `Session`); email+password sign-up / sign-in / sign-out + `httpOnly` cookie sessions; `lib/auth.ts` server helper; `(authed)/layout.tsx` route guard. *(Landed — plan: `plans/02-owner-auth-plan.md`.)* |
| 3 | **site-builder** ✅ | 2 | the builder form — venue name (→ derived slug), free-text description, image (upload **or** pick from 3 supplied stock images); persistence of inputs, a saved-content preview, an authed nav, a publish-flow skeleton (no layout/rich-text editor, no image placement, no drag-and-drop). *(Landed — plan: `plans/03-site-builder-plan.md`.)* |
| 4 | **ai-copy-and-variants** | 3 | the two Claude steps — enhance the owner's description text, then author the approved copy into each per-audience template's Rich Text slot → 7 stored variants at publish (AI never touches the image) |
| 5 | **published-page-ssr** | 4 | the owner's SSR published page; adds the rendered-page response DTO to `@mizrahitality/contracts` |
| 6 | **analytics-api** | 4 | open REST/JSON API — `GET` rendered page by slug + visitor type, `POST` `visit` / `book-now hover` / `book-now click` events; event models; API DTOs in `@mizrahitality/contracts` |
| 7 | **analytics-dashboard** | 6 | the owner dashboard — every chart/metric/percentage over recorded events (server-computed; shadcn Chart for the bar charts + trendline) |
| 8 | **customer-site** | 6 | the Next.js SSR visitor site at `/<slug>`, the mid-left demo tab (sets a visitor-type cookie; never in the URL), the "Book Now" button + confirmation |
| 9 | **demo-seed** | all | demo Owner #1 with a published venue + realistic historical analytics; demo Owner #2 starts empty |

5 ↔ 6 can interleave (both only need the stored variants from #4). 7 ↔ 8 can run in either order (both need the API from #6). Everything else is a hard chain.

## Foundation decisions (carry forward)

These were settled while planning the scaffold; keep them unless there's a reason not to.

- **Node 22 LTS**, pinned in `.nvmrc`; **pnpm `9.15.0`** pinned via root `package.json` `packageManager` (Corepack); `preinstall` runs `npx -y only-allow pnpm`. (pnpm 9, not 10 — avoids pnpm 10's `onlyBuiltDependencies` allowlist friction with Prisma/esbuild/sharp.) `.npmrc` sets `node-linker=hoisted` — a flat `node_modules` so per-package `eslint`/`tsc`/`vitest`/`prisma` resolve and the root flat ESLint config resolves its plugins.
- **Ports:** owner `5111`, customer `5112`.
- **`@mizrahitality/contracts` is consumed as TypeScript source** — no build step — so each app's `next.config.ts` needs `transpilePackages: ['@mizrahitality/contracts']`. The package has **zero runtime dependencies**: types + plain constants only.
- Contracts surface: `VISITOR_GENDERS` / `AGE_GROUPS` / `SLOT_TYPES` (`rich-text`, `image` — no title slot) / `ANALYTICS_EVENT_TYPES`, the `VisitorType` union, `allVisitorVariants()` → exactly 7, and an `ApiError` shape. DTOs (rendered-page payload, event payloads) get added by the features that introduce them. *(No API-key header constant — the API is open; see below.)*
- **Auth = cookie sessions** *(implemented in #2 — see "Open / pending")*. Sign-up / sign-in is **email + password only** (no slug at sign-up); password hashed with **`bcryptjs`** (pure JS — no native build; cost **10**); session = a 256-bit opaque `base64url` token in an `httpOnly` / `sameSite=lax` cookie (`secure` only in production — dev is `http://localhost`) backed by a `Session` row in SQLite that stores only `HMAC-SHA256(SESSION_SECRET, token)` (`SESSION_SECRET` is required); fixed 30-day expiry, no renewal; `lib/auth.ts` server helpers (`getCurrentOwner`, `requireOwner`) + `lib/auth-actions.ts` Server Actions read/write it. Routes: `src/app/(auth)/*` public, `src/app/(authed)/*` guarded by `(authed)/layout.tsx` → `requireOwner()`. No middleware, no Auth.js/NextAuth, no OAuth, no email verification, no password reset, no rate limiting.
- **One venue (one page) per owner.** No multi-venue, no venue selector. Model: `Owner` 1—1 `Venue` (or merge them). The slug is **derived from the venue name** in the builder (lowercased, spaces removed; collisions get a numeric suffix), not entered at sign-up.
- **The owner REST API is open** — no API keys, no auth header. It's consumed only by the customer app on localhost; unknown slug → 404. (Justified by the localhost-only demo scope; flagged in `README.md`.)
- **Image input:** the builder offers **3 supplied stock images** to pick from **or** an upload; uploads are stored on local disk under the owner app (path persisted in the DB as a relative key, served back via `GET /uploads/[...path]` in the owner app so the customer gets an absolute URL). The 3 stock images are supplied assets, now at `apps/owner/public/stock/{atlantis-paradise,burj-al-arab,mardan-palace}.jpg`. AI never touches the image — text only.
- **Visitor type is server-side only:** never in the customer URL or page UI. The demo tab (for reviewers) sets a cookie; the SSR render reads it and passes the type inside the server-to-server API call; absent/unknown → `neutral`.
- **UI:** TailwindCSS **v4** (CSS-based config) + shadcn/ui for owner app chrome — `shadcn init` ran in `apps/owner` only, style `new-york`, base color `neutral` (provisional — refined when the supplied owner UI lands, REQ-11). The current shadcn CLI (`shadcn@4.x`) ships **Base UI**-based components (not Radix — PRD §7 / CLAUDE.md's earlier "Radix" wording is now dated) and adds `shadcn` as a runtime dep + `@import "shadcn/tailwind.css"` to `globals.css`. shadcn Chart (Recharts) for the dashboard — data is fetched and aggregated server-side; the chart component is a thin client component that only draws the SVG from props (no client fetching, no loading state). Supplied per-audience customer templates are plain Tailwind/React components.
- **Lint/format/test tooling:** root `eslint.config.mjs` (flat config — `@typescript-eslint` recommended + `@next/eslint-plugin-next` for `apps/*`, **`no-explicit-any` = error**); each package runs `eslint .` and ESLint walks up to the root config; `next build` skips its own lint pass (`eslint.ignoreDuringBuilds` in each `next.config.ts`). Prettier (`singleQuote`, `printWidth: 100`); `.prettierignore` excludes `*.md`. Per-package Vitest, `environment: 'node'`.
- **`@mizrahitality/contracts` surface (initial):** `VISITOR_GENDERS`, `AGE_GROUPS`, `NEUTRAL_VISITOR_TYPE`, `SLOT_TYPES` (`rich-text`, `image`), `ANALYTICS_EVENT_TYPES`; `VisitorType` = string union `'<gender>-<ageGroup>' | 'neutral'` (e.g. `male-18-30`, `female-50+`; `50+` kept verbatim, URL-encoded on the wire); `allVisitorVariants()` → 7; `isVisitorType()` / `parseVisitorType()` (parse defaults to `neutral`); `ApiError` (`{ error, message }`). DTOs (rendered-page payload, event shapes) added by #5/#6.
- **`lib/env.ts` per app:** `apps/owner` — `DATABASE_URL` **and** `SESSION_SECRET` required (throw at module load; `SESSION_SECRET` became required in #2), `ANTHROPIC_API_KEY` a placeholder until #4. `apps/customer` — `OWNER_API_BASE_URL` required (nothing imports it until #8). (`Owner` vs `Owner`+`Venue` was resolved in #2 — two models; see "Open / pending".)
- **Prisma + SQLite owned solely by `apps/owner`** — only `apps/owner/src/lib/prisma.ts` imports `@prisma/client`, via a dev-cached `globalThis` singleton. The customer app never touches the DB. Schema changes go through the `update-database` skill (`apps/owner/prisma/CHANGELOG.md`).
- **`.env` is gitignored; `.env.example` is committed.** `lib/env.ts` in each app fail-fasts on its required vars at module load. Owner needs `DATABASE_URL` (required), `ANTHROPIC_API_KEY`, `SESSION_SECRET`; customer needs `OWNER_API_BASE_URL` (required).
- Per-package Vitest configs (`environment: 'node'`). Tests never touch `./dev.db` — use a temp `DATABASE_URL`.
- Customer `GET /` serves a small SSR placeholder index ("visit /<your-slug>"); `GET /[slug]` SSR-renders, echoing the slug (JSX text interpolation handles HTML-escaping). The slug stub makes no owner-API call until `customer-site`.
- `pnpm db:migrate` has a real migration history as of #2 (`apps/owner/prisma/migrations/`); `pnpm db:push` is no longer used.
- `scripts/seed.mjs` is a plain-Node-ESM no-op stub until `demo-seed`.
- No project-level `.claude/` directory; no i18n machinery.
- Root scripts: `dev` / `build` / `lint` / `typecheck` / `test` / `format` / `format:check` via `pnpm -r [--parallel]` (no `concurrently`); `db:push` / `db:migrate` / `db:studio` delegate to the owner package; `seed` runs `node scripts/seed.mjs`.

## Open / pending

- **monorepo-foundation** (#1) has landed — see `plans/01-monorepo-foundation-plan.md`. `pnpm install && pnpm dev` runs both apps; `pnpm build` / `lint` / `typecheck` / `test` / `format:check` are green.
- **owner-auth** (#2) has landed — see `plans/02-owner-auth-plan.md`. Resolved decisions:
  - **`Owner` vs `Owner`+`Venue`** → **two models**. Minimal `Venue` now (`ownerId @unique` + timestamps, `onDelete: Cascade`); content fields (name/slug/description/image) get added by #3 via `update-database`. `Session` (token-HMAC, owner FK, `expiresAt`) is the third model. First real migration: `apps/owner/prisma/migrations/20260512093834_add_owner_venue_session/` — `prisma migrate dev` from here on (not `db push`).
  - **Session lifetime** → fixed **30-day** expiry set at sign-in, **no renewal logic** (demo-only). `expiresAt` checked on every lookup (expired → row deleted, treated as signed-out); the next sign-in mints a fresh 30-day session.
  - **Session token** → 256-bit `randomBytes(32)` opaque token, `base64url`; the DB stores `HMAC-SHA256(SESSION_SECRET, token)` as `Session.tokenHash @unique`; the cookie holds the raw token. → **`SESSION_SECRET` is now `required(...)` in `apps/owner/src/lib/env.ts`**; `apps/owner/.env.example` ships a throwaway dev value (re-`cp` `.env.example` → `.env`, or the app won't boot — by design).
  - **Password hashing** → `bcryptjs` (pure JS, Windows/pnpm-friendly), cost **10** (the "Foundation decisions" bullet above is amended accordingly).
  - **Error messaging** → sign-in returns a **generic** `"Invalid email or password."` (no account-existence leak; ~equal time spent in the not-found branch); sign-up returns a **clear** `"That email is already registered…"` on the email field (REQ-1 — sign-up inherently reveals existence).
  - **Auth transport** → React **Server Actions** (`signUpAction` / `signInAction` / `signOutAction`), not `/api/auth/*` route handlers. **No middleware** — `(authed)/layout.tsx` → `requireOwner()` is the security boundary; a cookie-presence Edge fast-path was deliberately deferred.
  - **`cuid()` ids**, `@@map` snake-case table names (`owners` / `venues` / `sessions` / `page_variants`).
- **site-builder** (#3) has landed — see `plans/03-site-builder-plan.md`. Resolved decisions:
  - **Second migration** — `apps/owner/prisma/migrations/20260512102303_add_venue_content_and_page_variant/`. Adds the `Venue` content columns (`name`, `slug @unique`, `description @default("")`, `imageKind` + `imageValue`) + the publish-flow skeleton (`publishState @default("draft")` — `draft`/`publishing`/`published`, plain string, owner-internal; `slugLockedAt DateTime?`; `publishedAt DateTime?`) and the `PageVariant` model (`venueId`, `visitorType`, `content Json`, `@@unique([venueId, visitorType])`, `@@index([venueId])`). SQLite can't add non-null columns to a non-empty table so the migration redefines `venues`; in practice `venues` is empty pre-#3 → non-destructive. If `prisma migrate dev` ever balks, wipe the disposable `dev.db*` and re-run.
  - **`PageVariant` is created but empty in #3** — `content` is `Json` (TEXT/JSONB on SQLite), shape **intentionally unmodeled** until #4 (`ai-copy-and-variants`), which populates the 7 rows and the real Publish action.
  - **Slug freeze** → **frozen at first publish** via `Venue.slugLockedAt`. Before that, renaming re-derives the slug freely (lowercase the name, strip whitespace, numeric-suffix collision loop in `lib/slug.ts`; `slug @unique` is the DB backstop, `P2002` caught + retried once). After, the slug is immutable and shown read-only. `publishAction` sets `slugLockedAt: existing ?? new Date()`.
  - **Venue-name validation** → English letters + spaces only (`^[A-Za-z]+( [A-Za-z]+)*$`), 1–60 chars, internal whitespace collapsed (`lib/validation.ts`); a clear rejection message naming what's allowed. Description: free text, trimmed, ≤ 5000 chars, may be empty.
  - **Upload constraints** → `image/jpeg` / `image/png` / `image/webp`, ≤ **5 MB**, **no** resizing/cropping/optimizing (no `sharp`); validated by declared `File.type` **plus** a magic-byte sniff (`lib/uploads.ts`); server-generated random-hex filename. Next's built-in `FormData`/`File` handles the multipart upload in the Server Action — no `formidable`/`multer`.
  - **Uploads on disk** → `apps/owner/uploads/venues/<venueId>/<random>.<ext>` — **outside `public/`** and the build, **gitignored**, `mkdir -p`'d on demand (no `.gitkeep`). Persisted as the relative key `venues/<venueId>/<file>` in `Venue.imageValue` (with `imageKind: 'upload'`). Served by an **unauthenticated** owner Route Handler `GET /uploads/[...path]` (`app/uploads/[...path]/route.ts`, deliberately outside `(authed)` so the public customer page can load it; path-traversal-guarded, keys are unguessable random hex).
  - **3 supplied stock images** → moved to `apps/owner/public/stock/{atlantis-paradise,burj-al-arab,mardan-palace}.jpg` (committed app assets), registered by stable id in `lib/stock-images.ts`; a venue picking one stores `imageKind: 'stock', imageValue: <id>`.
  - **No `@mizrahitality/contracts` additions** in #3 — image kinds + publish state are owner-internal; the rendered-page DTO is #5's, the slot schema #4's.
  - **Builder transport** → Server Actions (`saveVenueAction` / `publishAction` in `lib/builder-actions.ts`) invoked from `<form action>` (matches the #2 auth pattern), not `/api/*` routes. The form `router.refresh()`es after a save so the Server-Component `<VenuePreview>` (which reflects the **saved** venue) re-renders; a client-side slug preview updates as the owner types via the pure `deriveSlugBase`. No-JS form-error fallback is a known limitation (carried from #2).
  - **Routes** → `(authed)/builder` is the builder page; `(authed)/dashboard` now shows a "Your venue" card (or a "Create your venue" CTA) + an "Analytics arrives in #7" card; `(authed)/layout.tsx` gained a small authed nav (wordmark + Dashboard/Builder links + Sign out — the standalone sign-out form moved here).
  - **Follow-up** — #5/#6 will need an owner public base URL to compose absolute image URLs (`/uploads/...`, `/stock/...`) into the API payload; not added in #3 (no API yet).
- **Slot schema** (each slot's role, min/max length, required/optional) and the **per-template copy-rules format** the "author into template" AI step consumes — pin these when starting `ai-copy-and-variants`. Depends on the supplied template assets.
- **Supplied assets** — the owner-facing UI design files and the per-audience template set + copy rules still need to land before `ai-copy-and-variants` finishes (the **3 stock images** have landed — see above; the builder UI ships plain Tailwind + shadcn for now, to be refined under REQ-11).
- **App processes:** two separate Next.js processes, talking only over the (open) owner REST API — no shared DB handle. Confirmed by the architecture; nothing more to decide.

## API contract sketch

Fleshed out for real in `README.md` once `analytics-api` lands. Shape:

- **No auth** — the owner API is open (localhost-only demo). Unknown slug → 404.
- `GET /api/venues/<slug>/page?type=<visitor-type>` → the fully-rendered page payload for that variant; unknown/absent `type` → neutral. (`type` is supplied by the customer app server-side; it never appears in a browser URL.)
- `POST /api/venues/<slug>/events` with `{ "type": "visit" | "book-now-hover" | "book-now-click", "visitorType": "<visitor-type>" }` → record the event against that venue.

Visitor type = `male`/`female` × `18-30`/`31-50`/`50+` (6) + `neutral` = **7**.
