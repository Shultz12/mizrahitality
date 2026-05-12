# Build notes

Working doc for building Mizrahitality. The product spec lives in `VISION.md` and `PRD.md` — that's the source of truth for *what* and *why*. This file is *how we're going about it*: build order, decisions made, open questions.

We build feature by feature in **plan mode**: plan → approve → implement → next. No spec/audit pipeline.

## Build order

Build top to bottom; each row depends on the rows above it.

| # | Feature | Depends on | What it adds |
|---|---------|-----------|--------------|
| 1 | **monorepo-foundation** | — | pnpm workspace, `@mizrahitality/contracts`, Prisma + SQLite scaffold, both Next.js apps as runnable skeletons. *(Scaffold partly done on branch `feature/monorepo-foundation` in `.worktrees/monorepo-foundation` — see "Open / pending" below.)* |
| 2 | **owner-auth** | 1 | first real Prisma models (Account, Venue), sign-up / sign-in + sessions, per-venue API-key generation |
| 3 | **site-builder** | 2 | the description + photo input form, persistence of inputs, preview, publish-flow skeleton (no layout/rich-text editor, no image placement, no drag-and-drop) |
| 4 | **ai-copy-and-variants** | 3 | the two Claude steps — enhance the owner's description, then author the approved copy into each per-audience template's Rich Text slot → 7 stored variants at publish |
| 5 | **published-page-ssr** | 4 | the owner's SSR published page; adds the rendered-page response DTO to `@mizrahitality/contracts` |
| 6 | **analytics-api** | 4 (and 2 for keys) | REST/JSON API — `GET` rendered page by slug + visitor type, `POST` `visit` / `book-now hover` / `book-now click` events; event models; API DTOs in `@mizrahitality/contracts` |
| 7 | **analytics-dashboard** | 6 | the owner dashboard — every chart/metric/percentage over recorded events |
| 8 | **customer-site** | 6 | the Next.js SSR visitor site at `/<slug>`, the mid-left demo tab, the "Book Now" button + confirmation |
| 9 | **demo-seed** | all | Venue #1 with realistic historical analytics, Venue #2 starts empty |

5 ↔ 6 can interleave (both only need the stored variants from #4). 7 ↔ 8 can run in either order (both need the API from #6). Everything else is a hard chain.

## Foundation decisions (carry forward)

These were settled while planning the scaffold; keep them unless there's a reason not to.

- **Node 22 LTS**, pinned in `.nvmrc`; pnpm via `corepack`. `preinstall` runs `npx only-allow pnpm`.
- **Ports:** owner `5111`, customer `5112`.
- **`@mizrahitality/contracts` is consumed as TypeScript source** — no build step — so each app's `next.config.ts` needs `transpilePackages: ['@mizrahitality/contracts']`. The package has **zero runtime dependencies**: types + plain constants only.
- Contracts surface: `VISITOR_GENDERS` / `AGE_GROUPS` / `SLOT_TYPES` (`rich-text`, `image` — no title slot) / `ANALYTICS_EVENT_TYPES`, the `VisitorType` union, `allVisitorVariants()` → exactly 7, plus the API-key header constant (`x-venue-api-key`) and an `ApiError` shape. DTOs (rendered-page payload, event payloads) get added by the features that introduce them.
- **Prisma + SQLite owned solely by `apps/owner`** — only `apps/owner/src/lib/prisma.ts` imports `@prisma/client`, via a dev-cached `globalThis` singleton. The customer app never touches the DB. Schema changes go through the `update-database` skill (`apps/owner/prisma/CHANGELOG.md`).
- **`.env` is gitignored; `.env.example` is committed.** `lib/env.ts` in each app fail-fasts on its required vars at module load. Owner needs `DATABASE_URL` (required), `ANTHROPIC_API_KEY`, `SESSION_SECRET`; customer needs `OWNER_API_BASE_URL` (required).
- Per-package Vitest configs (`environment: 'node'`). Tests never touch `./dev.db` — use a temp `DATABASE_URL`.
- Customer `GET /` serves a small SSR placeholder index ("visit /<your-slug>"); `GET /[slug]` SSR-renders, echoing the slug (JSX text interpolation handles HTML-escaping). The slug stub makes no owner-API call until `customer-site`.
- `pnpm db:migrate` is a clean no-op on the empty schema until `owner-auth` adds models.
- `scripts/seed.mjs` is a plain-Node-ESM no-op stub until `demo-seed`.
- No project-level `.claude/` directory; no i18n machinery.
- Root scripts: `dev` / `build` / `lint` / `typecheck` / `test` / `format` / `format:check` via `pnpm -r [--parallel]` (no `concurrently`); `db:push` / `db:migrate` / `db:studio` delegate to the owner package; `seed` runs `node scripts/seed.mjs`.

## Open / pending

- **`feature/monorepo-foundation` worktree.** `.worktrees/monorepo-foundation` has the workspace config + the `@mizrahitality/contracts` package built (`pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, `.nvmrc`, `package.json`, `packages/contracts/`, `pnpm-lock.yaml`). The two app skeletons (`apps/owner`, `apps/customer`) and `scripts/seed.mjs` aren't done yet. Decide: finish + merge that branch, cherry-pick the useful bits, or scrap it and scaffold fresh on `main`.
- **Slug mutability:** leaning immutable (it's the API/URL key) — confirm.
- **Slot schema** (each slot's role, min/max length, required/optional) and the **per-template copy-rules format** the "author into template" AI step consumes — pin these when starting `ai-copy-and-variants`. Depends on the supplied template assets.
- **Supplied assets** — the owner-facing UI design files and the per-audience template set + copy rules need to land before `site-builder` / `ai-copy-and-variants` finish.
- **App processes:** two separate Next.js processes, talking only over the owner REST API (no shared DB handle). Confirmed by the architecture; nothing more to decide.

## API contract sketch

Fleshed out for real in `README.md` once `analytics-api` lands. Shape:

- Auth: every request carries `x-venue-api-key: <key>` scoped to one venue. Bad/missing key → 401/403.
- `GET /api/venues/<slug>/page?type=<visitor-type>` → the fully-rendered page payload for that variant; unknown `type` → neutral; unknown slug → 404.
- `POST /api/venues/<slug>/events` → record a `visit` / `book-now-hover` / `book-now-click` event, each tagged with the visitor type.

Visitor type = `male`/`female` × `18-30`/`31-50`/`50+` (6) + `neutral` = **7**.
