# Mizrahitality

A monorepo of two cooperating products for non-technical hospitality venue owners.

A venue owner signs up with an email and password, then in the builder gives a **venue name**, a **rough free-text description**, and **one image** (uploaded, or chosen from a small supplied stock set) — that's the whole input. The platform polishes the description text with AI, authors it into pre-designed per-audience templates (one page = a Rich Text slot + an Image slot), publishes a server-rendered page, and hands back an analytics dashboard. **One venue per owner.** A separate SSR visitor site renders that page per visitor type by calling the platform's REST API; the visitor type never appears in the URL or the page UI.

It's a job-interview deliverable. Product rationale (and a bit of levity) lives in [`VISION.md`](VISION.md) and [`PRD.md`](PRD.md); build order, decisions, and open questions in [`NOTES.md`](NOTES.md); engineering orientation in [`CLAUDE.md`](CLAUDE.md).

## The two products

| | Package | What it is | Port |
|---|---|---|---|
| **Owner** | `apps/owner` (`mizrahitality-owner`) | Next.js (App Router), SSR builder platform. Owns the Prisma + SQLite database and exposes the REST API. One venue per owner. | **5111** |
| **Customer** | `apps/customer` (`mizrahitality-customer`) | Next.js (App Router), SSR public visitor site at `/<venue-slug>`. On every request it calls the owner API for the page matching the current visitor type, renders it server-side, and posts back analytics events. | **5112** |

They share **`@mizrahitality/contracts`** (`packages/contracts`) — TypeScript types + plain constants, zero runtime deps — and otherwise communicate **only** over the owner app's REST API (open — no keys; localhost-only demo): no shared DB handle, no cross-app imports, no in-process calls.

## Layout

```
apps/owner/          # mizrahitality-owner — SSR builder + REST API; owns Prisma + SQLite; port 5111
apps/customer/       # mizrahitality-customer — SSR visitor site at /<slug>; port 5112
packages/contracts/  # @mizrahitality/contracts — shared TS types + constants; zero runtime deps
plans/               # the per-feature build plans (00-master-plan.md, then 01..09)
scripts/seed.mjs     # demo seed — see "Demo accounts" below
scripts/seed-data/   # canned per-venue copy-bundle JSON the seed reads (so it needs no API key)
VISION.md, PRD.md    # product docs — the what and why
NOTES.md, CLAUDE.md  # build notes / decisions; engineering orientation
```

## What's in it

Built feature by feature; all nine features have landed (plans in [`plans/`](plans/)):

1. **Monorepo foundation** — pnpm workspace, `@mizrahitality/contracts`, both Next.js App-Router/Tailwind-v4 app skeletons, shadcn/ui in `apps/owner`, ESLint flat config / Prettier / Vitest, the root scripts.
2. **Owner auth** — `Owner` / `Venue` / `Session` Prisma models (with a real migration history); email + password sign-up / sign-in / sign-out over `httpOnly` cookie sessions; route-group route guarding (no middleware).
3. **Site builder** — venue name (→ derived slug), free-text description, one image (uploaded **or** picked from 3 supplied stock images); a saved-content preview; an authed nav; a publish-flow skeleton. No layout/rich-text editor, no image placement, no drag-and-drop.
4. **AI copy + variants** — "Enhance with AI" polishes the description **text**; Publish generates the 7 audience-tailored copy bundles (one per visitor type), validates them, and stores them as `PageVariant` rows — all-or-nothing, with retries. AI never touches the image. A read-only "Generated pages" list with per-audience regenerate.
5. **SSR published page** — the owner views their server-rendered venue page (the 5-zone "Warm Minimalist" design) at `/preview`; `?type=<visitor-type>` previews each of the 7 audiences.
6. **Analytics REST API** — `GET /api/venues/<slug>/page?type=…` returns the precomputed rendered-page payload; `POST /api/venues/<slug>/events` records `visit` / `book-now-hover` / `book-now-click` events; an `Event` model. No auth (see the contract below).
7. **Analytics dashboard** — at `/dashboard`: total visits, "Book Now" hover/click counts, a fixed-last-30-days daily-visitors bar chart with an OLS trendline, gender / age-group breakdowns, "Book Now" clicks by gender, click-through % and a hover→click funnel %, and a per-audience conversion table — all server-computed. An empty venue shows zeroed / "No data yet" states, never an error.
8. **SSR customer site** — the public visitor page at `:5112/<slug>` fetches the rendered page from the owner API per request and renders the 5-zone design server-side; a mid-left hover-out "Preview as…" tab cycles the previewed audience via an `httpOnly` cookie (never in the URL or page UI); "Book Now" records the click and shows a confirmation modal (no real booking); `visit` / `book-now-hover` / `book-now-click` post back to the owner API; an unknown slug or an unreachable owner API shows a friendly page, never a stack trace.
9. **Demo seed** — `pnpm seed` builds the whole reviewer demo with no API key: Owner #1 with a published venue ("Hotel Mizrahi") + ~30 days of historical analytics, Owner #2 with a published venue ("The Levant House") + an empty dashboard. Re-running resets the demo data.

## Prerequisites

- **Node 22 LTS** (see [`.nvmrc`](.nvmrc))
- **pnpm** via Corepack: `corepack enable && corepack install`
- **`GOOGLE_API_KEY`** (in `apps/owner/.env`) — **optional**. A Google AI Studio key (https://aistudio.google.com → "Get API key"). Not needed to install, build, test, run, or `pnpm seed` (the seed's variant copy is canned JSON). It's needed only to use "Enhance with AI" and to Publish (which generates the 7 audience-tailored pages); without it those two features show a "not configured" hint and everything else works.

## Quickstart

From a clean checkout (with the [prerequisites](#prerequisites) in place):

```bash
pnpm install                                     # install workspace deps (runs `prisma generate` for apps/owner)
cp apps/owner/.env.example apps/owner/.env       # required — apps/owner needs DATABASE_URL + SESSION_SECRET (the example ships a throwaway dev SESSION_SECRET)
cp apps/customer/.env.example apps/customer/.env # required — apps/customer needs OWNER_API_BASE_URL
pnpm db:migrate                                  # create the SQLite database + apply migrations
pnpm seed                                        # populate the demo data — two demo accounts (see below); no API key needed
pnpm dev                                         # run both apps in parallel — owner :5111, customer :5112
```

That's the whole setup — no manual builder/publish step and no `GOOGLE_API_KEY` needed. Now open:

- the owner platform — **http://localhost:5111** (sign in with a [demo account](#demo-accounts))
- a venue's public page — **http://localhost:5112/hotelmizrahi**
- the owner's server-rendered page — **http://localhost:5111/preview** (append `?type=<visitor-type>` — e.g. `?type=female-18-30`, or `?type=male-50%2B` for the `50+` groups — to preview each audience)

## Demo accounts

`pnpm seed` creates two demo owners; sign in at **http://localhost:5111**:

| Account | Password | Venue (slug) | Customer page | Dashboard |
|---|---|---|---|---|
| `owner@mizrahitality.test` | `mizrahitality` | Hotel Mizrahi (`hotelmizrahi`) | http://localhost:5112/hotelmizrahi | full — ~30 days of analytics |
| `owner2@mizrahitality.test` | `mizrahitality` | The Levant House (`thelevanthouse`) | http://localhost:5112/thelevanthouse | empty — "No data yet" until visitors arrive |

Visit either customer page — click "Book Now", or cycle the "Preview as…" tab — and watch that owner's `/dashboard` numbers move. **Re-run `pnpm seed`** (with the dev servers stopped) to reset the demo data: the two demo owners are deleted and recreated; any other accounts you've created are left untouched.

## Using the apps

### The owner platform (`:5111`)

- **Sign up / sign in** with an email and password (`/sign-up`, `/sign-in`).
- **Builder** (`/builder`) — set the venue name (English letters + spaces; the slug is derived from it: lowercased, spaces removed), a free-text description, and one image (upload a JPEG/PNG/WebP ≤ 5 MB, or pick one of the 3 stock images). "Enhance with AI" rewrites the description text (needs `GOOGLE_API_KEY`). **Publish** generates the 7 audience-tailored pages, validates them, and freezes the slug.
- **Published page** (`/preview`) — your server-rendered venue page; `?type=<visitor-type>` previews each of the 7 audiences.
- **Dashboard** (`/dashboard`) — the analytics for your venue (see feature 7 above). An owner with no venue, or a venue with no events, sees a calm zeroed state, never an error.

### The customer site (`:5112`)

Open a published venue at `http://localhost:5112/<slug>` (e.g. `hotelmizrahi` after `pnpm seed`, or any slug from the builder). The page is composed entirely server-side from the owner REST API. Notes:

- A mid-left **"Preview as…"** tab (hover, or keyboard-focus, to slide it out) switches which audience variant you're viewing — 2 genders × 3 age groups, plus "Neutral (default)" and an "Unknown / default" reset. It sets an `httpOnly` cookie the server reads; the visitor type **never appears in the URL or the page UI** — it's a reviewer aid only. Reload and it sticks (until you pick "Unknown / default").
- **"Book Now"** records a `book-now-click` event and shows a friendly confirmation modal (Escape or a backdrop click closes it). There's no real booking or payment.
- The page also reports a `visit` event on load (and again whenever you switch the previewed audience), and a `book-now-hover` the first time you hover the CTA for a given audience — watch the owner dashboard's numbers move (`:5111/dashboard`).
- An unknown slug → a friendly "we couldn't find a venue at that address" page. If the owner app is unreachable, the customer page shows a calm "try again in a moment" page — never a stack trace.

Uploaded venue images are written to `apps/owner/uploads/` (gitignored, created on demand) and served by the owner app at `/uploads/...`; the 3 supplied stock images are committed under `apps/owner/public/stock/`.

## Scripts (run from the repo root)

| Script | Does |
|---|---|
| `pnpm dev` | Run both apps in dev (`-r --parallel`) — owner `:5111`, customer `:5112` |
| `pnpm build` | Build both apps |
| `pnpm lint` | ESLint across the workspace (`no-explicit-any` is an error) |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm test` | Vitest across all packages |
| `pnpm --filter mizrahitality-owner test` | Run one package's tests (swap the filter; append `-- <pattern>` for a single test) |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm db:migrate` | Create/apply a Prisma migration (`apps/owner/prisma/migrations/`) |
| `pnpm db:studio` | Open Prisma Studio against the owner DB |
| `pnpm db:push` | Push the schema to SQLite without a migration (legacy — prefer `db:migrate`) |
| `pnpm seed` | Run `scripts/seed.mjs` — (re)create the two demo accounts; resets the demo data on every run; needs only `DATABASE_URL` (run `pnpm db:migrate` first), no `GOOGLE_API_KEY` |

Schema changes go through the `update-database` skill; the changelog is [`apps/owner/prisma/CHANGELOG.md`](apps/owner/prisma/CHANGELOG.md).

## Tech stack

- **TypeScript**, strict, repo-wide (`no-explicit-any` is a lint error).
- **Next.js** (App Router) for both apps — SSR is mandatory for the published owner page and the entire customer site.
- **Prisma + SQLite** (file-based), owned **solely** by `apps/owner`; the customer app never touches the DB.
- **Google Gemini** (`gemini-3.1-flash-lite` via `@google/genai`) — used only at publish time, only on the description **text**, never on the image, never in the page-serving request path. Per-variant copy uses Gemini's structured output (`responseMimeType: 'application/json'` + `responseSchema`). Calls are paced (`env.AI_INTER_CALL_DELAY_MS`, default 4500ms) to stay under the free-tier 15 RPM ceiling, and a publish runs as an in-memory `PublishJob` the client polls so the Re-publish button can show live "X / 7" progress.
- **TailwindCSS v4** + **shadcn/ui** (Base UI–based) for the owner app chrome; shadcn's Recharts-based Chart for the dashboard charts. The supplied per-audience customer templates are plain Tailwind/React.
- **pnpm** workspaces (Node 22, Corepack; `.npmrc` `node-linker=hoisted`); **ESLint** (flat config) + **Prettier**; **Vitest** (`environment: 'node'`).

## REST API contract

The owner app exposes the API; `mizrahitality-customer` is its only consumer. The API is **open** — no authentication, no keys, no tokens — because everything runs on localhost for the demo. Failures return a JSON `ApiError` body — `{ "error": "<code>", "message": "<human-readable text>" }` — with the matching status code (`bad_request` → 400, `not_found` → 404). Wrong HTTP method on a route → 405. Types + the visitor-type enum live in `@mizrahitality/contracts`.

### `GET /api/venues/<slug>/page?type=<visitor-type>`

Returns `200` with the precomputed **rendered-page payload** for that variant (`RenderedPage`): the audience copy bundle + the absolute hero `imageUrl` + the per-variant body typography + the fixed UI strings (`"Book Now"`, `"Powered by Mizrahitality"`). Response header `Cache-Control: no-store` (the customer site re-fetches per request to pick up the cookie-selected visitor type).

- Unknown / absent / unrecognised `type` → the `neutral` variant. `type` is supplied by the customer app **server-side** — it never appears in a browser URL; the `50+` age groups travel URL-encoded (`?type=male-50%2B`).
- Unknown slug, or a venue that hasn't been published → `404 not_found`.
- Pages are precomputed at publish (feature 4) — **no AI call in this path**.

### `POST /api/venues/<slug>/events`

Body — JSON: `{ "type": "visit" | "book-now-hover" | "book-now-click", "visitorType": "<visitor-type>", "sessionId"?: "<opaque string>" }`. Returns `201` with `{ "ok": true }`; records one event row against that venue.

- `sessionId` is **optional** — an opaque per-browser-session correlator the customer site mints (it powers the dashboard's hover→click funnel %); omit it and it's stored as `null`. The route never 400s on a missing one.
- A non-object / non-JSON body, or a bad/missing `type` or `visitorType` → `400 bad_request`.
- Unknown slug → `404 not_found`. (Recording is **not** gated on publish state — any existing venue accepts events.)

**Visitor type** = gender (`male` / `female`) × age group (`18-30` / `31-50` / `50+`) → 6, plus `neutral` = **7 variants per published venue**.

## Out of scope

Real domains / DNS / SSL / hosting (the "domain" is a URL-path slug; everything is localhost); real booking or payments ("Book Now" ends at a confirmation modal); multiple venues per account / a venue selector (one page per owner); API authentication or keys (the API is open — localhost-only demo); multi-page sites, free-form layout, drag-and-drop, a rich-text editor, image-placement controls; AI-generated styling/templates or AI image editing (templates/styling are supplied design assets; the AI only authors the description text into the Rich Text slot); teams/roles; email verification or password reset; real visitor identification (it's simulated via the demo tab); analytics beyond the specified dashboard.
