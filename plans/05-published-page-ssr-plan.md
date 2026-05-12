# Feature #5 — published-page-ssr — implementation plan

Plan file owed: `plans/05-published-page-ssr-plan.md` (write the full version there when this is approved; this file is the working draft).

## Context

Feature #4 left the database holding, for a published venue, **7 validated `PageVariant.content` copy bundles** (`{ schemaVersion, copy: CopyBundle }`) — one per visitor type — but nothing renders them. The builder's "Generated pages" list only echoes each bundle's `tagline`. Feature #5 builds **the owner's own server-rendered published page**: an SSR route in `apps/owner` that composes a stored variant + the venue's chosen image + the supplied 5-zone "Warm Minimalist" design into a fully-formed HTML page. It also adds the **shared `RenderedPage` DTO** to `@mizrahitality/contracts` — the payload feature #6's `GET /api/venues/<slug>/page` will return — and a `lib/rendered-page.ts` builder module that #6 will reuse in-process. No AI runs in this path (variants are precomputed at publish). This is the owner-facing view of the published page; the public visitor site is feature #8.

Satisfies **REQ-7** (SSR published page) in whole; partial **REQ-12** (re-publish already replaces the stored variants in #4 — #5 just renders the current set) and touches **REQ-11** (the published page follows the supplied `plans/site-design/` design assets).

## Decisions (confirmed with the user)

1. **Route & access** — owner-scoped: a new top-level `apps/owner/src/app/preview/page.tsx`, guarded by `requireOwner()`, rendering the signed-in owner's one published venue (no slug in the URL). A "View published page →" link is added to the builder. Not under the `(authed)` route group (that layout's nav chrome would contradict the design's "zero navigation") — `/preview` is top-level with its own minimal layout and calls `requireOwner()` itself.
2. **Renderer location** — built in `apps/owner` (`src/components/published-page/`). #6's API GET reuses the same `lib/rendered-page.ts` builder + renderer in-process; #8's customer site re-implements its own copy when built (and may extract a shared package then). No new shared package now.
3. **Variant shown** — defaults to the `neutral` variant; an optional `?type=<visitor-type>` query param on `/preview` lets the owner preview the other 6 (`parseVisitorType` → `neutral` on anything unrecognised). The polished hover-out demo tab stays feature #8's job.
4. **`RenderedPage` DTO** — embeds the fixed UI strings (`fixed: { ctaLabel: "Book Now", poweredBy: "Powered by Mizrahitality" }`) alongside the image URL and per-variant body typography, so the payload (and #6's documented API response) is fully self-describing. `imageUrl` is **app-relative** (`/uploads/...` or `/stock/...`) when built for in-app rendering (#5); `buildRenderedPage` takes an optional `baseUrl` that #6 will pass to absolutize it.

## Scope

### 1. Contracts — `packages/contracts/src/page.ts` (new) + `index.ts`
- `RENDERED_PAGE_SCHEMA_VERSION = 1 as const` — versions the DTO independently of `SLOT_SCHEMA_VERSION`.
- `BOOK_NOW_LABEL = 'Book Now'`, `POWERED_BY_TEXT = 'Powered by Mizrahitality'` — the fixed strings (also embedded in the DTO; exporting them lets the builder reference them by name).
- `RenderedPageTypography { bodyFontSizePx: number; bodyLineHeight: number }`.
- `RenderedPage { schemaVersion: typeof RENDERED_PAGE_SCHEMA_VERSION; slug: string; visitorType: VisitorType; venueName: string; imageUrl: string; imageAlt: string; copy: CopyBundle; typography: RenderedPageTypography; fixed: { ctaLabel: string; poweredBy: string } }` — `visitorType` is the variant *actually* served (after the neutral fallback).
- `index.ts` gains `export * from './page';`. Zero new runtime deps (consistent with the package's contract).
- Reuses existing `CopyBundle` (`copy.ts`) and `VisitorType` (`visitor.ts`).

### 2. Owner — `apps/owner/src/lib/rendered-page.ts` (new) — the shared builder module
- `buildRenderedPage(args: { venue: { name; slug; imageKind; imageValue }; variants: { visitorType; content }[]; requestedType: VisitorType; baseUrl?: string }): { ok: true; value: RenderedPage } | { ok: false; error: string }`.
- Picks `variants` row for `requestedType`, else the `neutral` row; runs `parsePageVariantContent` (from `lib/page-variant.ts`) on it; on parse failure returns `{ ok:false }` (won't happen for a normally-published venue — publish is all-or-nothing — so no deep fallback needed).
- Image URL: `imageKind === 'upload'` → `/uploads/<imageValue>`; else `isStockImageId(imageValue) ? stockImagePath(imageValue) : '/stock/'+imageValue+'.jpg'` (reuses `lib/stock-images.ts`, mirroring `venue-preview.tsx`'s `imageSrc`). If `baseUrl` is given, resolve relative→absolute (`new URL(rel, baseUrl)`).
- Typography: `templateEntry(servedVariant).typography` (from `lib/templates.ts`).
- `servedVariant` = the parsed bundle's `copy.variant`.

### 3. Owner — the published-page renderer — `apps/owner/src/components/published-page/`
Translate `plans/site-design/code.html` + `plans/site-design/DESIGN.md` + `plans/landing-page/Mizrahitality_Landing_Page_Blueprint.md` into Tailwind-v4 React, following the field→zone map in `plans/copy-rules/_TEMPLATE-STYLING.md` ("Where each AI-authored field lands"). `code.html` is the *visual* reference; the **blueprint + the mapping table are authoritative for which copy field lands where** (e.g. `code.html` repeats the hook placeholder in Zone 1 — the blueprint's Zone 1 is only H1/H2/CTA/Trust-Primer, so the renderer omits any stray Zone-1 body paragraph; Zone 2 renders exactly 3 paragraphs: `story.hook`, then `story.detail` prose + optional `<ul>` of `story.detailBullets`, then `story.nudge`).
- `published-page.tsx` — **Server Component**, `({ page }: { page: RenderedPage })`. Renders the 5 zones:
  - **Zone 1 (hero, 45/55 split desktop; mobile = full-bleed bg image + bottom→top dark gradient):** H1 = `page.venueName` (Playfair 700); H2 = `page.copy.tagline` (Playfair 600); a `BookNowButton`; micro-copy = `page.copy.heroTrustPrimer`; right column = the image (`<img src={page.imageUrl} alt={page.imageAlt}>` — plain `<img>`, eslint-disabled, same as `venue-preview.tsx`, since `/uploads/*` is dynamic).
  - **Zone 2 (story, white section, fade-in-up on load):** `<p>{story.hook}</p>` / `<p>{story.detail}</p>` + `{story.detailBullets.length > 0 && <ul class="list-disc marker:text-[#E85D4A]">…</ul>}` / `<p>{story.nudge}</p>`. The story container carries the per-variant body type via inline `style={{ fontSize: page.typography.bodyFontSizePx+'px', lineHeight: page.typography.bodyLineHeight }}` and `code.html`'s `max-w-2xl` measure cap; headings keep the global Playfair scale.
  - **Zone 3 (highlight strip):** full-width band, 10–15% coral tint (`bg-[#E85D4A]/10`), `page.copy.highlightStripLine` in Playfair (italic).
  - **Zone 4 (final close):** H3 = `page.copy.closingHeading`; a second `BookNowButton` styled like Zone 1's; micro-copy = `page.copy.closingTrustLine`.
  - **Zone 5 (footer):** `page.venueName` + muted `page.fixed.poweredBy`; zero links.
  - **Sticky mobile bottom bar** (`<StickyMobileBar venueName={page.venueName} ctaLabel={page.fixed.ctaLabel} />`).
- `book-now-button.tsx` — the coral CTA (`bg-[#E85D4A]`, `min-h-[48px] min-w-[48px]`, `animate-pulse-glow`, `hover:scale-[1.03]`). **Inert on #5** (a plain `<button type="button">` with no handler) — a header comment notes feature #8 wires the click → POST `book-now-click` event + the confirmation modal, and feature #6 records it.
- `sticky-mobile-bar.tsx` — `'use client'`; the scroll listener from `code.html`'s inline `<script>` (reveal the frosted-glass bottom bar when the hero CTA scrolls out of view). Purely presentational; `md:hidden`. Hydrates after the SSR HTML — doesn't affect the REQ-7 "fully composed in the initial response" gate.
- Animations: add the `pulse-glow` and `fade-in-up` `@keyframes` + their `animate-*` utilities to `apps/owner/src/app/globals.css` (two keyframes, harmless to the existing owner chrome). Both are pure CSS — no JS.

### 4. Owner — the route — `apps/owner/src/app/preview/`
- `layout.tsx` — loads `Playfair_Display` (600,700) and `Inter` (400,600) via `next/font/google` as CSS vars (`--font-playfair`, `--font-inter`); renders `{children}` inside a wrapper that sets the warm page background (`#FAF7F2`) + those font vars. Does *not* render the authed nav. (`next/font/google` is already used in the repo — `Geist` in the root layout — so no new mechanism.) Nests inside the root `app/layout.tsx`'s `<html><body>`; the wrapper's `min-h-dvh bg-[#FAF7F2]` covers the root body's white.
- `page.tsx` — `async ({ searchParams })`; `const owner = await requireOwner()` (redirects to `/sign-in` if signed out). If `!owner.venue || owner.venue.publishState !== 'published'` → a friendly centered notice ("Publish your venue to see your page") with a link to `/builder`. Else `prisma.venue.findUnique({ where:{ id: owner.venue.id }, include:{ variants:true } })`; `const requestedType = parseVisitorType((await searchParams).type)`; `const r = buildRenderedPage({ venue, variants: venue.variants, requestedType })`; on `!r.ok` → a friendly "page unavailable — try re-publishing" notice (shouldn't happen); else `<PublishedPage page={r.value} />`. Reading `cookies()` (via `requireOwner`) already makes the route dynamic; an explicit `export const dynamic = 'force-dynamic'` is fine but optional.

### 5. Owner — builder hook-up (small)
- `components/builder/publish-section.tsx` — when `published`, render a `<Link href="/preview">View your published page →</Link>` (and a one-liner: "append `?type=` to preview each audience"). It already receives `published`.
- `components/builder/generated-pages.tsx` — per row, when `published`, add a small `Link` to `/preview?type=<variant>` next to the persona label (a nice "preview this audience" affordance for the reviewer). Optional polish — keep if it stays tidy alongside the existing `<RegenerateButton>`.

### 6. Tests — `apps/owner/src/__tests__/rendered-page.test.ts` (new)
Unit-test `buildRenderedPage` (pure, no DB needed — pass synthetic `variants` rows): correct DTO for a requested type (right `copy`, right `typography` per variant, `fixed` strings, `schemaVersion`); image URL for `imageKind:'upload'` vs `'stock'` (known id and unknown id); `?type` unknown/absent → `neutral` fallback (and `visitorType` reflects the served variant); missing/unparseable `content` → `{ ok:false, error }`; `baseUrl` → absolute `imageUrl`. (Optionally a tiny `packages/contracts` test asserting `RenderedPage`/`RENDERED_PAGE_SCHEMA_VERSION`/the fixed-string constants exist and re-export — alongside the existing `copy.test.ts`/`index.test.ts`.) No HTTP-level route test (the existing suite is unit + temp-DB integration, not a running server) — the route itself is covered by manual verification.

### 7. Docs (upkeep is part of the feature)
- `NOTES.md` — tick **#5** in the "Build order" table; add a "**published-page-ssr (#5) has landed**" block under "Open / pending" recording the 4 decisions above + that contracts gained `page.ts` (`RenderedPage`, `RENDERED_PAGE_SCHEMA_VERSION`, `BOOK_NOW_LABEL`, `POWERED_BY_TEXT`) and `apps/owner` gained `lib/rendered-page.ts` + `app/preview/*` + `components/published-page/*`; note that #6 reuses `buildRenderedPage` (with a `baseUrl`) and #8 will re-implement the renderer. Extend the "contracts surface" bullet (#5 added `page.ts`).
- `CLAUDE.md` — update the "Landed so far" paragraph (add #5) and the "Owner-app routes" conventions paragraph (mention `/preview` — top-level, `requireOwner()`-guarded, full-bleed; the published-page renderer in `components/published-page/`; `lib/rendered-page.ts`; the `@mizrahitality/contracts` `page.ts` DTO).
- `README.md` — update the "Status" line; add a note that the owner can view their published page at `http://localhost:5111/preview` (with `?type=` to preview each audience).
- `apps/owner/prisma/CHANGELOG.md` — **no entry** (no schema change in #5).

## Out of scope (respect these)
- **No AI call in this path** — render precomputed stored `PageVariant` rows; the AI steps stay publish-time only (#4).
- **No analytics / events** — the "Book Now" buttons are inert here; the click handler + confirmation modal are #8, recording the event is #6.
- **No REST API endpoint** — `GET /api/venues/<slug>/page` is feature #6 (which reuses `buildRenderedPage`); `POST .../events` is #6 too.
- **No customer-site rendering** — the renderer is built in `apps/owner` only; #8 builds the customer `/[slug]` page and the demo tab.
- **No new shared package**, **no Prisma schema change**, **no demo-tab UI**, **no `next/image`** for the venue image (`/uploads/*` is a dynamic route — plain `<img>`, as in `venue-preview.tsx`).

## Dependencies
- Feature #4 (done) — the stored, validated `PageVariant.content` bundles + `lib/page-variant.ts`'s `parsePageVariantContent` + `lib/templates.ts`'s `templateEntry`/`typography`.
- Feature #3 (done) — `Venue` content columns (`name`, `slug`, `imageKind`, `imageValue`, `publishState`), `lib/stock-images.ts`, the `GET /uploads/[...path]` route.
- Supplied assets — **all in hand**: `plans/site-design/{code.html,DESIGN.md,screen.png}`, `plans/landing-page/Mizrahitality_Landing_Page_Blueprint.md`, `plans/copy-rules/_TEMPLATE-STYLING.md` (the field→zone map + per-variant body typography). The supplied *owner-chrome* UI is still pending (REQ-11) but doesn't gate #5 — the published page IS one of the supplied designs.

## Contracts additions
`packages/contracts/src/page.ts` — `RENDERED_PAGE_SCHEMA_VERSION`, `BOOK_NOW_LABEL`, `POWERED_BY_TEXT`, `RenderedPageTypography`, `RenderedPage` (re-exported from `index.ts`). Reuses `CopyBundle` / `VisitorType`. Feature #6 will add the event request/response DTOs and reuse `RenderedPage`.

## PRD requirements satisfied
- **REQ-7** (server-side-rendered published page) — fully: the page's HTML arrives fully composed in the initial server response (Server Component render; only the sticky mobile bar hydrates after).
- **REQ-12** (edit & re-publish) — partial: re-publish already replaces the stored variants (#4); #5 renders whatever the current stored set is.
- **REQ-11** (friendly owner-facing UI) — touched: the published page implements the supplied `plans/site-design/` design.

## Open questions to pin (all resolved above)
- Route & access → `/preview`, owner-scoped, top-level, `requireOwner()`-guarded. ✓
- Renderer location → `apps/owner` (`components/published-page/`); #6 reuses the builder, #8 re-implements. ✓
- Variant shown → `neutral` default, `?type=` preview param for the other 6. ✓
- DTO shape → `RenderedPage` with embedded `fixed` strings + image URL (app-relative; `baseUrl` arg absolutizes for #6) + per-variant typography. ✓
- (Minor, decided in-plan: friendly notices for not-published / unparseable instead of a bare 404; plain `<img>`; animations as `@keyframes` in `globals.css`; `next/font/google` for Playfair+Inter in `app/preview/layout.tsx`.)

## Verification (end-to-end)
1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test` — all green; `rendered-page.test.ts` passes.
2. `pnpm dev`. Sign up / sign in an owner; in `/builder` save a venue (name, description, an uploaded or stock image) and **Publish** (requires `ANTHROPIC_API_KEY` in `apps/owner/.env` — the 7 bundles get generated + stored).
3. Click "View your published page →" (or visit `http://localhost:5111/preview`): the 5-zone "Warm Minimalist" page renders with the **neutral** variant's copy (H1 = venue name, H2 = tagline, hero "Book Now" + trust primer, the 3 story paragraphs + bullets if any, the coral highlight strip, the closing H3 + "Book Now" + trust line, the footer) and the chosen image in Zone 1 (right column on desktop / mobile background) — zero navigation, the CTA pulse-glow visible.
4. **REQ-7 gate:** `view-source:http://localhost:5111/preview` (or DevTools → disable JS → reload) shows the page HTML fully composed in the initial server response (not assembled client-side).
5. Append `?type=female-18-30` (and other values, incl. `50%2B` for the `50+` groups): the copy changes to that variant's stored bundle; an unrecognised `type` falls back to `neutral`.
6. As an owner with no venue / a not-yet-published venue → `/preview` shows the friendly "publish your venue first" notice with a `/builder` link. Signed out → `/preview` redirects to `/sign-in`.
7. (If the per-row `generated-pages.tsx` links were kept) each "preview this audience" link opens `/preview?type=<variant>` and renders that bundle.
