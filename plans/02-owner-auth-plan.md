# Plan 02 — owner-auth

Build step #2 of the master plan (`plans/00-master-plan.md`). Source of truth for *what/why*: `VISION.md` + `PRD.md`. Cross-cutting decisions every feature inherits: `NOTES.md` → "Foundation decisions" — referenced, not restated.

> **First execution step:** copy this file to `plans/02-owner-auth-plan.md` (so `plans/` lists in build order), then implement from there.

## 1. Context

The monorepo skeleton (feature #1) has landed: both Next.js apps run, `@mizrahitality/contracts` is wired, and `apps/owner` has a Prisma + SQLite scaffold with an **empty schema** — no models, no auth, no API. Every later feature needs real owner accounts: the builder (#3) attaches a venue to an owner, the dashboard (#7) shows one owner's analytics, and the whole "one venue per owner" invariant (REQ-22) starts with an `Owner` record. This feature adds the first three Prisma models (`Owner`, `Venue`, `Session`), email+password sign-up / sign-in / sign-out backed by cookie sessions, a server-side auth helper, and route-level guarding for owner-only pages — and nothing else (no builder UI, no REST API). It unblocks #3 directly.

## 2. Scope

### Prisma models (via the `update-database` skill)

Append to `apps/owner/prisma/schema.prisma`:

```prisma
model Owner {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sessions Session[]
  venue    Venue?

  @@map("owners")
}

model Venue {
  id        String   @id @default(cuid())
  ownerId   String   @unique
  owner     Owner    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Content fields (name, slug, description, image) land in feature #3 (site-builder).
  @@map("venues")
}

model Session {
  id        String   @id @default(cuid())
  tokenHash String   @unique
  ownerId   String
  owner     Owner    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  expiresAt DateTime

  @@index([ownerId])
  @@index([expiresAt])
  @@map("sessions")
}
```

- `cuid()` ids; `@@map` to snake_case table names; `onDelete: Cascade` on `Venue.owner` and `Session.owner`.
- `Owner.venue` is optional — a venue doesn't exist until the builder (#3) creates it; the `@unique` lives on `Venue.ownerId`. Minimal `Venue` now (just the relation + timestamps); #3 adds content fields via a follow-up migration.
- `Session.tokenHash` is `HMAC-SHA256(SESSION_SECRET, rawToken)` — only the hash is stored; the raw token lives only in the cookie.

**`update-database` workflow** (run from `apps/owner/`; ignore the skill's `backend/...` paths and its `organizationId` multi-tenancy guidance — this repo's Prisma is at `apps/owner/prisma/` and tenancy is per-`Owner`; skip the orchestrator `/tmp` completion-gate echo):
1. Edit `schema.prisma` (above).
2. `npx prisma validate`.
3. `npx prisma migrate dev --name add-owner-venue-session` — first real migration; creates `apps/owner/prisma/migrations/`. Non-destructive (only `CREATE TABLE`s). If `migrate dev` reports drift against the empty `apps/owner/prisma/dev.db` left by #1's `db push`, delete that disposable, gitignored `dev.db` and re-run.
4. `npx prisma generate`.
5. Prepend a `prisma/CHANGELOG.md` entry (date `12-05-2026`, migration `add-owner-venue-session`, feature #2; list the three models + fields; note "first migration in the repo — `migrate dev` from here on", "not multi-tenant", "`onDelete: Cascade`").
6. `pnpm --filter mizrahitality-owner build` + `typecheck` + `pnpm lint`.

### Dependencies — `apps/owner/package.json`

- `dependencies`: `bcryptjs` (`^2.4.3` — pure JS, no native build; if `bcryptjs@3` is current and ships its own types, that's fine too).
- `devDependencies`: `@types/bcryptjs` (skip if using a self-typed `bcryptjs@3`).
- Install: `pnpm --filter mizrahitality-owner add bcryptjs` + `pnpm --filter mizrahitality-owner add -D @types/bcryptjs` (re-runs the owner `postinstall` `prisma generate` — harmless). Nothing else — `node:crypto` is built-in; no `zod`, no `next-auth`, no `iron-session`.

### Env — `apps/owner/src/lib/env.ts` + `.env.example`

- `env.ts`: make `SESSION_SECRET: required('SESSION_SECRET')` (drop the foundation TODO); trim the now-stale "only `lib/prisma.ts` imports this" paragraph in the module doc comment. (`ANTHROPIC_API_KEY` stays optional — that's #4.)
- `.env.example`: change `SESSION_SECRET=""` to a real throwaway dev value, e.g. `SESSION_SECRET="bWl6cmFoaXRhbGl0eS1kZXYtb25seS1zZWNyZXQtY2hhbmdlbWU="`, with a comment to regenerate for anything non-local (`openssl rand -base64 32`). This keeps `cp .env.example .env && pnpm dev` working out of the box. Note in the plan/verification: the existing gitignored `apps/owner/.env` also has `SESSION_SECRET=""` — re-copy it from the new `.env.example` (or the app won't boot, by design).

### `apps/owner/src/lib/` — new server modules

**`validation.ts`** (pure, no Next imports — unit-tested directly):
- `PASSWORD_MIN_LENGTH = 8`, `PASSWORD_MAX_BYTES = 72` (bcrypt truncates at 72 bytes — reject, don't silently truncate).
- `normalizeEmail(raw)` → `raw.trim().toLowerCase()`.
- `validateEmail(raw)` → `{ ok: true; value } | { ok: false; message }`: required; ≤ 254 chars; pragmatic `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- `validatePassword(raw)` → `{ ok: true; value } | { ok: false; message }`: required; ≥ 8 chars; UTF-8 byte length ≤ 72. Passwords are **not** trimmed.

**`auth.ts`** (server-only — imports `next/headers`, `next/navigation`, `node:crypto`, `bcryptjs`, `./prisma`, `./env`, `react`):
- Constants: `SESSION_COOKIE_NAME = 'mizrahitality_owner_session'`; `SESSION_TTL_MS = 30 days`; `BCRYPT_COST = 10`.
- Pure crypto (unit-tested): `hashPassword(plain): Promise<string>` (`bcrypt.hash(plain, 10)`); `verifyPassword(plain, hash): Promise<boolean>` (`bcrypt.compare`); `generateSessionToken(): string` (`randomBytes(32).toString('base64url')` — 256-bit); `hashSessionToken(token): string` (`createHmac('sha256', env.SESSION_SECRET).update(token).digest('base64url')`).
- `sessionCookieOptions(maxAgeSeconds)` → `{ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge }`. (`secure` is `false` in dev because dev is `http://localhost`.)
- `createSession(ownerId): Promise<void>` — generate token, `prisma.session.create({ tokenHash, ownerId, expiresAt: now + SESSION_TTL_MS })`, `(await cookies()).set(SESSION_COOKIE_NAME, token, sessionCookieOptions(SESSION_TTL_MS / 1000))`.
- `destroySession(): Promise<void>` — read cookie token; if present `prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } })`; `(await cookies()).delete(SESSION_COOKIE_NAME)`.
- `resolveOwnerByToken(token: string): Promise<OwnerWithVenue | null>` — no `cookies()` inside (so it's testable against a temp DB): `prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) }, include: { owner: { include: { venue: true } } } })`; if missing → `null`; if `expiresAt <= now` → delete the row, return `null`; else return `session.owner`. **No renewal logic** — fixed 30-day expiry (demo-only; keep it simple).
- `getCurrentOwner = cache(async (): Promise<OwnerWithVenue | null> => { ... })` — read the cookie, `return token ? resolveOwnerByToken(token) : null`. Wrapped in React `cache()` so a layout + page in the same render don't double-query.
- `requireOwner(): Promise<OwnerWithVenue>` — `const o = await getCurrentOwner(); if (!o) redirect('/sign-in'); return o;`.
- `export type OwnerWithVenue = Owner & { venue: Venue | null }` (from `@prisma/client` types).

**`auth-actions.ts`** (`'use server'` — thin wrappers around `auth.ts` + `validation.ts`; not unit-tested — covered by the manual click-through):
- `type AuthState = { error?: string; fieldErrors?: { email?: string; password?: string }; values?: { email?: string } }` (echo the typed email back so a rejected submit repopulates it; **never** echo the password).
- `signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState>` — validate email + password (collect `fieldErrors`); if any, return them + `values.email`. Then `prisma.owner.findUnique({ where: { email } })`; if it exists → `{ fieldErrors: { email: 'That email is already registered. Try signing in instead.' }, values: { email } }` (REQ-1 wants a *clear* duplicate message here — distinct from the sign-in policy below, and that's fine: sign-up inherently reveals existence). Else `prisma.owner.create({ data: { email, passwordHash: await hashPassword(password) } })`, `await createSession(owner.id)`, then `redirect('/dashboard')` **outside any try/catch** (`redirect()` throws a control-flow signal that must not be swallowed).
- `signInAction(_prev, formData): Promise<AuthState>` — validate email shape + non-empty password; on any problem return `{ error: 'Invalid email or password.', values: { email } }` (generic — don't leak whether the email exists). `prisma.owner.findUnique`; if not found, spend ~equal time (`await verifyPassword(password, '$2a$12$' + 'x'.repeat(53))`) then return the generic error; if found, `verifyPassword` against `owner.passwordHash`; on mismatch return the generic error; on success `await createSession(owner.id)` then `redirect('/dashboard')`.
- `signOutAction(): Promise<void>` — `await destroySession(); redirect('/sign-in')`.

### `apps/owner/src/app/` — routes

- **`(auth)/layout.tsx`** — public; a centered-card wrapper (`<main className="min-h-dvh grid place-items-center px-6"><div className="w-full max-w-sm">{children}</div></main>`). No guard.
- **`(auth)/sign-up/page.tsx`** — Server Component: `if (await getCurrentOwner()) redirect('/dashboard')`; renders `<SignUpForm />`.
- **`(auth)/sign-in/page.tsx`** — Server Component: same redirect-if-authed guard; renders `<SignInForm />`.
- **`(authed)/layout.tsx`** — Server Component, **the security boundary**: `await requireOwner()` (redirects to `/sign-in` if not authed), then a content wrapper (`<div className="mx-auto max-w-3xl px-6 py-10">{children}</div>`).
- **`(authed)/dashboard/page.tsx`** — Server Component placeholder: `const owner = await requireOwner();` → "Welcome, {owner.email}", a line noting the builder arrives in #3 and the dashboard in #7 (and "You haven't created a venue yet." when `!owner.venue`), and a `<form action={signOutAction}><Button variant="outline">Sign out</Button></form>`.
- **`page.tsx`** (`/` landing) — make `async`, call `getCurrentOwner()`: if authed show a "Go to your dashboard" link to `/dashboard`; else "Sign up" / "Sign in" links. Keep the existing copy line, lightly trimmed.

### `apps/owner/src/components/` — UI

- `npx shadcn@latest add input label` (from `apps/owner/`) → `components/ui/input.tsx`, `components/ui/label.tsx` (Base-UI-based, matching the existing `button.tsx`). If the CLI offers a `field`/`form` primitive, skip it — `useActionState` + manual error `<p>`s is enough; no `react-hook-form`.
- **`components/auth/sign-up-form.tsx`** and **`components/auth/sign-in-form.tsx`** — Client Components (`'use client'`) using `useActionState(action, {})` (React 19): `<form action={formAction} noValidate>` with `<Label>` + `<Input>` for email and password; field errors rendered as `<p className="text-sm text-destructive">` under the relevant input with `aria-invalid` on the input (the shadcn styles already react to `aria-invalid`); a top-level `state.error` as a `role="alert"` `<p>`; submit `<Button disabled={pending}>` with a pending label ("Signing in…"); a link to the other page. Sign-up: `autoComplete="email"` / `"new-password"`, "At least 8 characters" hint. Sign-in: `autoComplete="email"` / `"current-password"`, renders only the generic `state.error`. `defaultValue={state.values?.email ?? ''}` on the email input.

> **No-JS note:** the `<form action>` still posts without JS, but `useActionState`'s returned state isn't shown without hydration — acceptable for a localhost demo (REQ-11 is "friendly UI", not "works with JS off"); noted as a known limitation.

### `vitest.config.ts` — `apps/owner`

Add `test: { env: { DATABASE_URL: '<temp/in-memory path>', SESSION_SECRET: '<stable test secret>' }, globalSetup: '...', globalTeardown: '...' }` so `env.ts` doesn't throw during tests and Prisma never opens `prisma/dev.db`. `globalSetup` runs `prisma db push` against the temp DB; `globalTeardown` deletes it. If a file-based temp DB is used, put it under `os.tmpdir()` (or add a `*.tmp-test-*.db` pattern to `.gitignore`).

### Tests — `apps/owner/src/__tests__/`

- **`validation.test.ts`** (pure): `validateEmail` rejects empty / no-`@` / no-dot / whitespace, lowercases + trims, rejects > 254; `validatePassword` rejects empty / < 8, accepts exactly 8, rejects > 72 UTF-8 bytes.
- **`auth-crypto.test.ts`** (pure): `hashPassword`→`verifyPassword` round-trip (right = true, wrong = false); `generateSessionToken()` returns distinct ~43-char base64url strings; `hashSessionToken` is deterministic for a fixed secret, varies with the token, and varies with the secret (the stable test `SESSION_SECRET` from `vitest.config.ts` is in effect).
- **`auth-flow.integration.test.ts`** (temp SQLite via the `vitest.config.ts` `globalSetup`): create an `Owner` with a hashed password → `prisma.owner.findUnique` by email → `verifyPassword` against the stored hash (true / wrong = false); create a `Session` row with `hashSessionToken(token)` → `resolveOwnerByToken(token)` resolves the owner (with `venue: null`); an expired `expiresAt` → `resolveOwnerByToken` returns `null` and the row is gone; two owners + a session for owner A → `resolveOwnerByToken(tokenForA)` returns A and never B (mechanizes "data never leaks between owners"). The cookie-touching functions (`createSession`/`destroySession`/`getCurrentOwner`) are **not** unit-tested (they need a request context) — the Server Actions stay thin wrappers and are exercised by the manual click-through.

### Doc upkeep (part of this feature)

- `apps/owner/prisma/CHANGELOG.md` — the new migration entry (above).
- `NOTES.md` — tick row #2 `owner-auth ✅` in "Build order" (one-liner + `plans/02-owner-auth-plan.md`); in "Open / pending" replace the "#2 next" bullet with a "landed" note and record resolved decisions: `Owner`/`Venue` = **two models** (minimal `Venue` now, content in #3); session = **fixed 30-day expiry, no renewal** (demo-only); `SESSION_SECRET` now **required** in `apps/owner/lib/env.ts` (`.env.example` ships a dev value); sign-in error is **generic**, sign-up duplicate-email error is **clear**; amend the "Auth = cookie sessions" foundation bullet to say `bcryptjs` (cost 10, not `bcrypt`) and note the HMAC-of-token storage.
- `CLAUDE.md` — "Build / run / test": note `apps/owner/.env` now needs `SESSION_SECRET` (dev value in `.env.example`), the first real migration lives in `apps/owner/prisma/migrations/`, `pnpm db:migrate` is no longer a no-op; update the "Real models, auth, and API endpoints arrive with later features" status blurb to "models + auth landed in #2; the REST API and dashboard in later features"; add a one-liner on the route-group convention (`src/app/(auth)/*` public, `src/app/(authed)/*` guarded by `(authed)/layout.tsx` → `requireOwner()`).
- `README.md` — "Setup & run": the `cp apps/owner/.env.example apps/owner/.env` step now matters (the app won't boot without `SESSION_SECRET`); update the "Real accounts… arrive with later features" status blurb.

## 3. Out of scope

- No email verification, no password reset, no OAuth / NextAuth / Auth.js, no magic links.
- No teams / roles / org accounts; no venue selector (one venue per owner — REQ-22).
- No builder UI, no venue *content* fields yet (#3); no dashboard charts (#7); no REST API endpoints / no API-key UI (#6 / the API is open).
- No rate limiting / account lockout / CAPTCHA (demo scale).
- No contracts (`@mizrahitality/contracts`) additions — auth shapes are owner-app-internal.
- No middleware-based auth (the `(authed)/layout.tsx` server guard is the boundary; a cookie-presence middleware fast-path is deliberately deferred — it'd need a zero-import constants module and Prisma can't run on the Edge runtime anyway).
- No no-JS form-error fallback (noted as a known limitation).

## 4. Dependencies

- *Build-order:* feature #1 (monorepo-foundation) — landed.
- *Supplied assets:* **none required.** No owner-facing UI design files have landed; sign-up/sign-in use plain Tailwind + shadcn (`Button`, `Input`, `Label`) and get refined under REQ-11 when designs arrive.
- *External:* a value for `SESSION_SECRET` in `apps/owner/.env` (a dev default ships in `.env.example`). No `ANTHROPIC_API_KEY` needed for this feature.

## 5. Contracts additions

None. Auth (owner records, sessions, the auth-state DTO) is entirely owner-app-internal; nothing crosses the owner↔customer boundary here.

## 6. PRD requirements satisfied

- **REQ-1** (owner sign-up) — email + password sign-up; duplicate email rejected with a clear message; invalid/weak email or password rejected; on success the owner is signed in and has no venue.
- **REQ-2** (owner sign-in) — email + password sign-in; an opaque token in an `httpOnly` cookie backed by a `Session` row; survives reload; sign-out clears it.
- **REQ-22** (one venue per owner) — *modeled*: `Owner` 1—1 `Venue` (`Venue.ownerId @unique`), `Venue` absent until the builder (#3) creates it; no venue-selector affordance anywhere; the dashboard reads only the authenticated owner's own data.
- **REQ-11** (friendly owner UI) — *partial*: sign-up, sign-in, and a placeholder authed landing in plain Tailwind + shadcn with labels / focusable inputs / `aria-invalid`; refined when supplied designs land.

## 7. Open questions to pin (resolved in this plan)

- **`Owner` vs `Owner`+`Venue`** → **two models**; minimal `Venue` (relation + timestamps) created now, content fields (name/slug/description/image) added by #3 via `update-database`.
- **Session lifetime / renewal** → fixed **30-day** expiry set at sign-in, **no renewal logic** (demo-only — keep it simple). `expiresAt` is checked on every lookup (expired → row deleted, treated as signed-out). The next sign-in mints a fresh 30-day session.
- **Session token storage** → 256-bit `randomBytes(32)` opaque token, `base64url`; store `HMAC-SHA256(SESSION_SECRET, token)` as `Session.tokenHash @unique`; cookie holds the raw token; lookups hash the cookie value. → `SESSION_SECRET` is now **required** in `apps/owner/lib/env.ts`; `.env.example` ships a throwaway dev value.
- **Password hashing** → `bcryptjs` (pure JS — no native build, Windows/pnpm-friendly), cost factor **10**. Amend the `NOTES.md` "Foundation decisions" bullet that says `bcrypt`.
- **Sign-in vs sign-up error messaging** → sign-in returns a **generic** `"Invalid email or password."` (no account-existence leak; ~equal time spent in the not-found branch); sign-up returns a **clear** `"That email is already registered…"` on the email field (REQ-1).
- **Auth transport** → React **Server Actions** (`signUpAction`/`signInAction`/`signOutAction`), not `/api/auth/*` route handlers — idiomatic App Router, SSR, cookies writable inside actions; Server Actions' built-in origin check + `sameSite=lax` is adequate CSRF mitigation at demo scope.
- **Route layout** → `src/app/(auth)/*` (public: `sign-up`, `sign-in`, redirect to `/dashboard` if already authed) and `src/app/(authed)/*` (guarded by `(authed)/layout.tsx` → `requireOwner()`); post-login lands on `/dashboard` (a placeholder authed page in #2 — #3/#7 reorganize it). No middleware in #2.
- **`cuid()` vs `uuid()`** → `cuid()` (Prisma idiom); `@@map` snake_case table names kept (cosmetic).
- **Slug freeze policy** (from `NOTES.md` "Open / pending") → still open; out of scope for #2 (no slug here) — revisited in #3.

## 8. Verification

**Build / static (from repo root):**
1. `pnpm install` — succeeds; owner `postinstall` `prisma generate` is clean with the new models.
2. `pnpm --filter mizrahitality-owner exec prisma validate` — OK; inspect `apps/owner/prisma/migrations/<ts>_add_owner_venue_session/migration.sql` for `CREATE TABLE "owners"/"venues"/"sessions"` with the right columns, uniques, and FKs.
3. `pnpm typecheck` — green (strict, no `any`, `noUncheckedIndexedAccess` satisfied).
4. `pnpm lint` — green.
5. `pnpm test` — green; includes `validation.test.ts`, `auth-crypto.test.ts`, `auth-flow.integration.test.ts` (and they never touch `apps/owner/prisma/dev.db`).
6. `pnpm build` — both apps build.

**Env / boot:**
7. `cp apps/owner/.env.example apps/owner/.env` (with the dev `SESSION_SECRET`). Confirm that emptying `SESSION_SECRET` in `.env` makes `pnpm --filter mizrahitality-owner dev` throw `Missing required environment variable: SESSION_SECRET` at startup, then restore it.

**Manual click-through (`pnpm dev`, owner on `http://localhost:5111`):**
8. `/` (signed out) → "Sign up" / "Sign in" links.
9. `/dashboard` while signed out → redirected to `/sign-in`.
10. `/sign-up`: submit empty → "Email is required" / "Password is required"; `not-an-email` / `short` → "Enter a valid email address" / "Password must be at least 8 characters"; a 73-char password → "Password is too long".
11. `/sign-up` with `owner1@example.com` / `password123` → redirected to `/dashboard`; shows "Welcome, owner1@example.com" + "You haven't created a venue yet."
12. Reload `/dashboard` → still signed in. DevTools → Cookies: `mizrahitality_owner_session` present, `HttpOnly` ✓, `SameSite=Lax`, no `Secure` (dev http), `Path=/`, ~30-day expiry.
13. `/sign-in` or `/sign-up` while signed in → redirected to `/dashboard`.
14. "Sign out" → redirected to `/sign-in`; cookie gone; `/dashboard` redirects to `/sign-in` again; in `pnpm db:studio` the `sessions` row for that token is gone.
15. `/sign-up` again with `owner1@example.com` → email-field error "That email is already registered…"; no new `owners` row.
16. `/sign-in` with `owner1@example.com` / `wrongpass` → generic "Invalid email or password."; with `nobody@example.com` / `x` → same generic message; with `owner1@example.com` / `password123` → into `/dashboard`.
17. **No-leak:** sign up `owner2@example.com` in a second browser profile → `/dashboard` shows `owner2@example.com`; `pnpm db:studio` shows 2 `owners`, 0 `venues`, each `sessions` row pointing at the right `ownerId`.
18. Confirm there's no UI to create a venue (that's #3) and the dashboard correctly reports "no venue yet."

**Docs:** `prisma/CHANGELOG.md` has the new entry; `NOTES.md` "Build order" has #2 ticked and the resolved decisions recorded; `CLAUDE.md` / `README.md` status blurbs updated; this plan copied to `plans/02-owner-auth-plan.md`.
