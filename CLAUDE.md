# CLAUDE.md

Engineering orientation for this repo. The product spec (the *what* and *why*) lives in `VISION.md` and `PRD.md` — read it before making product decisions. Build order, settled decisions, and open questions are in `NOTES.md`. Keep this file lean.

We build feature by feature in plan mode (plan → approve → implement → next) — there's no spec/audit/orchestration pipeline.

## What this is

**Mizrahitality** — a monorepo with two cooperating products that communicate **only** over a documented REST/JSON API:

- **`mizrahitality-owner`** (`apps/owner`) — SSR builder platform for non-technical hospitality venue owners; owns the database and exposes the REST API. One venue (one page) per owner — kept deliberately minimal.
- **`mizrahitality-customer`** (`apps/customer`) — Next.js SSR public visitor site at `/<venue-slug>`; on every request it calls the owner API for the page matching the current visitor type, renders it, and posts back analytics events. The visitor type is never shown to the visitor or put in the URL — it travels inside the server-to-server API call. The owner API is open (localhost-only demo); no API keys.

It's a job-interview deliverable — there's some intentional levity in `VISION.md`; don't editorialize, just build it.

## Repository layout

```
apps/owner/          # mizrahitality-owner — Next.js App Router, SSR; owns Prisma + SQLite + the REST API; port 5111
apps/customer/       # mizrahitality-customer — Next.js App Router, SSR public visitor site; port 5112
packages/contracts/  # @mizrahitality/contracts — shared TS types + plain constants; zero runtime deps; consumed as TS source
plans/               # build plan files — 00-master-plan.md, then 01-<feature>-plan.md per feature in build order
scripts/seed.mjs     # demo seed (no-op stub until feature #9)
VISION.md, PRD.md    # product docs — the what and why
NOTES.md             # build order, settled decisions, open questions
README.md            # what it is, how to run it, the REST API contract
```

> Landed so far — feature #1 `plans/01-monorepo-foundation-plan.md` (pnpm workspace — Node 22, Corepack, `.npmrc` `node-linker=hoisted`; `@mizrahitality/contracts`; both Next.js App-Router/Tailwind-v4 app skeletons; shadcn/ui in `apps/owner`; ESLint flat config / Prettier / per-package Vitest; the root scripts), feature #2 `plans/02-owner-auth-plan.md` (the first Prisma models — `Owner` / `Venue` / `Session` — with a real migration history; email+password sign-up / sign-in / sign-out over `httpOnly` cookie sessions — `bcryptjs`, HMAC-of-token storage; `lib/auth.ts` helpers; route-group-based guarding), and feature #3 `plans/03-site-builder-plan.md` (the venue builder — name → derived slug, free-text description, one image uploaded **or** picked from the 3 supplied stock images; the `Venue` content columns + a `publishState` / `slugLockedAt` / `publishedAt` skeleton + an empty `PageVariant` table; uploads on disk served by `GET /uploads/[...path]`; an authed nav + a saved-content preview + a `Publish` stub that only flips `publishState` + freezes the slug). The AI publish steps (#4), the SSR published page (#5), the REST API (#6), and the dashboard (#7) arrive with later features.

## Tech stack

- **Language:** TypeScript, strict, repo-wide; no `any`.
- **Framework:** Next.js (App Router) for both apps. **SSR is mandatory** for the published owner page and the entire customer site.
- **Persistence:** Prisma + SQLite (file-based), owned **solely** by `apps/owner`; the customer app never touches the DB. All schema changes go through the `update-database` skill.
- **AI:** Anthropic Claude (Sonnet 4.6) with prompt caching — used only at publish time, only on the description **text**, never on the image, never in the page-serving request path. See the `claude-api` skill.
- **UI:** TailwindCSS (v4) + shadcn/ui for the owner-facing app chrome (sign-up, builder, dashboard, dialogs) — the current shadcn CLI ships **Base UI**-based components (not Radix); shadcn's Chart component (Recharts) for the dashboard charts. The supplied per-audience customer templates are plain Tailwind/React components, not shadcn blocks.
- **Tooling:** pnpm workspaces; ESLint (flat config) + Prettier; Vitest.

## Architecture

- **Two apps, one boundary.** They share `@mizrahitality/contracts` (types + constants only) and otherwise talk **only** over the owner app's REST API — no shared DB handle, no cross-app imports, no in-process calls. The API is open (localhost-only demo); no keys.
- **Owner side:** SSR builder + the REST API + the database. **One venue (one page) per owner** — no venue selector, no multi-venue. Sign-up is email + password only; the venue and its slug appear later, in the builder. The builder's only inputs are a **venue name** (English letters + spaces, no special chars — the slug is derived from it: lowercased, spaces removed), a **free-text description**, and **one image** (uploaded, or chosen from 3 supplied stock images) — no layout/rich-text editor, no image placement, no drag-and-drop. AI touches the **text only** (never the image): it polishes the description, then authors it into pre-designed per-audience **templates** — one page = a Rich Text slot (AI-filled) + an Image slot (the chosen image). Templates/styling are supplied design assets, not AI-generated. Page assembly is deterministic code. The 7 page variants are generated eagerly at publish and stored.
- **Customer side:** a thin SSR client — fetch the rendered page by slug + visitor type, render it, report `visit` / `book-now hover` / `book-now click` events back. The visitor type is never exposed in the URL or the page UI; a hover-out demo tab (for reviewers) switches it via a cookie the server reads, and it travels inside the server-to-server API call.
- **Visitor type** = gender (`male`/`female`) × age group (`18-30`/`31-50`/`50+`) → 6 typed + 1 `neutral` = **7 variants per published venue**. Defined in `@mizrahitality/contracts`.
- **UI designs and the per-audience templates are supplied by the user** — implement them; do not invent visual design, templates, or AI-generated styling.

## Out of scope (don't build)

Real domains/DNS/SSL/hosting; real booking or payments ("Book Now" ends at a confirmation modal); multiple venues per account / venue selector (one page per owner); API authentication or keys (the owner API is open — localhost-only demo); multi-page sites, free-form layout, drag-and-drop, a rich-text editor, image-placement controls; AI-generated styling or AI image editing (AI touches the description text only); teams/roles; email verification or password reset; real visitor identification; analytics beyond the specified dashboard.

## Conventions

- `VISION.md` / `PRD.md` are the source of truth for *what/why*; `NOTES.md` for build order, decisions, and open questions. Keep `NOTES.md` current as decisions get made.
- Use the relevant skills when they apply (`update-database` for Prisma schema changes, `claude-api` for Claude/caching). No commit obligation unless the user asks.
- **Owner-app routes:** `apps/owner/src/app/(auth)/*` (`sign-in`, `sign-up`) are public — the pages redirect to `/dashboard` if you're already authed; `apps/owner/src/app/(authed)/*` (`dashboard`, `builder`) are guarded by `(authed)/layout.tsx` → `requireOwner()` (the security boundary; no middleware) and share its small authed nav. `apps/owner/src/app/uploads/[...path]/route.ts` is an **unauthenticated** Route Handler that streams uploaded venue images — deliberately outside `(authed)` so the public customer page can load them (path-traversal-guarded; keys are unguessable random hex). Server-side auth lives in `lib/auth.ts` (`getCurrentOwner` / `requireOwner`) + `lib/auth-actions.ts` (the `signUp` / `signIn` / `signOut` Server Actions); the builder's writes are `lib/builder-actions.ts` (`saveVenueAction` / `publishAction`), validators in `lib/validation.ts`, slug derivation in `lib/slug.ts`, the stock-image registry in `lib/stock-images.ts`, upload disk handling in `lib/uploads.ts`. `apps/owner/.env` needs `SESSION_SECRET` or the app won't boot (a dev value ships in `.env.example`).

## Build / run / test

`pnpm` via Corepack (`packageManager` pins `pnpm@9.15.0`); `.npmrc` sets `node-linker=hoisted`. Run from the repo root:

- `pnpm install` — install everything; `apps/owner` `postinstall` runs `prisma generate`.
- `pnpm dev` — both apps in parallel (`pnpm -r --parallel dev`): owner on `:5111`, customer on `:5112`.
- `pnpm build` / `pnpm typecheck` / `pnpm lint` — across all packages (`pnpm -r …`).
- `pnpm test` — Vitest across all packages. One package: `pnpm --filter mizrahitality-owner test`; one test: `pnpm --filter mizrahitality-owner test -- <pattern>`.
- `pnpm format` / `pnpm format:check` — Prettier write / check.
- `pnpm db:migrate` / `pnpm db:studio` / `pnpm db:push` — delegate to `apps/owner` (Prisma + SQLite). There's a real migration history (`apps/owner/prisma/migrations/` — two migrations as of feature #3; `db:migrate` is no longer a no-op); use `db:migrate`, not `db:push`. Schema changes go through the `update-database` skill; changelog: `apps/owner/prisma/CHANGELOG.md`.
- `pnpm seed` — runs `scripts/seed.mjs` (no-op stub until feature #9).
- `apps/owner/uploads/` — where uploaded venue images land (`venues/<venueId>/<random>.<ext>`); **gitignored**, created on demand, served by `GET /uploads/[...path]`. Committed stock images live at `apps/owner/public/stock/`.

Copy `apps/owner/.env.example` → `apps/owner/.env` and `apps/customer/.env.example` → `apps/customer/.env` before `pnpm dev` / `pnpm build` / `pnpm db:migrate` — `apps/owner` needs `DATABASE_URL` **and** `SESSION_SECRET` (both throw at module load if missing; `.env.example` ships a throwaway dev `SESSION_SECRET`). ESLint is centralized in the root flat config (`no-explicit-any` is an error); `next build` skips its own lint pass (`eslint.ignoreDuringBuilds`).
