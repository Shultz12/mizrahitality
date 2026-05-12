# Build notes

Working doc for building Mizrahitality. The product spec lives in `VISION.md` and `PRD.md` — that's the source of truth for *what* and *why*. This file is *how we're going about it*: build order, decisions made, open questions.

We build feature by feature in **plan mode**: plan → approve → implement → next. No spec/audit pipeline.

## Build order

Build top to bottom; each row depends on the rows above it.

| # | Feature | Depends on | What it adds |
|---|---------|-----------|--------------|
| 1 | **monorepo-foundation** ✅ | — | pnpm workspace, `@mizrahitality/contracts`, Prisma + SQLite scaffold, Tailwind + shadcn/ui, both Next.js apps as runnable skeletons. *(Landed — `pnpm install && pnpm dev` runs both apps; plan: `plans/01-monorepo-foundation-plan.md`.)* |
| 2 | **owner-auth** | 1 | first real Prisma models (Owner, Venue — one venue per owner), email+password sign-up / sign-in + cookie sessions |
| 3 | **site-builder** | 2 | the builder form — venue name (→ derived slug), free-text description, image (upload **or** pick from 3 supplied stock images); persistence of inputs, preview, publish-flow skeleton (no layout/rich-text editor, no image placement, no drag-and-drop) |
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
- **Auth = cookie sessions.** Sign-up / sign-in is **email + password only** (no slug at sign-up); password hashed (`bcrypt`); session = an opaque token in an `httpOnly`/`secure`/`sameSite=lax` cookie backed by a `Session` row in SQLite; a `lib/auth.ts` server helper reads it. No Auth.js/NextAuth, no OAuth, no email verification, no password reset.
- **One venue (one page) per owner.** No multi-venue, no venue selector. Model: `Owner` 1—1 `Venue` (or merge them). The slug is **derived from the venue name** in the builder (lowercased, spaces removed; collisions get a numeric suffix), not entered at sign-up.
- **The owner REST API is open** — no API keys, no auth header. It's consumed only by the customer app on localhost; unknown slug → 404. (Justified by the localhost-only demo scope; flagged in `README.md`.)
- **Image input:** the builder offers **3 supplied stock images** to pick from **or** an upload; uploads are stored on local disk under the owner app (path persisted in the DB, served back via the owner app so the customer gets an absolute URL). The 3 stock images are supplied assets. AI never touches the image — text only.
- **Visitor type is server-side only:** never in the customer URL or page UI. The demo tab (for reviewers) sets a cookie; the SSR render reads it and passes the type inside the server-to-server API call; absent/unknown → `neutral`.
- **UI:** TailwindCSS **v4** (CSS-based config) + shadcn/ui for owner app chrome — `shadcn init` ran in `apps/owner` only, style `new-york`, base color `neutral` (provisional — refined when the supplied owner UI lands, REQ-11). The current shadcn CLI (`shadcn@4.x`) ships **Base UI**-based components (not Radix — PRD §7 / CLAUDE.md's earlier "Radix" wording is now dated) and adds `shadcn` as a runtime dep + `@import "shadcn/tailwind.css"` to `globals.css`. shadcn Chart (Recharts) for the dashboard — data is fetched and aggregated server-side; the chart component is a thin client component that only draws the SVG from props (no client fetching, no loading state). Supplied per-audience customer templates are plain Tailwind/React components.
- **Lint/format/test tooling:** root `eslint.config.mjs` (flat config — `@typescript-eslint` recommended + `@next/eslint-plugin-next` for `apps/*`, **`no-explicit-any` = error**); each package runs `eslint .` and ESLint walks up to the root config; `next build` skips its own lint pass (`eslint.ignoreDuringBuilds` in each `next.config.ts`). Prettier (`singleQuote`, `printWidth: 100`); `.prettierignore` excludes `*.md`. Per-package Vitest, `environment: 'node'`.
- **`@mizrahitality/contracts` surface (initial):** `VISITOR_GENDERS`, `AGE_GROUPS`, `NEUTRAL_VISITOR_TYPE`, `SLOT_TYPES` (`rich-text`, `image`), `ANALYTICS_EVENT_TYPES`; `VisitorType` = string union `'<gender>-<ageGroup>' | 'neutral'` (e.g. `male-18-30`, `female-50+`; `50+` kept verbatim, URL-encoded on the wire); `allVisitorVariants()` → 7; `isVisitorType()` / `parseVisitorType()` (parse defaults to `neutral`); `ApiError` (`{ error, message }`). DTOs (rendered-page payload, event shapes) added by #5/#6.
- **`lib/env.ts` per app:** `apps/owner` — `DATABASE_URL` required (throws at module load), `ANTHROPIC_API_KEY` / `SESSION_SECRET` placeholders until #4 / #2. `apps/customer` — `OWNER_API_BASE_URL` required (nothing imports it until #8). The owner schema is empty, so `Owner` vs `Owner`+`Venue` (one model vs two) is **deferred to #2**; leaning two models.
- **Prisma + SQLite owned solely by `apps/owner`** — only `apps/owner/src/lib/prisma.ts` imports `@prisma/client`, via a dev-cached `globalThis` singleton. The customer app never touches the DB. Schema changes go through the `update-database` skill (`apps/owner/prisma/CHANGELOG.md`).
- **`.env` is gitignored; `.env.example` is committed.** `lib/env.ts` in each app fail-fasts on its required vars at module load. Owner needs `DATABASE_URL` (required), `ANTHROPIC_API_KEY`, `SESSION_SECRET`; customer needs `OWNER_API_BASE_URL` (required).
- Per-package Vitest configs (`environment: 'node'`). Tests never touch `./dev.db` — use a temp `DATABASE_URL`.
- Customer `GET /` serves a small SSR placeholder index ("visit /<your-slug>"); `GET /[slug]` SSR-renders, echoing the slug (JSX text interpolation handles HTML-escaping). The slug stub makes no owner-API call until `customer-site`.
- `pnpm db:migrate` is a clean no-op on the empty schema until `owner-auth` adds models.
- `scripts/seed.mjs` is a plain-Node-ESM no-op stub until `demo-seed`.
- No project-level `.claude/` directory; no i18n machinery.
- Root scripts: `dev` / `build` / `lint` / `typecheck` / `test` / `format` / `format:check` via `pnpm -r [--parallel]` (no `concurrently`); `db:push` / `db:migrate` / `db:studio` delegate to the owner package; `seed` runs `node scripts/seed.mjs`.

## Open / pending

- **monorepo-foundation** (#1) has landed — see `plans/01-monorepo-foundation-plan.md`. `pnpm install && pnpm dev` runs both apps; `pnpm build` / `lint` / `typecheck` / `test` / `format:check` are green; `pnpm db:push` is a clean no-op on the empty schema. Next #2 is **owner-auth** (first real Prisma models — `Owner`, `Venue`, `Session` — + email/password sign-up/sign-in + cookie sessions).
- **Slug derivation details:** slug = venue name lowercased with spaces removed; collisions get a numeric suffix. Open: does renaming the venue re-derive the slug after publish, or is it frozen at first publish? (Leaning: frozen at first publish — the customer URL shouldn't move under visitors.)
- **Slot schema** (each slot's role, min/max length, required/optional) and the **per-template copy-rules format** the "author into template" AI step consumes — pin these when starting `ai-copy-and-variants`. Depends on the supplied template assets.
- **Supplied assets** — the owner-facing UI design files, the per-audience template set + copy rules, and the **3 stock images** need to land before `site-builder` / `ai-copy-and-variants` finish.
- **App processes:** two separate Next.js processes, talking only over the (open) owner REST API — no shared DB handle. Confirmed by the architecture; nothing more to decide.

## API contract sketch

Fleshed out for real in `README.md` once `analytics-api` lands. Shape:

- **No auth** — the owner API is open (localhost-only demo). Unknown slug → 404.
- `GET /api/venues/<slug>/page?type=<visitor-type>` → the fully-rendered page payload for that variant; unknown/absent `type` → neutral. (`type` is supplied by the customer app server-side; it never appears in a browser URL.)
- `POST /api/venues/<slug>/events` with `{ "type": "visit" | "book-now-hover" | "book-now-click", "visitorType": "<visitor-type>" }` → record the event against that venue.

Visitor type = `male`/`female` × `18-30`/`31-50`/`50+` (6) + `neutral` = **7**.
