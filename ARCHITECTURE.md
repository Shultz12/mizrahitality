# Architecture

## Purpose & how to use this doc

You are reviewing **Mizrahitality**, a job-interview deliverable: a tiny monorepo with two
cooperating Next.js apps that together form an AI-assisted hospitality builder + a
server-rendered public visitor site. This document gives you the macro picture in roughly
ten minutes — what the system is, how the two apps cooperate, the key request and data
flows, the state model, and the design choices behind the choices. For per-file detail see
[`CLAUDE.md`](./CLAUDE.md); for the REST contract see the §"REST API contract" of
[`README.md`](./README.md); for product context see [`VISION.md`](./VISION.md),
[`PRD.md`](./PRD.md), and [`NOTES.md`](./NOTES.md).

## 1. System at a glance

Two Next.js apps run side by side on localhost. They share **`@mizrahitality/contracts`**
(types + plain constants, zero runtime deps, consumed as raw TS — no build step) and
otherwise communicate **only** over a small REST/JSON API hosted by the owner app. The
owner uses the builder; the public visits the customer site; the customer never touches
the database.

```
  Owner browser    ──►  mizrahitality-owner (:5111, Next.js)  ──►  Prisma / SQLite
                            │                                     (apps/owner/prisma/dev.db)
                            │  REST/JSON  (the only channel)
                            │  + Google Gemini (publish-time only)
                            ▼
Visitor browser  ──►  mizrahitality-customer (:5112, Next.js SSR)
```

- **SSR is mandatory** for both the owner's `/preview` page and the entire customer site.
  Every visitor request hits the customer server, which fetches the live snapshot from the
  owner API and renders the HTML on the server.
- The **slug is the site identity.** It is derived from the venue name in the builder
  (`^[A-Za-z]+( [A-Za-z]+)*$`, internal whitespace collapsed, lower-cased, spaces
  removed), used as both the public URL path segment (`/<slug>`) and the API key, and
  **frozen at first publish** via `Venue.slugLockedAt` so the public URL never changes
  underneath visitors.
- The two apps communicate **only** over the open REST API. The customer has no
  `@prisma/client`, no schema, no auth, no shared session, and no in-process call into the
  owner. There is no API key — open by design (localhost-only demo, §5).

## 2. The three core flows

Each flow below names the entry-point file then traces the request 4–6 steps. Open the
files to follow along.

### 2.1 Owner publishes a page

The owner builds a page in the builder UI and clicks **Publish**. The platform polishes
the description text with AI, authors it into each per-audience template, validates all 7
copy bundles, and writes them atomically — the page becomes live for visitors on the next
request.

1. **UI** — `apps/owner/src/components/builder/builder-shell.tsx` hosts the builder form
   (`builder-form.tsx`) and the **sticky action bar** with the Publish / Re-publish
   button; `publish-confirm-modal.tsx` is the confirmation modal that launches the job.
2. **Action** — Publish calls the `startPublishAction` Server Action in
   `apps/owner/src/lib/builder-actions.ts`, which re-authenticates via `requireOwner()`
   and starts an in-memory `PublishJob` (`apps/owner/src/lib/publish-jobs.ts` — a `Map`
   keyed by venue id). The client then polls `pollPublishJobAction` so the sticky-bar
   button can show live "X / 7" progress as variants complete.
3. **Domain logic** — `runPublishPipeline` in `apps/owner/src/lib/publish.ts`:
   `enhanceDescription` polishes the owner's free-text description → the 7 per-variant
   `generateVariantCopy` calls fan out **in parallel** via `Promise.all` (no inter-call
   pacing, no 429 back-off — billing is enabled on the key, see §7.7) → each result is
   validated by `validateCopyBundle` (`@mizrahitality/contracts/copy.ts` — word /
   sentence counts, char caps) with a small retry-with-error-feedback loop → on **all 7
   valid**, the pipeline transactionally `deleteMany` + recreates the 7 `PageVariant`
   rows + `venue.update({ publishState: 'published', publishedAt, slugLockedAt:
   existing ?? new Date() })`. **All-or-nothing**: any failure changes nothing on disk,
   reverts `publishState`, and reports `variantErrors` (the previous live page is intact).
4. **AI seam** — `apps/owner/src/lib/ai/gemini.ts` is the lazily-constructed
   `@google/genai` client; `apps/owner/src/lib/ai/response-schema.ts` is the per-variant
   `responseSchema` for Gemini's structured-output mode
   (`responseMimeType: 'application/json'` — makes JSON-shape failures effectively
   impossible). Prompt assets in `apps/owner/src/lib/templates.ts` are a verbatim
   transcription of the `plans/copy-rules/` files. `GOOGLE_API_KEY` is **optional** —
   without it `isAiConfigured()` returns false and enhance / publish show a "not
   configured" hint; everything else works.
5. **Result** — the next `GET /api/venues/<slug>/page?type=…` returns the new bundle.
   **Save** (`saveVenueAction`) only writes the working content (`Venue.name` / `slug` /
   `description` / `imageKind` / `imageValue`); it never touches `PageVariant` rows or
   `publishedAt`. So editing + saving has **zero effect** on visitors until Publish runs.

### 2.2 Visitor sees a published page

A visitor opens `http://localhost:5112/<slug>`. The customer renders the page entirely
server-side from the owner API.

1. **Entry** — `apps/customer/src/app/[slug]/page.tsx` is a Server Component with
   `export const dynamic = 'force-dynamic'` (SSR per request, never statically
   prerendered).
2. **Read cookie** — `parseVisitorType()` in
   `apps/customer/src/lib/visitor-type-cookie.ts` reads the `httpOnly` `miz_visitor_type`
   cookie (absent / unrecognised → `neutral`). Visitor type **never appears in the URL or
   the page UI** — it's a reviewer aid only (the demo tab in step 5 sets it).
3. **Fetch** — `fetch(${OWNER_API_BASE_URL}/api/venues/<slug>/page?type=<visitor-type>,
   { cache: 'no-store' })`. The handler is `apps/owner/src/app/api/venues/[slug]/page/
   route.ts`; the assembly logic is the pure `buildRenderedPage` in
   `apps/owner/src/lib/rendered-page.ts`, which composes the stored `PageVariant.content`
   + the absolute hero `imageUrl` (with `baseUrl = req origin` so the customer gets a
   loadable URL) + the per-variant body typography + the fixed strings (`"Book Now"` /
   `"Powered by Mizrahitality"`) into a `RenderedPage` DTO
   (`@mizrahitality/contracts/page.ts`). Response header: `Cache-Control: no-store`.
   **No AI in this path** — pages are precomputed at publish.
4. **Error branches** — a `404` from the API → `notFound()` → `app/[slug]/not-found.tsx`
   (a friendly "we couldn't find a venue at that address" page); any other failure /
   unreadable body → `<ServiceUnavailable />` (`apps/customer/src/components/service-
   unavailable.tsx`) — never a stack trace.
5. **Render** — the 5-zone "Warm Minimalist" design rendered SSR by `<CustomerPage>` in
   `apps/customer/src/components/published-page/customer-page.tsx`, with thin
   `'use client'` islands: `book-now-button.tsx`, `booking-confirmed-modal.tsx`,
   `sticky-mobile-bar.tsx`, `analytics-beacon.tsx`. The mid-left **pure-CSS hover-out
   demo tab** (`demo-tab.tsx` — Server Component) hosts a
   `<form action={selectVisitorTypeAction}>` (`apps/customer/src/lib/visitor-type-
   actions.ts`) that sets — or for the "Unknown / default" reset, deletes — the
   `httpOnly` / `sameSite=lax` / `path=/` `miz_visitor_type` cookie; the route then
   re-renders SSR. The owner's `/preview` route uses the same renderer (its own copy
   under `apps/owner/src/components/published-page/`) so the owner sees exactly what the
   visitor sees.

### 2.3 Analytics round-trip

The customer emits browser events; the owner ingests them; the owner dashboard reads the
aggregation back.

1. **Emit (visit)** — `analytics-beacon.tsx` (`'use client'`) fires `visit` on mount and
   again on every `visitorType` change, with a `useRef` guard against React StrictMode's
   dev double-effect.
2. **Emit (Book Now)** — `<BookNowButton>` posts `book-now-hover` **once per `(slug,
   visitorType)` per page-load** via a module-scoped `Set` in
   `apps/customer/src/components/published-page/analytics-beacon.tsx`, then
   `book-now-click` on every click (no dedup). The click ends at the confirmation modal —
   no real booking.
3. **Action** — `trackEventAction({ slug, type, visitorType, sessionId? })` in
   `apps/customer/src/lib/analytics-actions.ts` is a `'use server'` action — best-effort;
   failures are swallowed. `sessionId` is `sessionStorage`-cached `crypto.randomUUID()`
   from `apps/customer/src/lib/session-id.ts` (it powers the dashboard's hover→click
   funnel %).
4. **Ingest** — `apps/owner/src/app/api/venues/[slug]/events/route.ts` validates the body
   via `parseAnalyticsEventRequest` (`@mizrahitality/contracts/analytics.ts`), looks up
   the venue by slug, inserts one `Event` row (`{ venueId, type, visitorType, sessionId?,
   createdAt }`). `400` on bad body, `404` on unknown slug, `201 { ok: true }` on
   success. **Not gated on publish state** — an existing-but-unpublished venue still
   accepts events (so the `/preview` flow's beacons still record in dev).
5. **Aggregate** — `getDashboardData(venueId)` in `apps/owner/src/lib/dashboard-data.ts`
   is a thin Prisma wrapper that loads the venue's `Event` rows and passes them to the
   pure `computeDashboard(events, { timeZone, neutralInBreakdowns })` in
   `apps/owner/src/lib/analytics.ts`. It returns `DashboardData`: totals (visits + Book
   Now hovers/clicks); the fixed-last-30-days daily-visitors series + an OLS trendline;
   gender / age-group breakdowns; "Book Now" clicks by gender; click-through % and a
   hover→click funnel %; and a 6-row gender×age conversion table. `neutral` counts in
   totals/daily/percentages but isn't a breakdown bar.
6. **Read (server)** — the dashboard at `apps/owner/src/app/(authed)/dashboard/page.tsx`
   is a Server Component: `requireOwner()` → `getOwnerVenue()` →
   `getDashboardData(venue.id)` → seeds `<DashboardLive>` with the initial
   `DashboardData`. **Three states, never an error**: no venue → "Create your venue"
   CTA; venue + 0 events → zeroed-and-"No data yet"; venue + events → the full
   dashboard.
7. **Read (poll)** — `<DashboardLive>` in
   `apps/owner/src/components/dashboard/dashboard-live.tsx` (`'use client'`) polls a
   Server Action on a short interval, updating the metric tiles + charts in place. No
   WebSocket / SSE infrastructure.

## 3. Data model

The product is five Prisma models in `apps/owner/prisma/schema.prisma`. SQLite file at
`apps/owner/prisma/dev.db`. Schema changes go through the `update-database` skill; the
log is `apps/owner/prisma/CHANGELOG.md`.

| Model | What it is | Key fields | Relationships |
| --- | --- | --- | --- |
| `Owner` | A venue owner's login | `email @unique`, `passwordHash` (bcryptjs cost 10) | 1 : 1 → `Venue`; 1 : n → `Session` |
| `Venue` | The owner's single page (one venue per owner) | `ownerId @unique`, `name`, `slug @unique` (derived from name; frozen at first publish), `description`, `enhancedDescription?` (set on Enhance, cleared on description-edit), `imageKind` (`'stock' \| 'upload'`) + `imageValue` (stock id or `venues/<venueId>/<file>` key), `publishState` (`'draft' \| 'publishing' \| 'published'`), `slugLockedAt`, `publishedAt` | belongs to `Owner` (cascade delete); 1 : n → `PageVariant`; 1 : n → `Event` |
| `Session` | Owner session row | `tokenHash @unique` (= `HMAC-SHA256(SESSION_SECRET, token)`; the raw token lives only in the `miz_session` cookie), `ownerId`, `expiresAt` (30-day fixed, no renewal); `@@index([ownerId])`, `@@index([expiresAt])` | belongs to `Owner` (cascade delete) |
| `PageVariant` | One precomputed audience-tailored page (the 7 per published venue) | `venueId`, `visitorType` (one of the 7 — `neutral` + 6 typed), `content` JSON = `{ schemaVersion: 1, copy: CopyBundle }`; `@@unique([venueId, visitorType])`, `@@index([venueId])` | belongs to `Venue` (cascade delete) |
| `Event` | One row per accepted `POST /api/venues/<slug>/events` | `venueId`, `type` (`'visit' \| 'book-now-hover' \| 'book-now-click'`), `visitorType` (denormalised — no FK to a `PageVariant`), `sessionId?` (opaque per-browser-session correlator the customer mints; powers the funnel %), `createdAt`; `@@index([venueId])` | belongs to `Venue` (cascade delete) |

`PageVariant.content`'s JSON shape is **owner-internal** on purpose — the cross-app
surface is the `RenderedPage` DTO in `@mizrahitality/contracts/page.ts`, assembled by
`buildRenderedPage` from the stored `CopyBundle` (the shape + validator that lives in
`@mizrahitality/contracts/copy.ts`) + the absolute image URL + the per-variant body
typography + the fixed strings. `Event.visitorType` is denormalised (a plain string, no
FK) — aggregation doesn't need a join, and an unpublished venue can still record events.
`Owner` 1 : 1 `Venue` is enforced by `Venue.ownerId @unique`; `Session.tokenHash @unique`
prevents collisions of the HMAC'd token.

## 4. Publish state machine

The live page **is** the seven `PageVariant` rows — there is no `publishedJson` snapshot
field. Three things on `Venue` describe where the page is in its lifecycle:

- `publishState` — `'draft'` (initial, after sign-up / builder Save), `'publishing'`
  (in-flight; set by `runPublishPipeline` at the top, cleared on success or rollback),
  `'published'` (live).
- `slugLockedAt` — `null` until the first successful publish, then set to that
  publish's `new Date()`. Before it's set, renaming the venue re-derives the slug
  freely (collision is handled by a numeric-suffix loop in `apps/owner/src/lib/slug.ts`,
  with `slug @unique` as the DB backstop and `P2002` caught + retried once). After,
  the slug is immutable and shown read-only in the builder.
- `publishedAt` — set on every successful publish (including re-publishes).

The seven `PageVariant` rows are the publish artefact. The write is **transactional and
all-or-nothing**: inside one `prisma.$transaction` `deleteMany` clears any existing rows
for the venue, then `createMany` re-inserts the 7 new ones, then `venue.update({
publishState: 'published', publishedAt: new Date(), slugLockedAt: existing ?? new
Date() })`. If any of the 7 `generateVariantCopy` calls fails validation after retries —
or the transaction throws — the pipeline reverts `publishState` to its prior value and
nothing on disk changes. **A failed re-publish leaves the previous live page intact** —
the visitor never sees a half-published site.

The builder's UI state derives from this — "Publish" before the first publish,
"Re-publish" after. The in-memory `PublishJob` (`apps/owner/src/lib/publish-jobs.ts` — a
process-local `Map` keyed by venue id, GC'd after a short idle) tracks `{ completed,
total: 7, variantErrors }` so the sticky-bar button can show a live "X / 7" progress fill
while the job runs; the client polls `pollPublishJobAction` until the job's `phase` is
`done` or `error`. The job store deliberately doesn't persist — a server restart mid-
publish presents the user with the unchanged `publishState` on next load (they re-click
Publish), which is the right behaviour for an all-or-nothing pipeline.

## 5. Authentication model

Two surfaces with very different rules — keep them straight when reviewing.

- **Owner-facing pages and Server Actions** — passwords hashed with **bcryptjs** (pure
  JS, no native build) at cost 10 (`apps/owner/src/lib/auth.ts`); an `httpOnly` /
  `sameSite=lax` cookie named `miz_session` carries a **256-bit `randomBytes(32)` opaque
  token** in `base64url`; the DB stores only `HMAC-SHA256(SESSION_SECRET, token)` as
  `Session.tokenHash @unique` (the raw token never hits the DB). Sessions have a fixed
  30-day `expiresAt` set at sign-in — **no renewal logic** (an expired row is deleted on
  lookup and the next sign-in mints a fresh session). `requireOwner()` /
  `getCurrentOwner()` (`apps/owner/src/lib/auth.ts`) gate every owner Server Component
  and Server Action; the auth Server Actions (`signUpAction` / `signInAction` /
  `signOutAction`) live in `apps/owner/src/lib/auth-actions.ts`. **No NextAuth.** **No
  middleware** — `apps/owner/src/app/(authed)/layout.tsx` → `requireOwner()` is the
  security boundary (a cookie-presence Edge fast-path was deliberately deferred). The app
  throws at startup if `SESSION_SECRET` is unset (`.env.example` ships a throwaway dev
  value).
- **Owner ↔ Customer REST API** — **no authentication.** The slug is the identity. Open
  by design (`README.md` §"Out of scope" / PRD §7) — a local demo, not a productionised
  service. Authentication / rate-limiting / multi-tenant hardening is an explicit
  non-goal (§9).

## 6. Code tour (where things live, in 30 seconds)

Not exhaustive — for the per-file tour see `CLAUDE.md`.

| Path | What's there |
| --- | --- |
| `apps/owner/src/app/(auth)/` | `sign-in` / `sign-up` — public; redirect to `/dashboard` if already authed. |
| `apps/owner/src/app/(authed)/` | `dashboard`, `builder` — guarded by `(authed)/layout.tsx` → `requireOwner()`; share the authed nav; `<main>` is `max-w-5xl` (widened for the dashboard's 2-column charts grid). |
| `apps/owner/src/app/preview/` | Top-level `/preview` — **outside** `(authed)` so the design has "zero navigation"; its own minimal layout (warm `#FAF7F2` + Playfair/Inter), `requireOwner()` called inline; renders the owner's published venue (default `neutral`, `?type=` previews the other 6). |
| `apps/owner/src/app/api/venues/[slug]/` | The two open REST endpoints — `GET …/page` (reuses `buildRenderedPage`) and `POST …/events`. Outside `(authed)`, same posture as `/uploads`. |
| `apps/owner/src/app/uploads/[...path]/route.ts` | Unauthenticated Route Handler that streams uploaded venue images (path-traversal-guarded; keys are unguessable random hex). |
| `apps/owner/src/lib/auth.ts` / `auth-actions.ts` | `requireOwner` / `getCurrentOwner` + the `signUp` / `signIn` / `signOut` Server Actions. |
| `apps/owner/src/lib/builder-actions.ts` | `saveVenueAction`, `startPublishAction`, `pollPublishJobAction`, `enhanceDescriptionAction`, `regenerateVariantAction`. |
| `apps/owner/src/lib/publish.ts` + `publish-jobs.ts` | The publish pipeline (`runPublishPipeline` — fan-out + validate + transactional write) + the in-memory `PublishJob` store. |
| `apps/owner/src/lib/ai/` | The Gemini client seam — `gemini.ts` (lazily-constructed `@google/genai`), `response-schema.ts` (per-variant `responseSchema`), and the `enhanceDescription` / `generateVariantCopy` / `generateAllVariants` steps. |
| `apps/owner/src/lib/templates.ts` | The prompt assets — verbatim transcription of `plans/copy-rules/_BASE-PROMPT.md` + the 7 persona blocks + the per-variant body typography. |
| `apps/owner/src/lib/page-variant.ts` | `parsePageVariantContent` — the owner-internal `{ schemaVersion, copy }` wrapper. |
| `apps/owner/src/lib/rendered-page.ts` | The pure `buildRenderedPage` — assembles `PageVariant.content` + image + typography + fixed strings into the shared `RenderedPage` DTO. Used by `/preview`, the REST API, and the customer (transitively). |
| `apps/owner/src/lib/analytics.ts` + `dashboard-data.ts` | Pure `computeDashboard` → `DashboardData` (REQ-8 figures, exhaustively unit-tested) + the thin Prisma wrapper that loads the venue's events. |
| `apps/owner/src/lib/{slug,validation,stock-images,uploads}.ts` | Slug derivation + name/description validation + the 3 stock-image registry + upload disk handling. |
| `apps/owner/src/components/builder/` | The builder UI — `builder-form.tsx`, `builder-shell.tsx`, `enhance-description-panel.tsx`, `image-picker.tsx`, `venue-preview.tsx`, `publish-confirm-modal.tsx`. |
| `apps/owner/src/components/published-page/` | The owner's copy of the 5-zone "Warm Minimalist" page renderer (used by `/preview`). |
| `apps/owner/src/components/dashboard/` | `dashboard-live.tsx` + the chart wrappers + `stat-card.tsx` + `segment-table.tsx`. |
| `apps/owner/prisma/` | `schema.prisma`, `migrations/` (committed), `CHANGELOG.md`. |
| `apps/customer/src/app/[slug]/page.tsx` | The SSR visitor page — branches on the rendered-page fetch (success / 404 / unreachable). |
| `apps/customer/src/lib/visitor-type-cookie.ts` + `visitor-type-actions.ts` | Read/write the `httpOnly` `miz_visitor_type` cookie; the demo tab's form action. |
| `apps/customer/src/lib/analytics-actions.ts` + `session-id.ts` | The `'use server'` `trackEventAction` (best-effort, errors swallowed) + the `sessionStorage`-cached session id. |
| `apps/customer/src/components/published-page/` | The customer's copy of the 5-zone renderer — `customer-page.tsx` (Server) + the four `'use client'` islands + `demo-tab.tsx` + `not-found.tsx`. |
| `packages/contracts/src/` | The shared TS surface — `visitor.ts` (`VisitorType`, `allVisitorVariants`), `copy.ts` (`CopyBundle`, `validateCopyBundle`), `page.ts` (`RenderedPage` DTO + fixed strings), `analytics.ts` (event request/response + `parseAnalyticsEventRequest`), `slots.ts`, `errors.ts`. Consumed as **raw TS** via `transpilePackages`. |
| `scripts/seed.mjs` + `scripts/seed-data/` | `pnpm seed` — plain Node ESM that resets the two demo owners; reads canned `CopyBundle` JSON so it needs no `GOOGLE_API_KEY`. |
| `plans/` | `00-master-plan.md` + per-feature plans — process artefacts, not orientation. |

## 7. Design decisions

The "why we chose this" answers a reviewer is most likely to ask. Each is short on
purpose — for the long form, the linked code is the source of truth.

### 7.1 Why two cooperating apps (not one)

The PRD calls for an SSR public site that talks to a separate owner-facing platform over
a documented API. Two apps prove the API-first separation is real — the customer has no
`@prisma/client`, no schema, no auth — instead of pretending behind a single Next.js
server.

### 7.2 Why Next.js for both

App Router gives Server Components, Server Actions, and Route Handlers in one place. The
owner needs forms (Server Actions), an API (Route Handlers), and SSR `/preview` (Server
Components); the customer needs SSR per request and a few `'use client'` islands.
Choosing the same framework for both means one mental model, one toolchain, one set of
conventions.

### 7.3 Why a pnpm workspace (no Turborepo / Nx)

Two apps + a few shared packages do not need a build orchestrator. `pnpm -r [--parallel]`
covers `dev` / `build` / `lint` / `typecheck` / `test` / `format` across the monorepo.
One lockfile, pnpm pinned via `packageManager` and Corepack. **pnpm 9, not 10** —
avoids pnpm 10's `onlyBuiltDependencies` allowlist friction with Prisma / esbuild / sharp.
`.npmrc` `node-linker=hoisted` keeps `node_modules` flat so per-package `eslint` /
`tsc` / `vitest` / `prisma` resolve and the root flat ESLint config resolves its plugins.

### 7.4 Why Prisma + SQLite (file-based)

Zero infrastructure: a file at `apps/owner/prisma/dev.db`, created by `pnpm db:migrate`.
There's a real migration history under `apps/owner/prisma/migrations/`; schema changes go
through the `update-database` skill. A reviewer can clone the repo and have a working
database in two commands.

### 7.5 Why bcryptjs + a signed cookie (no NextAuth)

The requirement set is sign-up + sign-in + session. A `bcryptjs` password hash plus an
opaque random token whose HMAC lives in the DB is the smallest thing that satisfies it.
`bcryptjs` (pure JS) avoids the native-build friction that bites on Windows / pnpm. Fewer
dependencies, easier to audit, no third-party identity layer to learn or configure.
**No middleware** — `(authed)/layout.tsx` → `requireOwner()` is the security boundary,
which keeps the auth surface in one place a reviewer can read top-to-bottom.

### 7.6 Why eagerly generate all 7 variants at publish (not lazily per request)

Three reasons. **Performance:** AI never sits in the page-serving request path — the
public page is deterministic and fast, independent of `GOOGLE_API_KEY` on the serving
side. **Atomicity:** publish becomes all-or-nothing — a failed re-publish leaves the
previous live page intact (the visitor never sees a half-published site). **Review:**
the owner can preview every audience immediately at `/preview?type=…` after a successful
publish, without paying for an inference each preview.

### 7.7 Why Gemini (`gemini-2.5-flash-lite` via `@google/genai`)

Google's lowest-latency structured-output-capable model. Billing is enabled on the key,
so we don't worry about the free-tier RPD/RPM ceilings that briefly drove us to
`gemini-3.1-flash-lite`; speed wins. The migration from Anthropic landed in
`plans/11-gemini-migration-plan.md`; behaviour / retries / all-or-nothing semantics /
`CopyBundle` shape are unchanged.

### 7.8 Why structured output with `responseSchema` (not JSON-mode + post-parse)

`responseMimeType: 'application/json'` + `responseSchema` make JSON-shape failures
effectively impossible — fewer retry round-trips and a simpler error surface than parsing
free-form JSON. Content-level rules (`validateCopyBundle` — word / sentence counts, char
caps) still run with a retry-with-error-feedback loop, because the schema can't express
those.

### 7.9 Why the 7 calls fan out in parallel (no inter-call pacing, no 429 back-off)

Each call is independent — same enhanced source text, different persona block. The
throughput win matters because the publish is interactive (the Re-publish button needs
to feel snappy). The in-memory `PublishJob` (`apps/owner/src/lib/publish-jobs.ts`)
tracks `{ completed, total }` so the polled progress bar fills "X / 7" live as each
variant returns.

### 7.10 Why no prompt caching

The `BASE_COPY_PROMPT` prefix doesn't clear Gemini's implicit-cache token threshold, and
explicit caching isn't worth the ceremony for 8 calls per publish. The cost shape is fine
without it.

### 7.11 Why one venue per owner (no venue selector)

The product is a job-interview hospitality-builder demo; multi-venue is an explicit
non-goal in PRD §7. `Venue.ownerId @unique` is the DB invariant; the builder has no venue
selector, and `getOwnerVenue()` returns the owner's single venue (or `null` if they
haven't created one yet).

### 7.12 Why slug derivation is strict, and why it freezes at first publish

The owner types the **venue name**, not a URL. The derivation
(`^[A-Za-z]+( [A-Za-z]+)*$`, internal whitespace collapsed, lower-cased, spaces removed)
is deterministic (same name → same slug, so we detect collision before insert),
URL-safe (no percent-encoding ambiguity), and matches what a hospitality owner would
intuit from the URL. The slug is frozen at first publish via `Venue.slugLockedAt` so the
public URL never changes underneath visitors.

### 7.13 Why no rich-text editor, no drag-and-drop, no image placement

The product's differentiator is that **AI authors the page**. The owner supplies only
name + free-text description + one image — that's the whole input. Templates and styling
are **supplied design assets** (`plans/site-design/` + `plans/copy-rules/`), not
AI-generated; AI touches the description text only (never the image, never the layout).
Adding an editor or drag-and-drop would compete with the differentiator.

### 7.14 Why the visitor type is in an `httpOnly` cookie (never the URL)

The demo tab is a **reviewer aid** — a real visitor never sees or picks their visitor
type. Putting it in the URL would imply it's part of the page's public identity, but it
isn't. The customer app reads the cookie SSR-side and passes the type inside the
server-to-server API call; absent / unknown → `neutral`.

### 7.15 Why the owner ↔ customer REST API has no auth

Local demo (PRD §7). The slug is the identity. Production hardening — API
authentication, rate limiting, multi-tenancy — is an explicit non-goal (§9). Adding auth
between the two local processes would be ceremony that the demo does not benefit from.

### 7.16 Why `POST …/events` is not gated on publish state

The request was understood; the venue exists; there's just no live snapshot yet (or
there is — but recording shouldn't care). The `/preview` flow still emits beacons in dev,
and the dashboard's hover/click counts work the same on either side of publish. Unknown
slug → `404 not_found`; unpublished slug → `201` and the row is inserted.

### 7.17 Why shared types as raw TS (`packages/contracts/`) via `transpilePackages`

Both apps' `next.config.ts` lists `@mizrahitality/contracts` in `transpilePackages`, so
the package is consumed as TypeScript source. **No build step. No publish step.** A
contract change is one edit — both apps see it on the next type-check. The package has
zero runtime dependencies: types + plain constants only.

### 7.18 Why image storage is a gitignored `apps/owner/uploads/` directory served by a route handler

No cloud, no infra. `apps/owner/src/app/uploads/[...path]/route.ts` validates the path,
guards against traversal, and streams the file. Keys are server-generated random hex —
unguessable. The 3 supplied stock images are committed under `apps/owner/public/stock/`
so the demo seed produces a working page on a fresh checkout — no upload step required.

### 7.19 Why per-variant body typography is part of `RenderedPage` (not derived client-side)

The customer is a thin renderer over a DTO; it gets `RenderedPage` and renders. Computing
typography client-side would couple the customer to the per-variant copy rules and make
the API contract leakier. Folding typography into the DTO keeps the customer dumb and
the contract self-describing.

### 7.20 Why the dashboard polls (not WebSockets / SSE)

The dashboard updates as new events arrive (REQ-9). A short poll keeps the
implementation trivial (one `useEffect`, one interval, skip when `document.hidden`),
keeps the demo lively, and avoids a second protocol. WebSockets / SSE would buy little
for a single owner watching a single dashboard.

### 7.21 Why `Event.visitorType` is a plain string (not an FK to `PageVariant`)

The visitor type is the API identity — aggregation needs no join with `PageVariant`. A
visitor can hit an existing-but-unpublished slug and still produce a valid `visit` row;
forcing an FK would make `Event` writes contingent on a published variant. Denormalising
keeps writes single-row and the schema rectangular.

## 8. Testing strategy

Vitest, moderate rigor, `environment: 'node'`.

- **Pure modules** are tested directly and exhaustively: `validateCopyBundle` /
  `parseCopyBundle` / `parsePageVariantContent` / `parseAnalyticsEventRequest` (the
  contract validators), `buildRenderedPage` (the DTO assembler), `computeDashboard` (the
  dashboard aggregator — every REQ-8 figure has cases), `deriveSlugBase` / the slug
  collision loop, the venue-name / description / upload validators
  (`apps/owner/src/lib/validation.ts` + `uploads.ts`).
- **AI + DB-touching code** has integration coverage with an injected client / Prisma
  client. `runPublishPipeline` is exercised with a fake Gemini that returns canned
  bundles (happy path + validation-failure path + partial-success rollback).
- **Seed dataset** is drift-guarded by `apps/owner/src/__tests__/seed-data.test.ts` —
  validates all 14 canned `CopyBundle` JSON files via `validateCopyBundle` +
  `parsePageVariantContent` and asserts each venue file covers all 7 variants.
- **Route handlers** are thin wrappers over the pure decision logic; covered by
  `pnpm build` + manual checks against the seeded demo.
- **UI** is lighter — the SSR pages are smoke-tested via their domain functions; the
  client-only islands (`book-now-button`, the demo tab) aren't unit-tested.
- Test files live under each workspace's `src/__tests__/` tree.

Run `pnpm test` for everything; `pnpm --filter mizrahitality-owner test -- <pattern>`
for one file.

## 9. What's NOT here / non-goals

The deferred-scope list also lives in `README.md` §"Out of scope" and `CLAUDE.md`
§"Out of scope (don't build)". Highlights:

- No real custom domains / DNS / SSL / hosting — the "domain" is a URL-path slug;
  everything is localhost.
- No real booking or payments — "Book Now" ends at a confirmation modal.
- No multiple venues per account / no venue selector — one page per owner.
- No API authentication or keys — the API is open; localhost-only demo.
- No multi-page sites, no free-form layout, no drag-and-drop, no rich-text editor, no
  image-placement controls.
- No AI-generated styling or templates, no AI image editing — AI authors the
  description text only; templates and styling are supplied design assets.
- No teams / roles; no email verification or password reset.
- No real visitor identification — the demo tab simulates it.
- No analytics beyond the specified dashboard.

Reach for `README.md` §"Out of scope" before asking "where's the X flow?".

## 10. Where to read what

| If you want… | Read |
| --- | --- |
| Why this product exists, who it's for | `VISION.md`, `PRD.md` §1–§4 |
| The exact requirement set (REQ-1 … REQ-19) | `PRD.md` §5 |
| Build order, settled decisions, open questions | `NOTES.md` |
| The REST contract (every endpoint, every error shape) | `README.md` §"REST API contract" |
| The full per-file engineering tour | `CLAUDE.md` |
| Per-feature implementation history | `plans/00-master-plan.md` + `plans/NN-*-plan.md` |
| Schema history | `apps/owner/prisma/CHANGELOG.md` |
| How to run it | `README.md` |
