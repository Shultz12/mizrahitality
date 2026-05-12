# CLAUDE.md

Engineering orientation for this repo. The product spec (the *what* and *why*) lives in `VISION.md` and `PRD.md` — read it before making product decisions. Build order, settled decisions, and open questions are in `NOTES.md`. Keep this file lean.

We build feature by feature in plan mode (plan → approve → implement → next) — there's no spec/audit/orchestration pipeline.

## What this is

**Mizrahitality** — a monorepo with two cooperating products that communicate **only** over a documented REST/JSON API:

- **`mizrahitality-owner`** (`apps/owner`) — SSR builder platform for non-technical hospitality venue owners; owns the database and exposes the REST API.
- **`mizrahitality-customer`** (`apps/customer`) — Next.js SSR public visitor site at `/<venue-slug>`; on every request it calls the owner API for the page matching the current visitor type, renders it, and posts back analytics events; authenticated by a per-venue API key.

It's a job-interview deliverable — there's some intentional levity in `VISION.md`; don't editorialize, just build it.

## Repository layout

```
apps/owner/          # mizrahitality-owner — Next.js App Router, SSR; owns Prisma + SQLite; port 5111
apps/customer/       # mizrahitality-customer — Next.js App Router, SSR; port 5112
packages/contracts/  # @mizrahitality/contracts — shared TS types + plain constants; zero runtime deps
scripts/seed.mjs     # demo seed
VISION.md, PRD.md    # product docs — the what and why
NOTES.md             # build order, settled decisions, open questions
README.md            # what it is, how to run it, the REST API contract
```

> Not yet scaffolded on `main`. The workspace skeleton + `@mizrahitality/contracts` exist on branch `feature/monorepo-foundation` (`.worktrees/monorepo-foundation`); the app skeletons aren't done. See `NOTES.md` → "Open / pending". Update this section once the foundation lands on `main`.

## Tech stack

- **Language:** TypeScript, strict, repo-wide; no `any`.
- **Framework:** Next.js (App Router) for both apps. **SSR is mandatory** for the published owner page and the entire customer site.
- **Persistence:** Prisma + SQLite (file-based), owned **solely** by `apps/owner`; the customer app never touches the DB. All schema changes go through the `update-database` skill.
- **AI:** Anthropic Claude (Sonnet 4.6) with prompt caching — used only at publish time, never in the page-serving request path. See the `claude-api` skill.
- **Tooling:** pnpm workspaces; ESLint (flat config) + Prettier; Vitest.

## Architecture

- **Two apps, one boundary.** They share `@mizrahitality/contracts` (types + constants only) and otherwise talk **only** over the owner app's REST API — no shared DB handle, no cross-app imports, no in-process calls.
- **Owner side:** SSR builder pages + the REST API + the database. The owner's only inputs are a free-text description and one photo (no layout/rich-text editor, no image placement, no drag-and-drop); AI enhances the description, then authors it into pre-designed per-audience **templates** — one page = a Rich Text slot (AI-filled) + an Image slot (the photo). Templates/styling are supplied design assets, not AI-generated. Page assembly is deterministic code. The 7 page variants are generated eagerly at publish and stored.
- **Customer side:** a thin SSR client — fetch the rendered page by slug + visitor type, render it, report `visit` / `book-now hover` / `book-now click` events back.
- **Visitor type** = gender (`male`/`female`) × age group (`18-30`/`31-50`/`50+`) → 6 typed + 1 `neutral` = **7 variants per published venue**. Defined in `@mizrahitality/contracts`.
- **UI designs and the per-audience templates are supplied by the user** — implement them; do not invent visual design, templates, or AI-generated styling.

## Out of scope (don't build)

Real domains/DNS/SSL/hosting; real booking or payments ("Book Now" ends at a confirmation modal); multi-page sites, free-form layout, drag-and-drop, a rich-text editor, image-placement controls; AI-generated styling; teams/roles; email verification or password reset; real visitor identification; analytics beyond the specified dashboard.

## Conventions

- `VISION.md` / `PRD.md` are the source of truth for *what/why*; `NOTES.md` for build order, decisions, and open questions. Keep `NOTES.md` current as decisions get made.
- Use the relevant skills when they apply (`update-database` for Prisma schema changes, `claude-api` for Claude/caching). No commit obligation unless the user asks.

## Build / run / test

See `README.md` → "Setup & run" and "Scripts". Once the foundation lands on `main`, summarize the day-to-day commands here (run both apps, run a single test, run the seed).
