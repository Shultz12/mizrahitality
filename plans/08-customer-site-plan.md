# Feature #8 — customer-site

## Context

Feature #8 (`plans/08-customer-site-plan.md`) makes `mizrahitality-customer` real. Today `apps/customer` is the foundation skeleton: `app/[slug]/page.tsx` just echoes the slug, `app/page.tsx` is a placeholder, `lib/env.ts` declares an unused `OWNER_API_BASE_URL`. Everything it needs already exists upstream: the owner REST API (#6 — `GET /api/venues/<slug>/page?type=` returns a `RenderedPage`, `POST /api/venues/<slug>/events` records an event), the `RenderedPage` / `CopyBundle` / `AnalyticsEventRequest` DTOs in `@mizrahitality/contracts` (#5/#6), the "Warm Minimalist" 5‑zone published-page renderer the owner app already built for `/preview` (#5), and the supplied design assets (`plans/site-design/`, `plans/landing-page/`, `plans/copy-rules/_TEMPLATE-STYLING.md`).

This feature builds: the SSR visitor page at `/<venue-slug>` (fetches the rendered page from the owner API per request, renders it server-side), analytics events fired back to the API (`visit` on load, `book-now-hover` on hover, `book-now-click` on click — each tagged with the active visitor type), a "Book Now" button that records the click and shows a friendly confirmation modal (no real booking), the mid-left hover-out demo tab that switches the active visitor type via an `httpOnly` cookie the SSR reads (never in the URL or page UI; absent/unknown → `neutral`), and friendly not-found / API-down pages. Outcome: a reviewer can open `localhost:5112/<slug>`, see the published page, cycle through all 7 audience variants via the tab, click "Book Now", and watch the owner dashboard's numbers move.

**No owner-app changes, no `@mizrahitality/contracts` changes, no Prisma migration** — #8 is purely a consumer (symmetric with how #6/#7 didn't touch the customer app).

## Decisions (resolved with the user)

- **Event transport = React Server Actions in the customer app.** A `'use server'` `trackEventAction({ slug, type, visitorType, sessionId })` that `fetch`es the owner `POST …/events`. Called from a client beacon (on mount → `visit`) and the client Book Now button (`book-now-hover` / `book-now-click`). Same-origin → no CORS, owner app untouched; `OWNER_API_BASE_URL` stays server-only; matches the repo's "Server Actions, not `/api/*` routes" convention (auth #2, builder #3). Errors are swallowed — analytics is best-effort, never surfaces to the visitor.
- **Demo tab = pure-CSS hover/`focus-within` reveal + a Server Action form.** A fixed mid-left tab strip; on hover (and keyboard focus-within) a panel slides out via CSS `group-hover:translate-x-0`. The panel is a `<form action={selectVisitorTypeAction}>` with one `<button type="submit" name="type" value="<variant>">` per `allVisitorVariants()` (7) plus an `value=""` "Unknown / default" button. The action sets an `httpOnly`, `sameSite=lax`, `path=/` cookie `miz_visitor_type` (or `delete`s it for "Unknown") then the route re-renders SSR. No client JS for the tab.
- **Book Now confirmation = a plain Tailwind `'use client'` modal** in the customer app (no shadcn — the customer app deliberately ships plain Tailwind/React per the supplied templates). Backdrop + centered warm card, Escape / backdrop-click to close, `role="dialog" aria-modal="true"`, focuses the close button on open.
- **`book-now-hover` de-dup = once per `(slug, visitorType)` per page-load lifetime** — a module-level `Set<string>` in the button component. A demo-tab switch changes `visitorType` → the new key isn't in the set → one fresh hover recorded per variant viewed; a hard reload resets it. Clicks are never deduped (every click is a real conversion signal).
- **`visit` fires client-side on mount and whenever `visitorType` changes** (a `useRef<string|null>` "last-sent" guard makes it fire exactly once per variant view, immune to React's dev-only StrictMode double-invoke). Server-side firing is avoided (side-effect-in-render, can't carry the per-browser `sessionId`). Reloads counting as fresh visits is intended ("total visits" on the dashboard = count of `visit` events).
- **`sessionId` = `crypto.randomUUID()` lazily minted client-side, cached in `sessionStorage`** (`lib/session-id.ts`) — survives reloads within the tab, so the dashboard's hover→click funnel correlates. Passed as an argument to `trackEventAction` (the owner stores it; absent → `null`, never 400s — #6).
- **Renderer = the customer app re-implements its own copy** of the owner's 5‑zone `PublishedPage` against the shared `RenderedPage` DTO (no new shared package — already pinned in #5's notes). Fonts (`Playfair_Display` 600/700, `Inter` 400/600 via `next/font/google` as CSS vars) + the warm `#FAF7F2` background mirror `apps/owner/src/app/preview/layout.tsx`; the two CSS-only animations (`pulse-glow`, `fade-in-up`) are copied verbatim into the customer `globals.css`.
- **New deps in `apps/customer`: `clsx` + `tailwind-merge`** (+ a `lib/utils.ts` `cn`) so the ported `BookNowButton` / `StickyMobileBar` keep the owner's `cn(...)` idiom. Nothing else (`next/font`, Server Actions are built-in; plain `<img>` for the cross-origin hero — no `next/image`, no `next.config.ts` change).
- **Customer index `GET /`** stays a tiny SSR placeholder (no venue list — the owner API exposes none and listing venues is out of scope); a one-line copy refresh at most.
- **No new automated tests** beyond the existing `__tests__/contracts.test.ts` smoke test — consistent with #5/#7 (`vitest` here is `environment: 'node'`; the page + client bits are browser-y and covered by manual verification + the README walkthrough, which #9's seed turns into one command). The renderer/zone wiring is a faithful port of the owner's already-shipped `PublishedPage`.

## Scope (files)

**New — `apps/customer/src/`:**
- `app/[slug]/layout.tsx` — loads Playfair Display + Inter via `next/font/google` as `--font-playfair` / `--font-inter`, wraps children in the warm `#FAF7F2` shell with `pb-20 md:pb-0` (sticky-bar clearance). Mirrors `apps/owner/src/app/preview/layout.tsx`. Wraps `page.tsx` + `not-found.tsx`.
- `app/[slug]/not-found.tsx` — friendly centered "we couldn't find a venue at that address" + a link to `/`. Server Component, no client JS, warm-styled.
- `components/published-page/customer-page.tsx` — the renderer (Server Component). The 5 zones, ported from `apps/owner/src/components/published-page/published-page.tsx`, using the customer's `BookNowButton` (hero gets `id="hero-cta"`, zone-4 doesn't) + `StickyMobileBar`; also renders `<AnalyticsBeacon slug visitorType={page.visitorType} />` and `<DemoTab current={page.visitorType} />`. Passes `slug` + `page.visitorType` down to the interactive children.
- `components/published-page/book-now-button.tsx` — `'use client'`. The coral pulse-glow CTA (classes ported from owner; a `compact` prop for the sticky-bar instance). `onMouseEnter` → if `(slug|visitorType)` not yet in the module `Set` → add it + `trackEventAction({ slug, type:'book-now-hover', visitorType, sessionId: getSessionId() })`. `onClick` → `trackEventAction({ slug, type:'book-now-click', … })` then open `<BookingConfirmedModal>`.
- `components/published-page/booking-confirmed-modal.tsx` — `'use client'`. Plain Tailwind dialog: `fixed inset-0` backdrop, centered warm card, "You're all set ✓" + "This is a demo — your reservation at {venueName} isn't real, but the click was recorded.", a coral "Close" button; Escape / backdrop click closes; focuses close on open; `role="dialog" aria-modal="true"`.
- `components/published-page/sticky-mobile-bar.tsx` — `'use client'`. Ported from the owner's; the scroll-reveal `useEffect` watching `#hero-cta` is unchanged; its button is a `<BookNowButton compact slug visitorType label={ctaLabel} />`.
- `components/published-page/analytics-beacon.tsx` — `'use client'`. `useEffect(…, [visitorType])` with a `useRef<string|null>` last-sent guard → `trackEventAction({ slug, type:'visit', visitorType, sessionId: getSessionId() })`. Renders `null`.
- `components/published-page/demo-tab.tsx` — Server Component. Fixed `left-0 top-1/2 -translate-y-1/2 z-[90]`, `group`; a visible vertical "Preview as…" tab strip (dark `#2C2824`); on `group-hover` / `group-focus-within` a transform-revealed warm panel containing the `<form action={selectVisitorTypeAction}>` (7 variant buttons via `allVisitorVariants()`, the `current` one ringed/checked; an `value=""` "Unknown / default" button) + a "Reviewer aid — the real site never shows this" caption.
- `components/service-unavailable.tsx` — Server Component. Centered warm "we can't load this page right now — try again in a moment" (no stack trace, no client JS).
- `lib/utils.ts` — `cn(...inputs)` = `twMerge(clsx(inputs))` (mirrors `apps/owner/src/lib/utils.ts`).
- `lib/session-id.ts` — `getSessionId(): string` — browser-only; lazy `sessionStorage['miz_sid']`, falls back to a fresh `crypto.randomUUID()`; module-cached; tolerates `sessionStorage` being unavailable (returns a per-load random id).
- `lib/visitor-type-cookie.ts` — `VISITOR_TYPE_COOKIE = 'miz_visitor_type'`; `readVisitorType(): Promise<VisitorType>` = `parseVisitorType((await cookies()).get(VISITOR_TYPE_COOKIE)?.value)`.
- `lib/visitor-type-actions.ts` — `'use server'` `selectVisitorTypeAction(formData)`: `formData.get('type')` → `isVisitorType` ? `cookies().set(VISITOR_TYPE_COOKIE, value, { httpOnly:true, sameSite:'lax', secure: NODE_ENV==='production', path:'/' })` : `cookies().delete(VISITOR_TYPE_COOKIE)`.
- `lib/analytics-actions.ts` — `'use server'` `trackEventAction({ slug, type, visitorType, sessionId })`: `fetch(`${env.OWNER_API_BASE_URL}/api/venues/${encodeURIComponent(slug)}/events`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ type, visitorType, sessionId }), cache:'no-store' })` inside `try/catch` (swallow).

**Rewritten — `apps/customer/src/`:**
- `app/[slug]/page.tsx` — `const visitorType = await readVisitorType()`; `fetch(`${env.OWNER_API_BASE_URL}/api/venues/${encodeURIComponent(slug)}/page?type=${encodeURIComponent(visitorType)}`, { cache:'no-store' })` in `try/catch`; catch / `!res.ok && res.status!==404` → `<ServiceUnavailable />`; `res.status===404` → `notFound()`; else `const page = (await res.json()) as RenderedPage` → `<CustomerPage page={page} slug={slug} />` (wrap the render in a guard → `<ServiceUnavailable />` on a malformed payload). `cookies()` already makes the route dynamic; add `export const dynamic = 'force-dynamic'` for clarity.
- `app/globals.css` — append the `pulse-glow` + `fade-in-up` `@keyframes` and `.animate-pulse-glow` / `.animate-fade-in-up` utilities (verbatim from `apps/owner/src/app/globals.css`).
- `app/page.tsx` — minor copy refresh only (still a tiny SSR placeholder pointing at `/<your-slug>`).
- `package.json` — add `clsx`, `tailwind-merge` to `dependencies`.

**Untouched:** `apps/customer/next.config.ts`, `vitest.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `.env.example` (`OWNER_API_BASE_URL="http://localhost:5111"` already set), `app/layout.tsx` (the warm shell + fonts live in `app/[slug]/layout.tsx` so `/` stays plain), `lib/env.ts`. **No `apps/owner/**` change. No `packages/contracts/**` change. No Prisma migration / `CHANGELOG.md` entry.**

**Doc upkeep (part of this feature):**
- `NOTES.md` — tick **#8 ✅** in the build table; add a "**customer-site** (#8) has landed" bullet under "Open / pending" recording the decisions above.
- `CLAUDE.md` — replace "The customer site (#8) arrives next." with what landed; extend the "Landed so far" paragraph; flip the customer-side Architecture/Conventions wording to past tense; note the customer-app routes/files.
- `README.md` — add a "Running the customer site" note (visit `:5112/<slug>`; the mid-left tab switches the previewed audience and never appears in the URL; "Book Now" is a demo modal, no real booking; bad slug / owner-down show friendly pages). The "REST API contract" section is already pinned (#6).

## Out of scope

The customer app never touches the DB — only the owner REST API (no shared handle, no cross-app import). No real booking/payments — "Book Now" ends at the confirmation modal. Visitor type never in the URL or visible page UI; no real visitor identification (the demo tab is purely a reviewer aid). No API authentication/keys (the owner API is open). No `next/image` remote config, no shadcn in the customer app, no new shared package, no contracts/schema/migration change, no owner-app change. No venue-list / index beyond the placeholder. The demo seed (`scripts/seed.mjs`) is **#9**, not here — manual publish in the owner app (or the existing `:5111/preview`) is how you get a venue to point at meanwhile.

## Dependencies

- **#6 (analytics-api)** — done: `GET …/page?type=` (`RenderedPage`, absolute `imageUrl`, `Cache-Control: no-store`, 404 on unknown/unpublished) and `POST …/events` (`{type,visitorType,sessionId?}` → 201, lenient `sessionId`).
- **#5 (published-page-ssr)** — done: the `RenderedPage` DTO + the owner's `PublishedPage` 5‑zone renderer + `app/preview/layout.tsx` font/shell pattern to mirror.
- **#4 (ai-copy-and-variants)** — done: the 7 stored `PageVariant` copy bundles a published venue has.
- Supplied assets — all in hand: `plans/site-design/DESIGN.md` + `code.html`, `plans/landing-page/Mizrahitality_Landing_Page_Blueprint.md`, `plans/copy-rules/_TEMPLATE-STYLING.md` (per-variant body typography). No demo-tab / not-found / modal designs were supplied → designed plainly here in the Warm Minimalist palette.
- Owner & customer apps run side by side (`pnpm dev`): owner `:5111`, customer `:5112`; `apps/customer/.env` must have `OWNER_API_BASE_URL="http://localhost:5111"`.

## Contracts additions

**None.** #8 consumes existing `@mizrahitality/contracts` surface: `RenderedPage` / `CopyBundle` / `RenderedPageTypography` / `BOOK_NOW_LABEL` / `POWERED_BY_TEXT` (`page.ts`), `AnalyticsEventRequest` / `AnalyticsEventType` (`analytics.ts`), `VisitorType` / `allVisitorVariants()` / `parseVisitorType()` / `isVisitorType()` (`visitor.ts`), `ApiError` (`errors.ts`).

## PRD requirements satisfied

- **REQ-13** — SSR visitor site at `/<venue-slug>` (`app/[slug]/page.tsx`, fully composed in the server response).
- **REQ-14** — renders from the API per request (`GET …/page?type=<cookie value>` with `cache:'no-store'`; switching the type changes the rendered content).
- **REQ-15** — "Book Now" → records `book-now-click` + shows a friendly confirmation modal; no external booking call.
- **REQ-16** (emit side) — `visit` on load, `book-now-hover` on hover (deduped per variant view), `book-now-click` on click; all tagged with the active (served) visitor type.
- **REQ-17** — the mid-left hover-out demo tab: 2 genders × 3 age groups + "Unknown/default"; selecting one re-renders SSR for that variant and tags subsequent events; nothing about the visitor type in the URL.
- **REQ-18** — absent/unknown cookie → the `neutral` variant; events tagged with `neutral`.
- **REQ-19** — bad slug → friendly not-found page; owner API down/unavailable → friendly retry-later page (no stack traces).

## Verification (end-to-end)

1. `pnpm install` (pulls `clsx` + `tailwind-merge`), then `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — all green across all packages.
2. `pnpm dev` → owner on `:5111`, customer on `:5112`. (Customer `.env` has `OWNER_API_BASE_URL="http://localhost:5111"`.)
3. In the owner app (`:5111`): sign up → builder → set a venue name (note the derived slug), description, pick a stock image → "Enhance with AI" → Publish. *(Requires `ANTHROPIC_API_KEY`; if it's not set, publish is gated — the customer page then correctly shows the not-found page for that slug. The full happy path needs a published venue; #9's seed will make this one command.)*
4. `http://localhost:5112/<slug>` → the 5‑zone Warm Minimalist page renders; `view-source:` (or `curl -s localhost:5112/<slug>`) shows the composed HTML — the copy text and `<img src="http://localhost:5111/uploads/…">` (or `/stock/…`) present in the initial response. Default variant = `neutral`. Cross-check: it should look identical to `:5111/preview` for the same variant.
5. Hover the mid-left "Preview as…" tab → the panel slides out → click "Male · 18–30" → the page re-renders (SSR) with that variant's copy + body typography; the URL stays `/<slug>` (no `?type=`). Click "Female · 50+" → again. Click "Unknown / default" → back to the neutral variant.
6. Reload the page → still showing the last-picked variant (the `miz_visitor_type` cookie persists; it's `httpOnly` — not visible to `document.cookie`).
7. Open the owner dashboard (`:5111/dashboard`): the **total visits** count rose with each page view; **hover** the "Book Now" button on the customer page (jiggle the mouse over it) → `book-now-hover` rose by exactly one per variant view, not per jiggle; **click** "Book Now" → a confirmation modal appears (Escape / backdrop closes it), no navigation, no real booking, and `book-now-click` rose; the gender/age breakdowns + conversion table reflect the variant you were viewing when you clicked.
8. `http://localhost:5112/no-such-venue` → friendly not-found page (link back to `/`), no stack trace.
9. Stop the owner app (`Ctrl-C` on `:5111`), reload `http://localhost:5112/<slug>` → friendly "try again in a moment" page, no stack trace. Restart `:5111` → reload → the page works again.
10. Resize to a narrow viewport: the hero image becomes the full-bleed background with the dark gradient; scroll past the hero CTA → the frosted sticky bottom bar slides up with the venue name + a compact "Book Now" (which fires the same hover/click events + modal).
