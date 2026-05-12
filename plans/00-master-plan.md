# Master build plan

How Mizrahitality gets built: the order, and what each feature's plan file is on the hook for. Source of truth for *what/why* is `VISION.md` + `PRD.md`; for build order + settled cross-cutting decisions it's `NOTES.md`. This file is the bridge — it turns the build order into a charter per feature so each `plans/NN-<feature>-plan.md` can be written and executed standalone.

Plan files in `plans/` are number-prefixed so the directory lists in build order: `00-master-plan.md` (this file), then `01-monorepo-foundation-plan.md` … `09-demo-seed-plan.md` — the `NN` is the feature's build-order number from the table below.

## How feature plans work

- We build **feature by feature in plan mode**: pick the next feature → write its `plans/NN-<feature>-plan.md` in a plan-mode session → get it approved → implement it → move to the next. No spec/audit pipeline.
- Each feature has exactly one plan file: `plans/NN-<feature-name>-plan.md`, where `NN` is the feature's build-order number and `<feature-name>` is the name from the table below (so `plans/` lists in build order).
- A feature's plan is authored **when its turn comes**, not up front — so details that depend on not-yet-available inputs (supplied UI/templates/stock images, the slot schema) get pinned with the right information in hand.
- **Every `plans/NN-<feature>-plan.md` must contain these sections:**
  1. **Context** — why this feature, what it unblocks.
  2. **Scope** — the concrete things it builds (files, routes, models, UI screens, contract additions).
  3. **Out of scope** — the project-wide non-goals it must respect, plus anything deferred to a later feature.
  4. **Dependencies** — which features must be done first (see the chain below); which supplied assets must be in hand.
  5. **Contracts additions** — exactly what this feature adds to `@mizrahitality/contracts` (types/constants/DTOs), if anything.
  6. **PRD requirements satisfied** — the `REQ-N` IDs this feature delivers (in whole or in part).
  7. **Open questions to pin** — decisions to make while writing this plan (carry the relevant ones from the per-feature notes below + `NOTES.md` "Open / pending").
  8. **Verification** — how to prove it works end-to-end (commands to run, screens to click, tests, MCP/manual checks).
- **Doc upkeep is part of the feature, not separate:** when a feature changes a build decision or the run/test story, its plan updates `NOTES.md`, and updates the "not yet scaffolded" notes in `CLAUDE.md` / `README.md` once the foundation lands. The master plan only records that this is owed.

## Build order & dependency chain

Build top to bottom. `→` = hard dependency; `↔` = may interleave.

```
1 monorepo-foundation
        │
2 owner-auth
        │
3 site-builder
        │
4 ai-copy-and-variants
        │
        ├──────────────┐
5 published-page-ssr   6 analytics-api      (5 ↔ 6 — both only need #4's stored variants)
                              │
                              ├──────────────┐
                       7 analytics-dashboard 8 customer-site   (7 ↔ 8 — both need #6's API)
                              │              │
                              └──────┬───────┘
                              9 demo-seed     (needs everything)
```

Settled cross-cutting decisions (Node 22 / pnpm / ports / contracts surface / cookie auth / one venue per owner / open API / image input / server-side visitor type / Tailwind+shadcn / Prisma+SQLite ownership / env handling / Vitest / root scripts) live in `NOTES.md` → "Foundation decisions" — every feature plan inherits them; don't restate, link.

## Per-feature charters

For each feature: **plan file**, **depends on**, **goal**, **scope**, **out-of-scope reminders**, **contracts additions**, **PRD REQs**, **acceptance gate**, **open questions to pin**, **supplied-asset dependency**.

---

### 1. monorepo-foundation — `plans/01-monorepo-foundation-plan.md`

- *Depends on:* — (scaffold fresh on `main`; only docs exist).
- *Goal:* a runnable monorepo skeleton both apps + the shared package live in.
- *Scope:* pnpm workspace (`preinstall` → `only-allow pnpm`, `.nvmrc` Node 22, corepack); `packages/contracts` (`@mizrahitality/contracts`, zero runtime deps, consumed as TS source — `transpilePackages` in each app); the contracts surface: `VISITOR_GENDERS`, `AGE_GROUPS`, `SLOT_TYPES` (`rich-text`, `image`), `ANALYTICS_EVENT_TYPES`, the `VisitorType` union, `allVisitorVariants()` → exactly 7, an `ApiError` shape; `apps/owner` Next.js App Router skeleton (port 5111) with Prisma + SQLite scaffold (`lib/prisma.ts` singleton, empty schema, `prisma/CHANGELOG.md`) + Tailwind + shadcn/ui wired; `apps/customer` Next.js App Router skeleton (port 5112) with a placeholder `GET /` index and a slug-echoing `GET /[slug]` (no owner-API call yet); ESLint flat config (`no-explicit-any` = error) + Prettier; per-package Vitest (`environment: 'node'`); `lib/env.ts` fail-fast in each app; `.env.example` committed, `.env` gitignored; root scripts (`dev`/`build`/`lint`/`typecheck`/`test`/`format[:check]` via `pnpm -r [--parallel]`; `db:push`/`db:migrate`/`db:studio` delegating to owner; `seed` → `node scripts/seed.mjs`); `scripts/seed.mjs` as a no-op ESM stub.
- *Out-of-scope reminders:* no real models yet; no auth yet; no API endpoints yet; no API-key constant (the API is open).
- *Contracts additions:* the whole initial surface above. DTOs come later with the features that introduce them.
- *PRD REQs:* REQ-20 (monorepo), REQ-13 (SSR `/[slug]` route exists), partial REQ-3 (no API-key UI anywhere — establish the no-auth posture).
- *Acceptance gate:* `pnpm install && pnpm dev` runs both apps; `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all green on the skeleton; `pnpm db:push` is a clean no-op on the empty schema; `localhost:5112/<anything>` SSR-renders an echo of the slug.
- *Open questions to pin:* shadcn init choices (style, base color) — keep minimal; whether `Owner`/`Venue` will be one model or two (decide here or defer to #2).
- *Supplied assets:* none required to land the skeleton; the supplied owner UI/theme can be slotted in later (REQ-11).
- *On landing:* update the "not yet scaffolded" notes in `CLAUDE.md` and `README.md`; summarize day-to-day commands in `CLAUDE.md` → "Build / run / test".

### 2. owner-auth — `plans/02-owner-auth-plan.md`

- *Depends on:* #1.
- *Goal:* real accounts + sessions; the first Prisma models.
- *Scope:* Prisma models — `Owner` (email unique, bcrypt password hash), `Venue` (1—1 with `Owner`, created later in the builder — nullable/absent until then), `Session` (opaque token, owner FK, expiry); migration via the `update-database` skill (+ `prisma/CHANGELOG.md` entry); email+password **sign-up** and **sign-in** (validation: duplicate-email rejection, weak/invalid email/password rejection) writing an `httpOnly`/`secure`/`sameSite=lax` session cookie; **sign-out** clearing it; `lib/auth.ts` server helper that reads the cookie → current owner; route-level guarding for owner-only pages; no slug at sign-up.
- *Out-of-scope reminders:* no email verification, no password reset, no OAuth/NextAuth, no teams/roles, no venue selector (one venue per owner), no builder UI yet.
- *Contracts additions:* none expected (auth shapes are owner-app-internal).
- *PRD REQs:* REQ-1 (sign-up), REQ-2 (sign-in/session/sign-out), REQ-22 (one venue per owner — modeled), partial REQ-11 (auth screens, supplied UI if available).
- *Acceptance gate:* duplicate/invalid sign-ups rejected with clear messages; valid sign-up signs the owner in; session survives reload; wrong credentials rejected; sign-out clears the session; an owner has no venue until the builder creates one; data never leaks between owners.
- *Open questions to pin:* `Owner`+`Venue` one model vs two (final call); session lifetime/expiry policy.
- *Supplied assets:* supplied sign-up/sign-in designs if they've landed (else use plain Tailwind+shadcn, refine under REQ-11 later).

### 3. site-builder — `plans/03-site-builder-plan.md`

- *Depends on:* #2.
- *Goal:* the builder form — the owner's *entire* input surface — plus persistence, preview, and a publish-flow skeleton.
- *Scope:* the builder page with exactly three inputs — **venue name** (English letters + spaces only, rejected otherwise with a clear message; slug derived = lowercased, spaces removed, numeric suffix on collision; slug shown to the owner), **free-text description**, **one image** (upload → stored on local disk under the owner app, path persisted, served back via the owner app so the customer can build an absolute URL; **or** pick one of the 3 supplied stock images; choice changeable later); persisting these on the owner's `Venue`; a **preview** reflecting current content; a **publish-flow skeleton** (a "Publish" affordance + the `Page`/variant storage shape, with the AI generation left as a stub `#4` fills in); schema changes via `update-database`.
- *Out-of-scope reminders:* **no** layout editor, **no** rich-text editor, **no** image-placement UI, **no** drag-and-drop, **no** other content controls; no AI calls yet; no second venue; AI never touches the image (here there's no AI at all yet).
- *Contracts additions:* possibly the `Page`/variant storage DTO shape if it's shared (likely owner-internal until `published-page-ssr` / `analytics-api` need it — decide here).
- *PRD REQs:* REQ-4 (description-driven builder), REQ-22 (one venue, one builder, no selector), partial REQ-12 (edit the inputs/image — persistence), partial REQ-11.
- *Acceptance gate:* owner sets/edits the venue name (invalid chars rejected), writes/edits the description, uploads or picks a stock image (and can change it), sees the derived slug; inputs + image persist across sessions; preview reflects current content; the owner has no other controls; the publish affordance exists even though variant generation is still a stub.
- *Open questions to pin:* slug freeze policy — does renaming after first publish re-derive the slug, or is it frozen at first publish? (leaning: frozen — the customer URL shouldn't move under visitors); upload constraints (size/type/dimensions); where on disk uploads live and the route that serves them.
- *Supplied assets:* the **3 stock images** (required to finish this feature); the supplied builder UI (else plain Tailwind+shadcn, refined under REQ-11).

### 4. ai-copy-and-variants — `plans/04-ai-copy-and-variants-plan.md`

- *Depends on:* #3.
- *Goal:* the two text-only Claude steps, ending in 7 stored, validated variants at publish.
- *Scope:* via the `claude-api` skill (Sonnet 4.6, **prompt caching**, `ANTHROPIC_API_KEY`): (a) **enhance** — an action that rewrites the owner's description text; owner accepts the enhanced copy or keeps their own (reject leaves the original untouched); (b) **author-into-template** — for each of the 7 visitor variants (`male`/`female` × `18-30`/`31-50`/`50+` + `neutral`) take the approved copy + that variant's template + its per-audience copy rules → emit structured JSON for the template's Rich Text slot; the owner's chosen image fills the Image slot deterministically (AI never touches it); deterministic, code-driven page assembly; **structural validation** of each populated template against its slot schema; persist the 7 results; a **publish gate** that blocks unless all 7 exist and validate; per-variant review + regenerate (regenerate replaces the set); **no AI call in the page-serving path** — generation is eager at publish.
- *Out-of-scope reminders:* AI authors **text only** — never the image, never layout/styling/templates (those are supplied design assets); no AI at request time; no "alien" visitor type.
- *Contracts additions:* the **slot schema** (each slot's role + min/max length + required/optional) and the per-audience **copy-rules format** the author step consumes — define here, in `@mizrahitality/contracts` if shared (the rendered-page DTO that exposes a populated variant may land here or in `published-page-ssr` — coordinate).
- *PRD REQs:* REQ-5 (description enhancement), REQ-6 (audience-targeted templates), partial REQ-12 (regenerate variant set on re-publish).
- *Acceptance gate:* enhancement returns polished copy, accept/reject works, reject is non-destructive; after generation all 7 populated templates exist, their copy differs appropriately per audience, the neutral one is coherent plain copy, each is structurally valid against its slot schema; regenerate produces a fresh set; publish is blocked unless all 7 exist and validate; no AI call sits in the serve path.
- *Open questions to pin:* the concrete slot schema + copy-rules format (pin now, with the supplied templates in hand); prompt-caching strategy (cache the template/rules/system prompt, vary the variant); validation/regenerate retry behavior on overflow/underfill or invalid structure; how variants are stored (per-variant `Page`/`Variant` rows? a JSON blob?).
- *Supplied assets:* the **per-audience template set + per-template copy rules** (required); the 3 stock images (from #3).

### 5. published-page-ssr — `plans/05-published-page-ssr-plan.md`

- *Depends on:* #4. (May interleave with #6.)
- *Goal:* the owner's own server-rendered published page.
- *Scope:* an SSR route in `apps/owner` that renders a venue's published page (HTML fully composed in the initial server response, not assembled client-side) from the stored variants; the **rendered-page response DTO** added to `@mizrahitality/contracts` (the payload the `analytics-api` GET will also return — coordinate so #5 and #6 share one shape); rendering the per-audience template + the populated Rich Text slot + the Image slot's image URL + template styling.
- *Out-of-scope reminders:* no AI call in this path (serve precomputed); no client-side assembly; this is the *owner-side* view of the published page — the public visitor site is `customer-site` (#8).
- *Contracts additions:* the rendered-page DTO (shared with #6).
- *PRD REQs:* REQ-7 (SSR published page).
- *Acceptance gate:* the published page's HTML arrives fully composed in the initial server response; it reflects the stored variant.
- *Open questions to pin:* which variant the owner's own preview/published view shows (neutral? a switcher? — keep minimal); whether this route doubles as the data source for #6's GET or they share a renderer module.
- *Supplied assets:* the per-audience templates (from #4) — already in hand by here.

### 6. analytics-api — `plans/06-analytics-api-plan.md`

- *Depends on:* #4. (May interleave with #5; #7 and #8 depend on this.)
- *Goal:* the open REST/JSON API the customer app consumes.
- *Scope:* `GET /api/venues/<slug>/page?type=<visitor-type>` → the fully-rendered page payload for that variant (unknown/absent `type` → `neutral`; unknown slug → 404; `type` supplied server-side by the customer, never in a browser URL; payload precomputed — no AI in the path); `POST /api/venues/<slug>/events` with `{ "type": "visit" | "book-now-hover" | "book-now-click", "visitorType": "<visitor-type>" }` → records the event against that venue (unknown slug → 404); the `Event` model (venue FK, type, visitor type, timestamp) via `update-database`; **no auth** — no keys, no tokens, no API-key UI; the API DTOs (event request/response shapes) added to `@mizrahitality/contracts` (reusing the rendered-page DTO from #5).
- *Out-of-scope reminders:* no authentication/keys (open localhost API); no analytics beyond what the dashboard needs; the customer app never touches the DB — only this API.
- *Contracts additions:* event request/response DTOs; reuse the rendered-page DTO from #5.
- *PRD REQs:* REQ-9 (REST/JSON API), REQ-3 (open API — finalized), REQ-16 (the event-ingestion side), REQ-21 (documented API contract — pinned on landing).
- *Acceptance gate:* GET returns the variant matching the requested type (neutral if unknown/absent); POST records an event attributed to the right venue + type; unknown slug → 404; no credentials required anywhere.
- *Open questions to pin:* event de-dup rules at ingestion vs. at dashboard-compute time (esp. "hovered ≥ once before clicking" — likely computed in #7, but the event grain must support it); whether a visit/hover/click carries a session correlator so the funnel math is possible; error/response envelope (`ApiError` shape from contracts).
- *Supplied assets:* none new.
- *On landing:* pin `README.md` → "REST API contract" to the implementation; flesh out `NOTES.md` → "API contract sketch".

### 7. analytics-dashboard — `plans/07-analytics-dashboard-plan.md`

- *Depends on:* #6. (May interleave with #8.)
- *Goal:* the owner dashboard — every chart/metric/percentage, computed server-side over recorded events.
- *Scope:* for the owner's one venue — total visits; "Book Now" click count; "Book Now" hover count; daily-visitors vertical bar chart **with a trendline**; gender breakdown; age-group breakdown; "Book Now" clicks by gender (vertical bar chart); percentages — (a) clicks ÷ total visitors, (b) clickers who hovered ≥ once ÷ all clickers, (c) per gender × age group: clicks-from-segment ÷ visitors-from-segment; **all aggregation server-side**; charts via shadcn's Recharts-based Chart as thin client components that only draw the SVG from props (no client fetching, no loading state); empty-venue → zeroed/empty states, no errors.
- *Out-of-scope reminders:* no A/B engine, no funnels other than hover→click; chart components do no data fetching; no venue selector.
- *Contracts additions:* none expected (dashboard data is owner-internal).
- *PRD REQs:* REQ-8 (dashboard).
- *Acceptance gate:* every listed figure/chart renders; numbers reconcile with recorded events; an empty venue shows zeroed/empty states without errors; figures + percentages computed server-side.
- *Open questions to pin:* the exact de-dup/attribution rules so the math reconciles (visits per "session"? "hovered before clicking" definition?); trendline computation (linear regression over daily counts?); date range/bucketing for the daily chart.
- *Supplied assets:* the supplied dashboard UI (else plain Tailwind+shadcn, refined under REQ-11).

### 8. customer-site — `plans/08-customer-site-plan.md`

- *Depends on:* #6. (May interleave with #7.)
- *Goal:* the public SSR visitor site, made real.
- *Scope:* `apps/customer` `GET /[slug]` SSR-renders the page returned by `GET /api/venues/<slug>/page?type=<visitor-type>` for the current visitor type and renders the supplied per-audience template (plain Tailwind/React components); a **"Book Now"** button → records a `book-now-click` event then shows a friendly confirmation modal/toast (no real booking backend); fires events to the API — `visit` on load, `book-now-hover` on hover (de-duped per session as needed), `book-now-click` on click — each tagged with the active visitor type; the **mid-left hover-out demo tab** revealing controls for 2 genders × 3 age groups + a neutral/"unknown" option; selecting a type writes a cookie the server reads on each request and passes into the API call → re-renders (SSR) for that type and tags subsequent events with it; **nothing about visitor type in the browser URL or page UI**; absent/unknown type → the neutral variant; a friendly **not-found** page for a bad slug and a friendly **retry-later** page if the API is down (no stack traces).
- *Out-of-scope reminders:* the customer app never touches the DB — only the owner REST API; no real booking/payments; visitor type never in the URL or visible UI; no real visitor identification (the tab is purely a reviewer aid).
- *Contracts additions:* none new (consumes the DTOs from #5/#6).
- *PRD REQs:* REQ-13, REQ-14, REQ-15, REQ-16 (the emit side), REQ-17, REQ-18, REQ-19.
- *Acceptance gate:* visiting `/<slug>` yields an SSR page from the API payload; changing the type (via the tab) changes the rendered content (SSR) and the tag on subsequent events; a page load posts a `visit`; hovering Book Now posts a `book-now-hover` (de-duped); clicking posts a `book-now-click` and shows the confirmation, with no external booking call; no visitor-type info appears in the URL; with no type selected the neutral variant renders; a bad slug shows a helpful not-found page; an API outage shows a friendly retry page.
- *Open questions to pin:* hover de-dup scope (per session? per page load?); how the demo tab is styled/positioned without leaking into the "real" page; cookie name/format for the selected type; whether the customer index (`GET /`) gets a tiny upgrade beyond the foundation placeholder.
- *Supplied assets:* the **per-audience customer templates** (plain Tailwind/React) — same set #4 authors copy into; the demo-tab UI if supplied.

### 9. demo-seed — `plans/09-demo-seed-plan.md`

- *Depends on:* everything (#1–#8).
- *Goal:* a one-command demo dataset.
- *Scope:* fill in `scripts/seed.mjs` (plain Node ESM) to create demo **Owner #1** with a fully-built, published venue (name → slug, description, a stock image, all 7 generated+validated variants) **and realistic multi-day historical analytics events** (visits/hovers/clicks across genders × age groups across several days, shaped so every dashboard figure/chart/percentage is non-trivial); and demo **Owner #2** that starts empty (account + no venue, or venue with no events — whichever matches the "starts empty" intent); live events thereafter accrue to whichever venue they target; tests never touch `./dev.db` (temp `DATABASE_URL`).
- *Out-of-scope reminders:* the seed doesn't call the live Claude API per-run unless that's the cheap/robust path — prefer canned variant JSON checked in or generated once; no production data.
- *Contracts additions:* none.
- *PRD REQs:* REQ-10 (seed script), and it's the enabler for the GA "reviewer walkthrough with only the seed run" gate.
- *Acceptance gate:* after `pnpm seed`, Venue #1's dashboard shows populated multi-day data and its public page renders all 7 variants distinctly; Venue #2's dashboard is empty without errors; live events after seeding accrue correctly; the full README walkthrough passes with no setup beyond the seed.
- *Open questions to pin:* whether seeded variants are canned JSON or generated by a one-off AI run; the historical event distribution (how many days, what volume, what gender/age mix) so the math looks real; how "Venue #2 empty" is represented.

---

## Supplied assets — the cross-feature blocker

Three things are supplied by the user, not designed here, and gate specific features:

- **Owner-facing UI design files** (sign-up, sign-in, builder, dashboard, dialogs) — needed to *finish* REQ-11; features #2/#3/#7 ship plain Tailwind+shadcn first and get refined when the designs land.
- **The per-audience template set + per-template copy rules** — hard-blocks completing #4 and #8; also fixes the slot schema #4 pins.
- **The 3 stock images** — hard-blocks completing #3 (and they're what #4's Image slot uses, #9 seeds).

The master plan flags these; each affected feature plan must list which it needs and what it does in the meantime.

## Tracking

`NOTES.md` → "Build order" stays the canonical status table; when a feature lands, tick it there and note any decisions/open-questions resolved. This master plan changes only if the *set* of features or their *charters* change.
