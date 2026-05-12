# Plan 01 — monorepo-foundation

Build step #1 of the master plan (`plans/00-master-plan.md`). Source of truth for *what/why*: `VISION.md` + `PRD.md`. Cross-cutting decisions every feature inherits: `NOTES.md` → "Foundation decisions" — not restated here, only referenced.

## 1. Context

`main` holds only product docs — nothing is scaffolded. Every later feature (`owner-auth` → `customer-site` → `demo-seed`) needs a runnable monorepo to build into: the two Next.js apps, the shared contracts package, the Prisma/SQLite scaffold, Tailwind + shadcn/ui wiring, lint/typecheck/test/format, and the root scripts. This feature builds that skeleton and nothing else — no real models, no auth, no API endpoints. It unblocks #2 (`owner-auth`) directly and everything downstream transitively.

## 2. Scope

### Workspace & tooling (repo root)
- `pnpm-workspace.yaml` → `packages: ['apps/*', 'packages/*']`.
- Root `package.json`: `private: true`; `packageManager: "pnpm@9.15.0"` (Corepack); `engines.node: ">=22"`; `preinstall: "npx only-allow pnpm"`; root scripts (below). No runtime deps at root; dev deps: `prettier`, `eslint`, `typescript`, `typescript-eslint`, `@eslint/js`, `eslint-config-next` (shared), `vitest` (shared if convenient, else per-package).
- `.nvmrc` → `22`.
- `tsconfig.base.json` at root — shared strict compiler options (`strict: true`, `noUncheckedIndexedAccess: true`, `target: "ES2022"`, `module`/`moduleResolution: "bundler"`, `verbatimModuleSyntax`, `skipLibCheck: true`, `paths` → `@mizrahitality/contracts` → `packages/contracts/src/index.ts` for editor/tsc convenience). Each package's `tsconfig.json` extends it. **No `any` repo-wide.**
- Root `eslint.config.mjs` — flat config: `@eslint/js` recommended + `typescript-eslint` recommended + `'@typescript-eslint/no-explicit-any': 'error'`; the Next plugin (`eslint-config-next` / `next/core-web-vitals`) applied to `apps/**`; `ignores`: `**/.next/**`, `**/node_modules/**`, `**/dist/**`, `**/*.tsbuildinfo`. Each package exposes `lint`/`typecheck` scripts so `pnpm -r lint` / `pnpm -r typecheck` work.
- Prettier: `prettier.config.mjs` + `.prettierignore` (ignore `.next`, `node_modules`, `pnpm-lock.yaml`, build output; keep Markdown formatted).
- `.gitignore` (currently just `.worktrees/`) extended: `node_modules/`, `**/.next/`, `**/dist/`, `*.tsbuildinfo`, `.env`, `.env.local`, `apps/owner/prisma/dev.db*`, `apps/owner/dev.db*`, `.DS_Store`, `**/next-env.d.ts`? — no, keep `next-env.d.ts` untracked per Next convention is fine but committing it is also fine; ignore it.
- `scripts/seed.mjs` — plain-Node-ESM **no-op stub** (logs "seed: nothing to do yet (filled in by feature #9 demo-seed)" and exits 0).

### Root scripts (`package.json`)
| Script | Command |
|---|---|
| `dev` | `pnpm -r --parallel dev` (owner :5111, customer :5112) |
| `build` | `pnpm -r build` |
| `lint` | `pnpm -r lint` |
| `typecheck` | `pnpm -r typecheck` |
| `test` | `pnpm -r test` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `db:push` | `pnpm --filter mizrahitality-owner db:push` |
| `db:migrate` | `pnpm --filter mizrahitality-owner db:migrate` |
| `db:studio` | `pnpm --filter mizrahitality-owner db:studio` |
| `seed` | `node scripts/seed.mjs` |

### `packages/contracts` — `@mizrahitality/contracts`
- `package.json`: `name: "@mizrahitality/contracts"`, `private: true`, `version: "0.0.0"`, `type: "module"`, `main`/`types`/`exports["."]` → `./src/index.ts` (consumed **as TS source** — no build step); **zero runtime dependencies**; scripts `lint`/`typecheck`/`test`; devDeps `vitest`, `typescript` (or inherit from root).
- `tsconfig.json` extends `../../tsconfig.base.json`.
- `vitest.config.ts` → `test.environment: 'node'`.
- `src/index.ts` re-exports the modules below.
- `src/visitor.ts`:
  - `export const VISITOR_GENDERS = ['male', 'female'] as const;` → `type VisitorGender = (typeof VISITOR_GENDERS)[number];`
  - `export const AGE_GROUPS = ['18-30', '31-50', '50+'] as const;` → `type AgeGroup = (typeof AGE_GROUPS)[number];`
  - `export const NEUTRAL_VISITOR_TYPE = 'neutral' as const;`
  - `export type VisitorType = \`${VisitorGender}-${AgeGroup}\` | typeof NEUTRAL_VISITOR_TYPE;` — the **string union**: `'male-18-30' | 'male-31-50' | 'male-50+' | 'female-18-30' | 'female-31-50' | 'female-50+' | 'neutral'`. (`50+` is URL-encoded on the wire — `encodeURIComponent` → `50%2B`; the canonical/DB value keeps the `+`. Pinned here so the API/customer/seed all agree.)
  - `export function allVisitorVariants(): VisitorType[]` → the 6 `${gender}-${ageGroup}` strings + `'neutral'` = **exactly 7** (order: male×3 ages, female×3 ages, neutral).
  - `export function isVisitorType(x: unknown): x is VisitorType` — guard against `allVisitorVariants()`.
  - `export function parseVisitorType(x: string | null | undefined): VisitorType` — returns the value if valid, else `'neutral'`. (Trivial, pure; the API will need it — including it now keeps the wire/serialize logic in one place.)
- `src/slots.ts`: `export const SLOT_TYPES = ['rich-text', 'image'] as const;` → `type SlotType = (typeof SLOT_TYPES)[number];` (no title slot — PRD §9 resolved).
- `src/analytics.ts`: `export const ANALYTICS_EVENT_TYPES = ['visit', 'book-now-hover', 'book-now-click'] as const;` → `type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];`
- `src/errors.ts`: `export interface ApiError { error: string; message: string }` — `error` = machine code (e.g. `'not_found'`, `'bad_request'`), `message` = human-readable. The owner API's error envelope; the rendered-page / event DTOs are added later by the features that introduce them (#5/#6).
- `src/index.test.ts` (Vitest): `allVisitorVariants()` has length 7 and no duplicates; every entry passes `isVisitorType`; `'neutral'` is included; `parseVisitorType('bogus') === 'neutral'`; `SLOT_TYPES`/`ANALYTICS_EVENT_TYPES` contents.

### `apps/owner` — `mizrahitality-owner` (port 5111)
- Next.js (App Router, TypeScript, Tailwind v4, `src/` dir, `@/*` alias).
- `package.json`: `name: "mizrahitality-owner"`, `private: true`; deps include `next`, `react`, `react-dom`, `@prisma/client`, `@mizrahitality/contracts: "workspace:*"`; devDeps `prisma`, `typescript`, `eslint`, `vitest`, Tailwind/PostCSS, shadcn deps (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css` — whatever `shadcn init` pulls). Scripts: `dev: "next dev -p 5111"`, `build: "next build"`, `start: "next start -p 5111"`, `lint: "eslint ."`, `typecheck: "tsc --noEmit"`, `test: "vitest run"`, `postinstall: "prisma generate"`, `db:push: "prisma db push"`, `db:migrate: "prisma migrate dev"`, `db:studio: "prisma studio"`.
- `next.config.ts` → `transpilePackages: ['@mizrahitality/contracts']`.
- `tsconfig.json` extends `../../tsconfig.base.json`; keeps Next's `plugins`/`paths` (`@/*` → `./src/*`).
- Tailwind v4 wired (`postcss.config.mjs`, `src/app/globals.css` → `@import "tailwindcss";`). **shadcn/ui** initialised (owner only): `shadcn init` → style **new-york**, base color **neutral** (provisional — revisit when the supplied owner UI lands, REQ-11) → adds `components.json`, `src/lib/utils.ts` (`cn`), CSS variables in `globals.css`; add one component (`button`) to `src/components/ui/` to prove the pipeline.
- `src/app/layout.tsx` + `src/app/page.tsx` — a minimal SSR landing page ("Mizrahitality — owner platform" + a stub link toward sign-up; real chrome arrives in #2/#11). No client-side data fetching.
- `src/lib/env.ts` — fail-fast env reader: `DATABASE_URL` **required** (throws at module load if missing); `ANTHROPIC_API_KEY` and `SESSION_SECRET` read but **not yet required** (tightened to required by #4 and #2 respectively — leave a TODO). In the skeleton `env` is imported only by `lib/prisma.ts`, which nothing renders yet → `next build` doesn't evaluate it, so a fresh checkout builds without `.env`; `pnpm dev` / `pnpm db:push` need `.env` (per README).
- `src/lib/prisma.ts` — `PrismaClient` `globalThis` singleton (dev-cached, not in production), constructed with `datasources.db.url = env.DATABASE_URL`. Imports `./env`.
- `prisma/schema.prisma` — **empty**: `generator client { provider = "prisma-client-js" }` + `datasource db { provider = "sqlite"; url = env("DATABASE_URL") }`, **no models**. `prisma generate` (via `postinstall`) produces a model-less client that still type-checks.
- `prisma/CHANGELOG.md` — initial entry per the `update-database` skill format (date `12-05-2026`, "Initial empty schema — generator + sqlite datasource only; first models land in feature #2 owner-auth").
- `vitest.config.ts` → `test.environment: 'node'`. A smoke test (`src/__tests__/contracts.test.ts`) importing `allVisitorVariants` from `@mizrahitality/contracts` and asserting length 7 (exercises the workspace link + `transpilePackages` path).
- `.env.example` (committed): `DATABASE_URL="file:./dev.db"`, `ANTHROPIC_API_KEY=""`, `SESSION_SECRET=""`. `.env` gitignored.

### `apps/customer` — `mizrahitality-customer` (port 5112)
- Next.js (App Router, TypeScript, Tailwind v4, `src/` dir, `@/*` alias). **Tailwind only — no shadcn** (the supplied per-audience templates are plain Tailwind/React; shadcn would be unused chrome here).
- `package.json`: `name: "mizrahitality-customer"`, `private: true`; deps `next`, `react`, `react-dom`, `@mizrahitality/contracts: "workspace:*"`; devDeps `typescript`, `eslint`, `vitest`, Tailwind/PostCSS. Scripts: `dev: "next dev -p 5112"`, `build: "next build"`, `start: "next start -p 5112"`, `lint: "eslint ."`, `typecheck: "tsc --noEmit"`, `test: "vitest run"`. **No prisma, no `@prisma/client`** — the customer app never touches the DB.
- `next.config.ts` → `transpilePackages: ['@mizrahitality/contracts']`. `tsconfig.json` extends the base config.
- `src/app/layout.tsx` + `src/app/page.tsx` — small SSR placeholder index ("Mizrahitality — visit /&lt;your-venue-slug&gt;"). No API call.
- `src/app/[slug]/page.tsx` — SSR page that **echoes the slug** (`<main><h1>{slug}</h1><p>…wired up but not live yet.</p></main>`). JSX text interpolation handles HTML-escaping. **No owner-API call yet** (that's #8). `params` awaited per Next 15.
- `src/lib/env.ts` — fail-fast: `OWNER_API_BASE_URL` **required**. Created now (foundation deliverable) though nothing imports it until #8 — note that.
- `vitest.config.ts` → `test.environment: 'node'`. One smoke test (import `@mizrahitality/contracts`, assert 7 variants — proves the link).
- `.env.example` (committed): `OWNER_API_BASE_URL="http://localhost:5111"`.

### Doc upkeep (part of this feature)
- `CLAUDE.md`: replace the "Not yet scaffolded" note (Repository layout §) with the real layout; fill "Build / run / test" with the day-to-day commands.
- `README.md`: replace the "Status: not yet scaffolded" note; fix the `pnpm test --filter …` script row.
- `NOTES.md`: tick `monorepo-foundation` in "Build order"; note any open question resolved (the `VisitorType` string format pinned above; shadcn style/base-color chosen; Owner/Venue model decision deferred to #2).

## 3. Out of scope

- **No real Prisma models** — schema stays empty until `owner-auth` (#2). No `Owner`/`Venue`/`Session`/`Event`.
- **No auth** — no sign-up/sign-in, no `bcrypt`, no cookies, no `lib/auth.ts` yet (#2).
- **No API endpoints** — no `/api/...` routes (#6).
- **No API-key constant / no auth header in contracts** — the owner API is open (NOTES "Foundation decisions"); establish the no-auth posture by *not* building any.
- **No DTOs beyond `ApiError`** — rendered-page payload, event request/response shapes are added by #4/#5/#6.
- **No real owner UI / templates / stock images / dashboard / customer-API call** — placeholders only; supplied design assets slot in later (REQ-11, #3, #4, #7, #8).
- **No `concurrently`, no Turborepo, no CI config, no Docker, no i18n, no project-level `.claude/`** (NOTES).

## 4. Dependencies

- *Build-order:* none — this is step #1, scaffolded fresh on `main`.
- *Supplied assets:* **none required** to land the skeleton. The supplied owner UI/theme can be slotted in later (REQ-11); the 3 stock images and the per-audience templates are not needed until #3/#4.
- *External:* Node 22, pnpm (Corepack). No `ANTHROPIC_API_KEY` needed to run/build the skeleton.

## 5. Contracts additions

The **entire initial `@mizrahitality/contracts` surface** lands here (no DTOs beyond `ApiError`):
- Constants: `VISITOR_GENDERS`, `AGE_GROUPS`, `NEUTRAL_VISITOR_TYPE`, `SLOT_TYPES`, `ANALYTICS_EVENT_TYPES`.
- Types: `VisitorGender`, `AgeGroup`, `VisitorType` (string union, format pinned in §2), `SlotType`, `AnalyticsEventType`, `ApiError`.
- Functions: `allVisitorVariants()` → 7; `isVisitorType()`; `parseVisitorType()`.
- Zero runtime deps; consumed as TS source via `transpilePackages` + `workspace:*`.

## 6. PRD requirements satisfied

- **REQ-20** (monorepo) — both apps + shared package build/run from one repo; contract types shared, not copy-pasted. *(Delivered.)*
- **REQ-13** (SSR `/[slug]` route exists) — *partial*: the route exists and SSR-renders an echo of the slug; the real API-driven render is #8.
- **REQ-3** (open localhost API) — *partial*: establish the no-auth posture by building no API-key UI / auth header anywhere; the actual endpoints are #6.
- *Implicit:* the SSR + TypeScript-strict + Prisma/SQLite-owned-by-owner + Tailwind+shadcn constraints from PRD §7 are set up here.

## 7. Open questions to pin (resolved in this plan)

- **shadcn init choices** → style **new-york**, base color **neutral**. Provisional — re-evaluated when the supplied owner UI lands (REQ-11). shadcn in `apps/owner` only.
- **`Owner` vs `Owner`+`Venue` (one model or two)** → **deferred to #2** (`owner-auth`), where the first models land. Leaning **two models** (`Owner` 1—1 `Venue`, `Venue` absent until the builder creates it) — but the empty foundation schema doesn't force the call now.
- **`VisitorType` wire format** → string union `'<gender>-<ageGroup>' | 'neutral'`, `50+` URL-encoded on the wire, `+` kept in the canonical/DB value. Pinned here (§2).
- **Tailwind version** → v4 (current; shadcn supports it).
- **pnpm version** → `9.15.0` pinned via `packageManager` (avoids pnpm 10's `onlyBuiltDependencies` allowlist friction with Prisma).

## 8. Verification

Run from the repo root after implementation:
1. `pnpm install` — succeeds; `preinstall` allows pnpm; owner's `postinstall` runs `prisma generate` (no `.env` needed). `npm install` / `yarn install` are rejected by `only-allow`.
2. `pnpm typecheck` — green across `packages/contracts`, `apps/owner`, `apps/customer` (strict, no `any`).
3. `pnpm lint` — green; `@typescript-eslint/no-explicit-any` is `error`.
4. `pnpm test` — green; contracts test asserts `allVisitorVariants()` length 7; each app's smoke test imports the package and asserts 7.
5. `pnpm build` — both apps build (fresh checkout, no `.env`, succeeds because nothing in the build graph evaluates `env.ts`).
6. `cp apps/owner/.env.example apps/owner/.env` && `cp apps/customer/.env.example apps/customer/.env`.
7. `pnpm db:push` — clean no-op on the empty schema (creates `apps/owner/prisma/dev.db`, "in sync", no models).
8. `pnpm db:studio` — opens Prisma Studio against the owner DB (empty).
9. `pnpm dev` — both apps start: owner on `http://localhost:5111` (SSR landing page), customer on `http://localhost:5112`.
10. `curl -s http://localhost:5112/anything-here` — the HTML body contains `anything-here` (the slug), fully composed in the server response. `http://localhost:5112/` shows the placeholder index.
11. `pnpm seed` — prints the no-op message, exits 0.
12. `pnpm format:check` — green.
13. Docs: `CLAUDE.md` / `README.md` "not yet scaffolded" notes are gone and reflect reality; `CLAUDE.md` "Build / run / test" lists the commands; `NOTES.md` "Build order" has `monorepo-foundation` ticked.
