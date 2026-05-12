# Feature #6 — analytics-api — implementation plan

> Plan file to land at `plans/06-analytics-api-plan.md` when approved (mirrors how #5's draft became `plans/05-published-page-ssr-plan.md`). This is the working draft.

## Context

Features #1–#5 got us a builder, AI-generated copy, and the owner's own SSR published page (`/preview`). But the two apps are still wired to talk **only over the owner app's REST API**, and that API doesn't exist yet — `apps/customer` is still the foundation stub. Feature #6 builds the **open REST/JSON API** the customer app (#8) and the dashboard's data (#7) depend on:

1. `GET /api/venues/<slug>/page?type=<visitor-type>` → the precomputed `RenderedPage` payload for that variant. Unknown/absent `type` → `neutral`. Unknown slug — or a venue that isn't published — → `404`. **No AI in this path** (variants were generated at publish, #4); the response is built by reusing `lib/rendered-page.ts`'s `buildRenderedPage` (#5) with a `baseUrl` so `imageUrl` comes out absolute.
2. `POST /api/venues/<slug>/events` with `{ "type": "visit" | "book-now-hover" | "book-now-click", "visitorType": "<visitor-type>", "sessionId"?: "<opaque>" }` → records the event against that venue. Unknown slug → `404`.
3. An `Event` Prisma model (venue FK, type, visitor type, session correlator, timestamp) via the `update-database` skill.
4. **No auth** — no keys, no tokens (open localhost-only demo).
5. Event request/response DTOs added to `@mizrahitality/contracts` (`analytics.ts`), reusing the existing `RenderedPage` DTO for the GET response.

Satisfies **REQ-9** (REST/JSON API), **REQ-3** (open API — finalized), **REQ-16** (the event-ingestion side; the emit side is #8), **REQ-21** (documented API contract — pinned into `README.md` on landing). May interleave with #5 (already done); #7 and #8 depend on this.

## Decisions (confirmed with the user)

1. **`sessionId` — optional + lenient.** The customer site (#8) mints an opaque per-browser-session id and sends it on every event; it's needed for #7's "clickers who hovered ≥ once ÷ all clickers" funnel %. But the DTO field is **optional** (`sessionId?: string`) and the POST route is **lenient** — stores it when present, stores `null` when absent, never 400s on a missing one. Keeps `curl`/seed usage and the README's already-sketched `{ type, visitorType }` body valid (this is a clean superset). DB column is `String?` (nullable).
2. **Publish gating — GET strict, POST loose.** `GET` → `404 not_found` unless `venue.publishState === 'published'` **and** `buildRenderedPage` returns `ok` (mirrors `app/preview/page.tsx`'s check; never leaks unpublished content over the open API). `POST` → records the event against **any existing venue** regardless of publish state; only `404` if the slug doesn't resolve (dropping an event for an un-publishing venue is worse than recording it, and the customer only ever POSTs for a page it just rendered).
3. **`parseAnalyticsEventRequest` lives in `@mizrahitality/contracts`** (`analytics.ts`), next to the new DTOs — pure, zero-dep, mirroring how `isVisitorType`/`parseVisitorType` live with `VisitorType` and `parsePageVariantContent` lives with the copy types. Keeps the route handler a thin shell; hand-rolled `{ ok, value } | { ok, error }` result (no zod — the repo has no validation lib).
4. **"Clicker who hovered ≥ once" = a `sessionId` with ≥1 `book-now-hover` event and ≥1 `book-now-click` event, order ignored** (pinned now so #7 inherits it; #8 emits at most one hover per session, so ordering is moot). Events with no `sessionId` are excluded from this percentage only.

### Minor decisions settled in-plan (conventional defaults — flag if you disagree)
- **POST success → `201` with body `{ ok: true }`** (a row was created; not `204`, which forbids a body).
- **GET response sets `Cache-Control: no-store`** — the customer SSR (#8) re-fetches per request to pick up the cookie-selected visitor type; a cached response would serve a stale variant. (The existing `app/uploads` route's `private, max-age=60` is for binary images — different concern, not copied here.)
- **`baseUrl` = `new URL(req.url).origin`** — no new env var. The request hits the owner app on its own origin (`http://localhost:5111`), which is exactly where the customer's `<img>` will load `/uploads/…` from. A reverse-proxied deployment would want an `OWNER_PUBLIC_BASE_URL` override, but there's no proxy here — out of scope; a one-line note in the code comment.
- **`Event` indexes — just `@@index([venueId])`.** Demo-scale data; #7 aggregates a venue's events in memory (or one `groupBy`). Composite indexes (`[venueId, type]`, `[venueId, createdAt]`) are premature; #7 can add one later if a query ever needs it.
- **No `Event.updatedAt`** — events are immutable; the other models have `updatedAt` but events genuinely never update. Noted in the CHANGELOG.
- **POST validation order: validate the body first (400), then resolve the slug (404)** — cheaper, no DB hit on garbage; the consumer controls both anyway.
- **`visitorType` in the POST body is validated strictly** (`isVisitorType` → 400 if not one of the 7), as is `type` (must be in `ANALYTICS_EVENT_TYPES`). A bad value in *recorded analytics* is a real bug worth surfacing — unlike the GET `?type` param, which is a "render something" input and stays lenient (`parseVisitorType` → `neutral`).

## Scope

### 1. Contracts — `packages/contracts/src/analytics.ts` (extend; no new file)
- `import type { VisitorType } from './visitor';` at the top (currently imports nothing).
- `AnalyticsEventRequest { type: AnalyticsEventType; visitorType: VisitorType; sessionId?: string }` — the `POST …/events` body.
- `AnalyticsEventResponse { ok: true }` — the `POST …/events` success body.
- `parseAnalyticsEventRequest(body: unknown): { ok: true; value: { type: AnalyticsEventType; visitorType: VisitorType; sessionId: string | null } } | { ok: false; message: string }` — pure validator: rejects non-objects; `type` must be in `ANALYTICS_EVENT_TYPES`; `visitorType` must satisfy `isVisitorType`; `sessionId` is OK absent/`null`/`undefined`, or a non-empty `string` (anything else → reject); normalises `sessionId` to `string | null`. One clear `message` per failure (used verbatim as the `ApiError.message`).
- The GET response is the existing `RenderedPage` — **no new alias** (it *is* the response).
- Update the file header comment ("Event request/response DTOs are added by feature #6" → "…added by feature #6, below").
- `index.ts` already does `export * from './analytics'` — no change. Zero new runtime deps (the package stays types + plain functions + constants).
- `packages/contracts/src/analytics.test.ts` (new) — unit-test `parseAnalyticsEventRequest`: valid `{type, visitorType, sessionId}`; valid without `sessionId` → `value.sessionId === null`; bad `type` → `{ ok:false }`; bad `visitorType` → `{ ok:false }`; non-object body → `{ ok:false }`; empty-string `sessionId` → `{ ok:false }`. (Mirrors the existing `copy.test.ts`/`page.test.ts` in the package.)

### 2. Database — `apps/owner/prisma/schema.prisma` (via the `update-database` skill)
Add:
```prisma
model Event {
  id          String   @id @default(cuid())
  venueId     String
  venue       Venue    @relation(fields: [venueId], references: [id], onDelete: Cascade)
  type        String   // one of ANALYTICS_EVENT_TYPES ('visit' | 'book-now-hover' | 'book-now-click')
  visitorType String   // one of the 7 VisitorType values (incl. 'neutral')
  sessionId   String?  // opaque per-browser-session correlator the customer site mints (#8); nullable — direct API/seed callers may omit it; powers #7's hover→click funnel %
  createdAt   DateTime @default(now())

  @@index([venueId])
  @@map("events")
}
```
and `events Event[]` to `model Venue`. Run the skill → migration `add-event-model` (a plain `CREATE TABLE events (...)` + `CREATE INDEX` — non-destructive, no SQLite table-redefine, unlike #3's `venues` rebuild). Then `prisma generate` (the route handler's `prisma.event.create` won't typecheck until the client regenerates). Prepend a `## DD-MM-2026 — add-event-model (feature #6 analytics-api)` entry to `apps/owner/prisma/CHANGELOG.md` in the existing format — record: the model + the `events` relation on `Venue`; `sessionId` nullability rationale; the single-`[venueId]`-index decision; no `updatedAt` (events are immutable); the read-only consumer is #7; non-destructive.

> Heads-up (from memory): if `next dev` is running it may hold the Prisma query-engine DLL on Windows — stop it before `prisma generate`/`migrate dev`.

### 3. Owner — the GET route — `apps/owner/src/app/api/venues/[slug]/page/route.ts` (new)
Top-level `/api/…`, deliberately **outside `(authed)`** (open API — same posture as `app/uploads/[...path]/route.ts`). Imports `prisma`, `buildRenderedPage`, `parseVisitorType`, `type ApiError` — **not** `lib/auth`/`requireOwner` (these handlers are unauthenticated; they only need `prisma`).

```ts
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const requestedType = parseVisitorType(url.searchParams.get('type'));
  const venue = await prisma.venue.findUnique({ where: { slug }, include: { variants: true } });
  if (!venue || venue.publishState !== 'published') {
    return NextResponse.json<ApiError>(
      { error: 'not_found', message: `No published page for venue "${slug}".` },
      { status: 404 },
    );
  }
  const built = buildRenderedPage({ venue, variants: venue.variants, requestedType, baseUrl: url.origin });
  if (!built.ok) {
    return NextResponse.json<ApiError>({ error: 'not_found', message: built.error }, { status: 404 });
  }
  return NextResponse.json(built.value, { headers: { 'Cache-Control': 'no-store' } });
}
```
- `searchParams.get('type')` already URL-decodes — `?type=female-50%2B` arrives as `female-50+`, which `parseVisitorType` accepts. (`parseVisitorType` → `neutral` on `null`/garbage.)
- Reading `req.url` makes the handler dynamic — no stale-render risk; an explicit `export const dynamic = 'force-dynamic'` is optional and unnecessary.
- Header comment notes: open/unauthenticated; reuses `buildRenderedPage` (#5); `baseUrl = req origin` (a proxied deploy would need an env override — out of scope); precomputed payload, no AI here.

### 4. Owner — the POST route — `apps/owner/src/app/api/venues/[slug]/events/route.ts` (new)
```ts
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json<ApiError>({ error: 'bad_request', message: 'Request body must be JSON.' }, { status: 400 });
  }
  const parsed = parseAnalyticsEventRequest(body);
  if (!parsed.ok) {
    return NextResponse.json<ApiError>({ error: 'bad_request', message: parsed.message }, { status: 400 });
  }

  const venue = await prisma.venue.findUnique({ where: { slug }, select: { id: true } });
  if (!venue) {
    return NextResponse.json<ApiError>({ error: 'not_found', message: `No venue "${slug}".` }, { status: 404 });
  }

  await prisma.event.create({
    data: { venueId: venue.id, type: parsed.value.type, visitorType: parsed.value.visitorType, sessionId: parsed.value.sessionId },
  });
  return NextResponse.json<AnalyticsEventResponse>({ ok: true }, { status: 201 });
}
```
- `select: { id: true }` — only the FK is needed (don't `include` the variants here).
- Not gated on `publishState` (decision 2).
- Wrong HTTP method on either route auto-405s (no handler exported) — fine, nothing to add.

### 5. Owner — tests — `apps/owner/src/__tests__/analytics-api.integration.test.ts` (new)
Drive the route handlers directly against the throwaway DB — `import { GET } from '@/app/api/venues/[slug]/page/route'`, `import { POST } from '@/app/api/venues/[slug]/events/route'`, call with a fully-qualified `new Request('http://localhost:5111/api/venues/<slug>/page?type=…')` (a `Request` requires an absolute URL — this is naturally enforced) and `{ params: Promise.resolve({ slug }) }`. Reuse the **`createOwnerWithVenue` + `fakeClient()` + `runPublishPipeline`** pattern verbatim from `publish.integration.test.ts` to materialise a published venue with the 7 stored variants. `afterEach`: unscoped `deleteMany()` in FK-child-first order — **`prisma.event.deleteMany()` first**, then `pageVariant`, `session`, `venue`, `owner`. `afterAll`: `prisma.$disconnect()`. (`globalSetup` already runs `prisma db push` against `vitest-tmp.db`, so the new `events` table auto-creates — no test-infra change. `fileParallelism: false` already covers the shared-DB concern.)

GET cases:
- unknown slug → `404`, body `{ error: 'not_found', message: … }`
- draft venue (publish never run) → `404`
- published venue, no `?type` → `200`, `body.visitorType === 'neutral'`, `body.imageUrl` absolute (`startsWith('http://localhost')`), `body.schemaVersion === 1`, `body.fixed.ctaLabel === 'Book Now'`, `body.copy` present
- `?type=female-18-30` → `200`, `body.visitorType === 'female-18-30'`
- `?type=garbage` → `200`, `body.visitorType === 'neutral'`
- `Cache-Control: no-store` on the `200` response

POST cases:
- unknown slug → `404`
- `{ type: 'visit', visitorType: 'neutral', sessionId: 's1' }` → `201`, `body.ok === true`; `prisma.event.findMany` shows one row with the right `venueId`/`type`/`visitorType`/`sessionId`
- valid **without** `sessionId` → `201`, the row's `sessionId === null` (locks the lenient decision)
- `{ type: 'book-now-click', visitorType: 'male-50+', sessionId: 's2' }` → `201`, row stored (covers the `50+` value end-to-end)
- malformed JSON (`body: 'not json'`) → `400 bad_request`
- non-object body (`body: '"hello"'`) → `400`
- bad `type` (`{ type: 'foo', visitorType: 'neutral' }`) → `400`
- bad `visitorType` (`{ type: 'visit', visitorType: 'martian' }`) → `400`

### 6. Docs (upkeep is part of the feature)
- **`NOTES.md`** — tick **#6** in the "Build order" table; add an "**analytics-api (#6) has landed**" block under "Open / pending" recording the 4 confirmed decisions + the in-plan minors (201, `no-store`, `baseUrl = req origin`, single index, no `updatedAt`); flesh out the "API contract sketch" section to match the implementation exactly (paths, the `?type` param, the request/response bodies incl. the optional `sessionId`, status codes `200`/`201`/`400`/`404`, the `ApiError` envelope, the GET's neutral fallback + publish gating, POST not gated on publish); extend the "contracts surface" bullet — `analytics.ts` now also has `AnalyticsEventRequest`/`AnalyticsEventResponse`/`parseAnalyticsEventRequest`; note `customer/lib/env.ts`'s `OWNER_API_BASE_URL` is still only consumed by #8.
- **`CLAUDE.md`** — extend the "Landed so far" paragraph with a feature-#6 clause (the two open REST routes under `app/api/venues/[slug]/`, the `Event` model, `buildRenderedPage` reused in-process with a `baseUrl`, contracts gained the event DTOs + validator); in the "Owner-app routes" conventions paragraph, add `apps/owner/src/app/api/venues/[slug]/page/route.ts` (`GET`, unauthenticated, reuses `lib/rendered-page.ts`) and `…/events/route.ts` (`POST`, unauthenticated, writes `Event`).
- **`README.md`** — update the "Status" line (add #6); **pin the "REST API contract" section to the implementation** (REQ-21): exact paths, the `?type` query param + its neutral fallback + that it's server-supplied (never in a browser URL), the POST body shape with the optional `sessionId`, the `{ ok: true }` ack, status codes (`200`/`201`/`400`/`404`), the `ApiError` `{ error, message }` envelope, "no auth — open localhost demo", "unknown/unpublished slug → 404"; drop the "Endpoint paths/shapes here are the intended contract; pinned when analytics-api lands" caveat (it's pinned now).
- **`apps/owner/prisma/CHANGELOG.md`** — the `add-event-model` entry (see §2).

## Out of scope (respect these)
- **No authentication / keys / tokens** on either endpoint — the owner API is open (localhost-only demo). No API-key UI anywhere.
- **No AI in the GET path** — serve the precomputed `PageVariant` bundles (#4); `buildRenderedPage` is pure, no model call.
- **No analytics beyond what the dashboard (#7) needs** — no `userAgent`/`ip`/`referrer`/`path` on `Event`; gender/age are *derived* from `visitorType` in #7, not stored as separate columns.
- **No de-dup at ingestion** — the API records every event raw; #8 fires sensibly (one `book-now-hover` per session, `visit` once per load), #7 does the funnel/uniqueness math from the `(venueId, type, visitorType, sessionId, createdAt)` grain.
- **No customer-app changes** — `apps/customer/src/app/[slug]/page.tsx` stays the foundation stub; #8 wires it to consume these endpoints + builds the demo tab + the "Book Now" confirmation. No `OWNER_API_BASE_URL` usage yet.
- **No dashboard / aggregation** — that's #7. **No seed data** — that's #9.
- **No new shared package, no zod / validation lib, no new env var.**

## Dependencies
- Feature #4 (done) — the stored, validated `PageVariant.content` bundles + `lib/page-variant.ts`.
- Feature #5 (done) — `lib/rendered-page.ts`'s `buildRenderedPage` (with its `baseUrl` arg — designed for this), the `RenderedPage` DTO in `@mizrahitality/contracts`.
- Feature #3 (done) — `Venue.slug @unique`, `publishState`, the `imageKind`/`imageValue` columns, the `GET /uploads/[...path]` route that serves the absolutized image URLs.
- Feature #2 (done) — the `Owner`/`Venue`/`PageVariant` schema the migration extends; the `lib/prisma.ts` singleton.
- No supplied assets needed.

## Contracts additions
`packages/contracts/src/analytics.ts` gains `AnalyticsEventRequest`, `AnalyticsEventResponse`, `parseAnalyticsEventRequest` (re-exported via the existing `export * from './analytics'` in `index.ts`). The GET response reuses the existing `RenderedPage`. No new file, zero new runtime deps.

## PRD requirements satisfied
- **REQ-9** (REST/JSON API the customer consumes) — fully: both endpoints.
- **REQ-3** (open API — no keys) — finalized here.
- **REQ-16** (analytics event flow) — the ingestion half (the emit half is #8).
- **REQ-21** (documented API contract) — pinned into `README.md`.

## Verification (end-to-end)
1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test` — all green; `analytics-api.integration.test.ts` and `analytics.test.ts` pass. Targeted: `pnpm --filter mizrahitality-owner test -- analytics-api`.
2. `pnpm db:migrate` applies `add-event-model` cleanly; `pnpm db:studio` shows an empty `events` table.
3. `pnpm dev`. Sign up / sign in an owner; in `/builder` save a venue (name, description, an uploaded or stock image) and **Publish** (needs `ANTHROPIC_API_KEY` in `apps/owner/.env` — the 7 bundles get generated + stored).
4. `curl http://localhost:5111/api/venues/<slug>/page` → `200`, a `RenderedPage` JSON with `"visitorType":"neutral"` and an **absolute** `"imageUrl":"http://localhost:5111/uploads/…"` (or `…/stock/…`); paste that `imageUrl` into a browser — the image loads (the `/uploads/*` route is open).
5. `curl 'http://localhost:5111/api/venues/<slug>/page?type=female-18-30'` → that variant's bundle (`"visitorType":"female-18-30"`); `?type=50%2B`-style values decode correctly; `?type=nonsense` → neutral.
6. `curl http://localhost:5111/api/venues/does-not-exist/page` → `404` `{ "error":"not_found", … }`. A venue that exists but hasn't been published → `404` too.
7. `curl -X POST http://localhost:5111/api/venues/<slug>/events -H 'content-type: application/json' -d '{"type":"visit","visitorType":"neutral"}'` → `201` `{ "ok":true }`; with `"sessionId":"abc"` → `201`; `pnpm db:studio` shows the rows (one with `sessionId` null, one with `"abc"`).
8. `curl -X POST … -d 'garbage'` → `400` `bad_request`; `-d '{"type":"nope","visitorType":"neutral"}'` → `400`; `-d '{"type":"visit","visitorType":"x"}'` → `400`; `POST` to an unknown slug → `404`.
9. `curl -X POST http://localhost:5111/api/venues/<slug>/page` (wrong method) → `405`. `GET …/events` → `405`.
