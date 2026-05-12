# Mizrahitality

A monorepo with two cooperating products for non-technical hospitality venue owners. A venue owner signs up, writes a rough description of their place and uploads one photo — and that's the whole input. The platform polishes the copy with AI, authors it into pre-designed per-audience templates (one page = a Rich Text slot + an Image slot), publishes a server-rendered page, and hands back an analytics dashboard. A separate SSR visitor site renders that page per visitor type by calling the platform's REST API.

It's a job-interview deliverable; product rationale (and a bit of levity) lives in [`VISION.md`](VISION.md) and [`PRD.md`](PRD.md). Build notes / order / open questions are in [`NOTES.md`](NOTES.md). Engineering orientation is in [`CLAUDE.md`](CLAUDE.md).

## The two products

- **`mizrahitality-owner`** (`apps/owner`) — Next.js (App Router), SSR builder platform. Owns the Prisma + SQLite database and exposes the REST API. Port **5111**.
- **`mizrahitality-customer`** (`apps/customer`) — Next.js (App Router), SSR public visitor site at `/<venue-slug>`. On every request it calls the owner API for the page matching the current visitor type, renders it, and posts back analytics events. Authenticated by a per-venue API key. Port **5112**.

They share **`@mizrahitality/contracts`** (`packages/contracts`) — TypeScript types + plain constants, zero runtime deps — and otherwise talk **only** over the owner app's REST API: no shared DB handle, no cross-app imports.

## Layout

```
apps/owner/          # mizrahitality-owner — SSR builder, REST API, owns Prisma + SQLite; port 5111
apps/customer/       # mizrahitality-customer — SSR visitor site at /<slug>; port 5112
packages/contracts/  # @mizrahitality/contracts — shared TS types + constants; zero runtime deps
scripts/seed.mjs     # demo seed — Venue #1 with history, Venue #2 empty
VISION.md, PRD.md    # product docs — the what and why
NOTES.md             # build order, decisions, open questions
```

> Status: not yet scaffolded on `main`. The workspace skeleton + `@mizrahitality/contracts` exist on branch `feature/monorepo-foundation` (`.worktrees/monorepo-foundation`); the app skeletons aren't done. See `NOTES.md` → "Open / pending". Update this section once the foundation lands on `main`.

## Prerequisites

- Node 22 LTS (see `.nvmrc`)
- pnpm via Corepack: `corepack enable && corepack install`
- An Anthropic API key for the publish-time AI steps (`ANTHROPIC_API_KEY` in `apps/owner/.env`) — not needed to run the skeleton

## Setup & run

```bash
pnpm install                                  # install workspace deps
cp apps/owner/.env.example apps/owner/.env       # then fill in values
cp apps/customer/.env.example apps/customer/.env
pnpm db:push                                  # create the SQLite database
pnpm seed                                     # populate demo data (Venue #1 history, Venue #2 empty)
pnpm dev                                      # run both apps — owner :5111, customer :5112
```

Then open the owner platform at `http://localhost:5111` and a venue's public page at `http://localhost:5112/<slug>`.

## Scripts (root)

| Script | Does |
|---|---|
| `pnpm dev` | Run both apps in dev (`-r --parallel`) — owner :5111, customer :5112 |
| `pnpm build` | Build both apps |
| `pnpm lint` | ESLint across the workspace (`no-explicit-any` is an error) |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm test` | Vitest across all packages |
| `pnpm test --filter mizrahitality-owner` | Run one package's tests (swap the filter; append `-- <pattern>` for a single test) |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm db:push` | Apply the Prisma schema to SQLite (no migration history) |
| `pnpm db:migrate` | Create/apply a migration (no-op while the schema is empty) |
| `pnpm db:studio` | Open Prisma Studio against the owner DB |
| `pnpm seed` | Run `scripts/seed.mjs` |

Schema changes go through the `update-database` skill; the changelog is `apps/owner/prisma/CHANGELOG.md`.

## REST API contract

The owner app exposes the API; `mizrahitality-customer` is its only consumer. Every request carries the venue's API key.

- **Auth:** `x-venue-api-key: <key>` header, scoped to one venue. Missing/invalid key → `401`/`403`. Unknown slug → `404`.
- **Get a rendered page** — `GET /api/venues/<slug>/page?type=<visitor-type>` → the fully-composed page payload (the Rich Text slot's authored content + the Image slot's photo URL + template styling) for that variant. Unknown/absent `type` → the `neutral` variant. Pages are precomputed at publish; no AI call in this path.
- **Report an event** — `POST /api/venues/<slug>/events` with `{ "type": "visit" | "book-now-hover" | "book-now-click", "visitorType": "<visitor-type>" }` → records the event against that venue.

**Visitor type** = gender (`male` / `female`) × age group (`18-30` / `31-50` / `50+`) → 6, plus `neutral` = **7 variants per published venue**. The enum and the API key header constant live in `@mizrahitality/contracts`.

> Endpoint paths/shapes here are the intended contract; this section gets pinned to the implementation when `analytics-api` lands.

## Out of scope

Real domains/DNS/SSL/hosting (the "domain" is a URL-path slug; everything is localhost); real booking or payments ("Book Now" ends at a confirmation modal); multi-page sites, free-form layout, drag-and-drop, a rich-text editor, image-placement controls; AI-generated styling or templates (those are supplied design assets — the AI only authors copy into slots); teams/roles; email verification or password reset; real visitor identification (it's simulated via the demo tab); analytics beyond the specified dashboard.
