# Mizrahitality

A monorepo with two cooperating products for non-technical hospitality venue owners. A venue owner signs up (email + password), then in the builder gives a venue name, a rough free-text description, and one image — uploaded, or chosen from a small supplied stock set — and that's the whole input. The platform polishes the description text with AI, authors it into pre-designed per-audience templates (one page = a Rich Text slot + an Image slot), publishes a server-rendered page, and hands back an analytics dashboard. One venue per owner. A separate SSR visitor site renders that page per visitor type by calling the platform's REST API.

It's a job-interview deliverable; product rationale (and a bit of levity) lives in [`VISION.md`](VISION.md) and [`PRD.md`](PRD.md). Build notes / order / open questions are in [`NOTES.md`](NOTES.md). Engineering orientation is in [`CLAUDE.md`](CLAUDE.md).

## The two products

- **`mizrahitality-owner`** (`apps/owner`) — Next.js (App Router), SSR builder platform. Owns the Prisma + SQLite database and exposes the REST API. One venue per owner. Port **5111**.
- **`mizrahitality-customer`** (`apps/customer`) — Next.js (App Router), SSR public visitor site at `/<venue-slug>`. On every request it calls the owner API for the page matching the current visitor type, renders it, and posts back analytics events. The visitor type stays server-side — never in the URL or the page UI. Port **5112**.

They share **`@mizrahitality/contracts`** (`packages/contracts`) — TypeScript types + plain constants, zero runtime deps — and otherwise talk **only** over the owner app's REST API (open — localhost-only demo, no keys): no shared DB handle, no cross-app imports.

## Layout

```
apps/owner/          # mizrahitality-owner — SSR builder, REST API, owns Prisma + SQLite; port 5111
apps/customer/       # mizrahitality-customer — SSR visitor site at /<slug>; port 5112
packages/contracts/  # @mizrahitality/contracts — shared TS types + constants; zero runtime deps
scripts/seed.mjs     # demo seed — Owner #1 with a published venue + history, Owner #2 empty
VISION.md, PRD.md    # product docs — the what and why
NOTES.md             # build order, decisions, open questions
```

> Status: in progress. Landed so far — the monorepo foundation (feature #1: pnpm workspace, `@mizrahitality/contracts`, both Next.js App-Router/Tailwind-v4 app skeletons, shadcn/ui in `apps/owner`, ESLint flat config / Prettier / Vitest, the root scripts below), owner authentication (feature #2: `Owner` / `Venue` / `Session` Prisma models with a migration history, email + password sign-up / sign-in / sign-out over `httpOnly` cookie sessions), the venue builder (feature #3: name → derived slug, free-text description, one image uploaded **or** picked from 3 supplied stock images; a saved-content preview; an authed dashboard + nav; a `Publish` stub that flips `publishState` and freezes the slug), AI copy + variants (feature #4: "Enhance with AI" polishes the description text, and Publish generates the 7 audience-tailored copy bundles — one per visitor type — validates them, and stores them as `PageVariant` rows, all-or-nothing with retries; a read-only "Generated pages" list with per-audience regenerate), the SSR published page (feature #5: the owner can view their server-rendered venue page — the 5-zone "Warm Minimalist" design — at `/preview`, with `?type=<visitor-type>` to preview each audience), and the open REST/JSON API (feature #6: `GET /api/venues/<slug>/page?type=<visitor-type>` returns the precomputed page payload; `POST /api/venues/<slug>/events` records `visit` / `book-now-hover` / `book-now-click` events; an `Event` model; no auth — see the contract below). The dashboard and the customer site arrive with later features (`NOTES.md` → "Build order").

## Prerequisites

- Node 22 LTS (see `.nvmrc`)
- pnpm via Corepack: `corepack enable && corepack install`
- An Anthropic API key (`ANTHROPIC_API_KEY` in `apps/owner/.env`) — not needed to install / build / run / test the app, but needed to use "Enhance with AI" and to Publish (which generates the 7 audience-tailored pages); without it those features show a "not configured" hint

## Setup & run

```bash
pnpm install                                  # install workspace deps
cp apps/owner/.env.example apps/owner/.env       # required — apps/owner needs DATABASE_URL + SESSION_SECRET (the example ships a dev SESSION_SECRET)
cp apps/customer/.env.example apps/customer/.env
pnpm db:migrate                               # create the SQLite database + apply migrations
pnpm seed                                     # populate demo data (Venue #1 history, Venue #2 empty)
pnpm dev                                      # run both apps — owner :5111, customer :5112
```

Then open the owner platform at `http://localhost:5111` and a venue's public page at `http://localhost:5112/<slug>`. After you publish a venue, the owner can view its server-rendered page at `http://localhost:5111/preview` (append `?type=<visitor-type>` — e.g. `?type=female-18-30`, or `50%2B` for the `50+` groups — to preview each audience).

Uploaded venue images are written to `apps/owner/uploads/` (gitignored, created on demand) and served by the owner app at `/uploads/...`; the 3 supplied stock images are committed under `apps/owner/public/stock/`.

## Scripts (root)

| Script | Does |
|---|---|
| `pnpm dev` | Run both apps in dev (`-r --parallel`) — owner :5111, customer :5112 |
| `pnpm build` | Build both apps |
| `pnpm lint` | ESLint across the workspace (`no-explicit-any` is an error) |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm test` | Vitest across all packages |
| `pnpm --filter mizrahitality-owner test` | Run one package's tests (swap the filter; append `-- <pattern>` for a single test) |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm db:migrate` | Create/apply a Prisma migration (`apps/owner/prisma/migrations/`) |
| `pnpm db:push` | Push the schema to SQLite without a migration (legacy — prefer `db:migrate`) |
| `pnpm db:studio` | Open Prisma Studio against the owner DB |
| `pnpm seed` | Run `scripts/seed.mjs` |

Schema changes go through the `update-database` skill; the changelog is `apps/owner/prisma/CHANGELOG.md`.

## REST API contract

The owner app exposes the API; `mizrahitality-customer` is its only consumer. The API is **open** — no authentication, no keys, no tokens — because everything runs on localhost for the demo. Failures return a JSON `ApiError` body — `{ "error": "<code>", "message": "<human-readable text>" }` — with the matching status code (`bad_request` → 400, `not_found` → 404). Wrong HTTP method on a route → `405`. Types + the visitor-type enum live in `@mizrahitality/contracts`.

### `GET /api/venues/<slug>/page?type=<visitor-type>`

Returns `200` with the precomputed **rendered-page payload** for that variant (`RenderedPage`): the audience copy bundle + the absolute hero `imageUrl` + the per-variant body typography + the fixed UI strings (`"Book Now"`, `"Powered by Mizrahitality"`). Response header `Cache-Control: no-store` (the customer site re-fetches per request to pick up the cookie-selected visitor type).

- Unknown/absent/unrecognised `type` → the `neutral` variant. `type` is supplied by the customer app **server-side** — it never appears in a browser URL; the `50+` age groups travel URL-encoded (`?type=male-50%2B`).
- Unknown slug, or a venue that hasn't been published → `404 not_found`.
- Pages are precomputed at publish (feature #4) — **no AI call in this path**.

### `POST /api/venues/<slug>/events`

Body — JSON: `{ "type": "visit" | "book-now-hover" | "book-now-click", "visitorType": "<visitor-type>", "sessionId"?: "<opaque string>" }`. Returns `201` with `{ "ok": true }`; records one event row against that venue.

- `sessionId` is **optional** — an opaque per-browser-session correlator the customer site mints (it powers the dashboard's hover→click funnel %); omit it and it's stored as `null`. The route never 400s on a missing one.
- A non-object / non-JSON body, or a bad/missing `type` or `visitorType` → `400 bad_request`.
- Unknown slug → `404 not_found`. (Recording is **not** gated on publish state — any existing venue accepts events.)

**Visitor type** = gender (`male` / `female`) × age group (`18-30` / `31-50` / `50+`) → 6, plus `neutral` = **7 variants per published venue**.

## Out of scope

Real domains/DNS/SSL/hosting (the "domain" is a URL-path slug; everything is localhost); real booking or payments ("Book Now" ends at a confirmation modal); multiple venues per account / venue selector (one page per owner); API authentication or keys (the API is open — localhost-only demo); multi-page sites, free-form layout, drag-and-drop, a rich-text editor, image-placement controls; AI-generated styling or templates or AI image editing (templates/styling are supplied design assets; the AI only authors the description text into the Rich Text slot); teams/roles; email verification or password reset; real visitor identification (it's simulated via the demo tab); analytics beyond the specified dashboard.
