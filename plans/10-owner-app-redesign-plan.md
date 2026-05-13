# Owner-app redesign — Pragmatic Utility System

## Context

The user added 9 new design assets to `plans/owner-app-pages/` (an HTML mockup + screenshot each for the auth wrapper, sign-in / sign-up forms, the sign-in loading + auth-success toast state, an authed dashboard shell, a "Your Sites" dashboard, a split-pane site builder, and the builder's save-feedback state — plus `design.md` and two `pragmatic_utility_system_{1,2}/DESIGN.md` system files). The mockups specify a "Pragmatic Utility System": Inter, very-light-gray canvas (`#F9FAFB`), white surfaces with 1px `#E5E7EB` borders (no drop shadows), near-black text (`#111827`) over muted gray helper (`#6B7280`), deep-slate primary buttons (`#0F172A`), muted feedback colors (`#059669` / `#DC2626`), 6px / 8px / 12px corner rounding, 44px min tap targets, and animation restricted to fast micro-interactions.

The current owner app uses the default shadcn-new-york `oklch` palette + Geist font + a thin top horizontal nav (`apps/owner/src/app/(authed)/layout.tsx:10-37`). The goal is to adopt the new system across **the four owner-app surfaces only** — sign-in, sign-up, dashboard, builder — while leaving the **public-facing `/preview` published page** (`apps/owner/src/app/preview/*`, `apps/owner/src/components/published-page/*`) and the entire `apps/customer` app untouched (they are their own warm `#FAF7F2` "Warm Minimalist" design from feature #5).

Confirmed scope decisions:
1. Sidebar layout with **Dashboard + Builder only** (no Projects / Settings). Owner email + Sign out in the sidebar footer; collapses to a top bar on mobile.
2. Text-only "Mizrahitality" / "Owner portal" branding — no generic "B2B Utility" icon tile.
3. Drop the topbar search and the multi-row "Your Sites" table — both are inapplicable (one venue per owner, no search). The single "Your venue" card stays, restyled with a Published / Draft chip lifted from the mockup.

## Approach

Treat this as a **theme + chrome swap, not a rewrite**. Every page already has the right content and the right shadcn primitives — they just need to render against new tokens and a new authed shell. Use Tailwind v4's CSS `@theme inline` (already wired up at `apps/owner/src/app/globals.css:7-48`) to retune the root variables; existing `<Button>` / `<Input>` / `<Card>` etc. pick up the new palette automatically.

### 1 · Design tokens (`apps/owner/src/app/globals.css`)

Replace the `:root` block at `globals.css:50-83` so the existing `@theme inline` mapping at `globals.css:7-48` resolves to the Pragmatic Utility System palette. Keep the **variable names** unchanged so all shadcn components keep working; only the *values* swap. Mapping:

| Token | New value | From mockup |
|---|---|---|
| `--background` | `#F9FAFB` | app canvas |
| `--foreground` | `#111827` | primary text |
| `--card` | `#FFFFFF` | surface |
| `--card-foreground` | `#111827` | |
| `--popover` | `#FFFFFF` | |
| `--popover-foreground` | `#111827` | |
| `--primary` | `#0F172A` | deep slate button |
| `--primary-foreground` | `#FFFFFF` | |
| `--secondary` | `#F3F4F6` | secondary surface |
| `--secondary-foreground` | `#111827` | |
| `--muted` | `#F3F4F6` | |
| `--muted-foreground` | `#6B7280` | helper text |
| `--accent` | `#F3F4F6` | |
| `--accent-foreground` | `#111827` | |
| `--destructive` | `#DC2626` | error |
| `--border` | `#E5E7EB` | border-subtle |
| `--input` | `#E5E7EB` | |
| `--ring` | `#0F172A` | focus ring = primary |
| `--radius` | `0.375rem` (6px) | "subtle rounding" |
| sidebar/chart tokens | (re-tune below) | |

Sidebar: keep the existing `--sidebar*` names but retune — `--sidebar: #FFFFFF`, `--sidebar-foreground: #111827`, `--sidebar-primary: #0F172A`, `--sidebar-primary-foreground: #FFFFFF`, `--sidebar-accent: #F3F4F6`, `--sidebar-accent-foreground: #111827`, `--sidebar-border: #E5E7EB`, `--sidebar-ring: #0F172A`. Charts: lean on dark-grey-scale (`#111827 / #374151 / #6B7280 / #9CA3AF / #D1D5DB`) so recharts wrappers in `apps/owner/src/components/dashboard/*` stay legible against the new white cards.

Add **one new** semantic token outside the standard shadcn set: `--success: #059669` + `--color-success: var(--success)` in the `@theme inline` block, so the "Published" chip can use `text-success` / `bg-success/10`. (No `success-foreground` needed — chip is text-only.)

**Leave alone**: the `.dark` block at `globals.css:85-117` (we never toggle dark mode — `apps/owner/src/app/layout.tsx` has no `darkMode` class — but keeping it stops shadcn's `dark:` variants from breaking), the keyframes at `globals.css:131-163` (`pulse-glow` / `fade-in-up` belong to the published page), and the `@theme inline` mapping (names match what shadcn ships with).

### 2 · Inter font (`apps/owner/src/app/layout.tsx`)

Swap `Geist` for `Inter` from `next/font/google` with weights `400, 500, 600, 700` exposed as `--font-sans` (the `@theme inline` block already aliases `--font-sans` and `--font-heading` to it, so nothing else changes). Body className stays — drop the hardcoded `bg-white` so it falls back to `bg-background` (now `#F9FAFB`).

### 3 · Authed shell — sidebar (`apps/owner/src/app/(authed)/layout.tsx`)

Rewrite the layout body (lines 10-37) to a two-column flex: a 240px `<aside>` on `md:` and up + a `<main>` that fills the rest. Keep the existing `requireOwner()` guard exactly as-is — it's the security boundary.

Sidebar structure (top → bottom):
- **Brand block** (`px-4 py-5 border-b`): "Mizrahitality" page-title (24px / 600) + "Owner portal" helper-text muted.
- **Nav** (`flex flex-col gap-1 p-2 flex-1`): two `<Link>` rows for `/dashboard` and `/builder`. Use `usePathname()` (requires `'use client'` on a small `<SidebarNav>` extracted component — server layout wraps the client nav so the rest stays server-rendered) to apply the active style: `bg-secondary text-foreground` vs. inactive `text-muted-foreground hover:bg-secondary hover:text-foreground`. Each row: `min-h-[44px] rounded-md px-3 py-2 flex items-center gap-3 text-sm font-medium`. Skip Material icons (we don't ship that font — use shadcn-friendly inline SVG `lucide-react` is **not** currently a dep, so use plain inline SVGs or omit icons; recommend **omit icons** for simplicity and consistency with the text-only branding decision).
- **Footer block** (`border-t p-4 space-y-3`): owner email in `text-xs text-muted-foreground` + the existing `<form action={signOutAction}>` with a ghost-variant button "Sign out".

Mobile (`<md`): hide the sidebar; show a thin top bar with the wordmark + a hamburger trigger that toggles the sidebar as a slide-over. Implement as a tiny client component (`<MobileNavTrigger>` + `<MobileSidebar>`) using a `useState` boolean — no shadcn `Sheet` dependency, just a fixed-position panel with a backdrop. **Tap-target min**: 44px.

`<main>` keeps `max-w-5xl mx-auto px-6 py-10` so the dashboard's 2-column charts grid (widened to `max-w-5xl` in feature #7) still fits.

### 4 · Auth pages (`apps/owner/src/app/(auth)/*`)

`(auth)/layout.tsx` already centers a `w-full max-w-sm` card; widen to `max-w-[400px]` to match the mockup. Background falls through to `bg-background` (`#F9FAFB`).

Edit **the two existing forms** (don't add new components):
- `apps/owner/src/components/auth/sign-in-form.tsx` — wrap the form in a `<div class="bg-card border rounded-xl p-6 flex flex-col gap-6">`. Heading: keep `<h1>` but bump to `text-2xl font-semibold tracking-tight` ("Welcome back") + helper-text below ("Sign in to your owner portal."). Inputs already use shadcn `<Input>` + `<Label>` — they inherit the new theme. Submit button stays `w-full`, picks up the new primary. Bottom: `pt-4 border-t text-center` with "Need an account? [Sign up]" link in `text-foreground hover:underline`. Drop the existing "Contact Support" link if any (mockup has it, but we don't ship support — keep it out, matches scope-cut decision).
- `apps/owner/src/components/auth/sign-up-form.tsx` — same card chrome. Heading "Create your account" + helper-text "Email and a password — that's all." (preserve the current copy). Bottom: "Already have an account? [Sign in]".

The loading state already exists (`Signing in…` / `Creating your account…` button text). Add a small `text-xs text-muted-foreground` "Mizrahitality / Owner portal" line **above** the card, mirroring the mockup's wordmark-above-card composition without an icon tile.

**No auth-success toast** — our existing pattern is a `redirect()` on success, which is fine and matches the project's "no toast library" minimalism.

### 5 · Dashboard (`apps/owner/src/app/(authed)/dashboard/page.tsx`)

The page already has the right structure (welcome heading + venue card + analytics grid). Edits:
- Replace the `"Welcome, {owner.email}"` heading with a plain `<h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>` (owner email is now in the sidebar footer, not the page).
- "Your venue" `<Card>` — keep the shadcn primitives, restyle the status pill. Add a small inline component for the chip:
  - `Published` → `inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success`
  - `Draft` → `bg-secondary text-muted-foreground` with the same shape.
- Empty state: "You haven't created your venue yet" — restyle the CTA button (already a shadcn `<Button>`, just inherits the new primary). Label remains "Create your venue".
- Stat cards (`apps/owner/src/components/dashboard/stat-card.tsx` — confirm via `Grep`): retune to `bg-card border rounded-lg p-6` with the metric as `text-3xl font-semibold`, label as `text-sm font-medium`, trend chip as `text-xs text-success` (or `text-muted-foreground` for the "no-trend" case). Recharts wrappers stay as-is — their colors come from the chart tokens which we just retuned.

### 6 · Builder (`apps/owner/src/app/(authed)/builder/page.tsx`)

Keep the existing 2-column `grid gap-8 lg:grid-cols-2` (form left, `<VenuePreview />` right) + `<PublishSection>` + `<GeneratedPages>` below. The mockup's literal split-pane (form-aside + preview-canvas) doesn't fit — we'd lose the existing PublishSection/GeneratedPages flow. **Don't switch layouts** — restyle.

Edits inside the four builder components (all under `apps/owner/src/components/builder/`):
- `builder-form.tsx` — wrap each logical section (Brand details / Description / Photo) in a `<section class="bg-card border rounded-lg p-6 flex flex-col gap-4">` with a `<h2 class="text-base font-medium border-b pb-2">` section header (matches mockup's `Brand Details` / `Hero Section` / `Features` treatment). The "Enhance with AI" panel switches from `bg-muted/40` to `bg-secondary border` so it reads as a nested card. The slug-preview "Saved." status message becomes a tiny `text-xs text-success`.
- `image-picker.tsx` — radio cards: each option becomes `bg-card border rounded-lg p-3` and the selected state uses `ring-2 ring-primary` (already there) + `border-primary`. Stock thumbnails keep `aspect-video w-full object-cover`.
- `publish-section.tsx` — already in its own section (`border-t pt-6`); upgrade to `bg-card border rounded-lg p-6 mt-8`. Success status: `bg-success/10 text-success rounded-md px-4 py-3 text-sm`.
- `generated-pages.tsx` — already a `<Card>`; inherits theme. Per-row treatment: persona label in `text-sm font-medium`, tagline in `text-xs text-muted-foreground`.

**Save-feedback state** — the mockup shows a bottom-pinned "Saving Configuration…" toast. Our current pattern (inline "Saved." text under the submit button) is simpler and sufficient — **keep inline**, just restyle with the success-tinted chip. Don't add a toast library.

### 7 · Reuse — don't rewrite

These ship-already-as-shadcn primitives auto-theme from the swapped tokens (do **not** edit):
- `apps/owner/src/components/ui/button.tsx` — `bg-primary text-primary-foreground` becomes deep slate / white.
- `apps/owner/src/components/ui/input.tsx`, `label.tsx`, `textarea.tsx`, `card.tsx`, `radio-group.tsx`, `chart.tsx`.

The published-page renderer (`apps/owner/src/components/published-page/*`) and its `preview/layout.tsx` font-injection + `bg-[#FAF7F2]` wrapper are **untouched** — they paint their own background over the owner shell, so the token swap is invisible there.

## Critical files

**Edit:**
- `apps/owner/src/app/globals.css` — `:root` palette + 1 new `--success` token in `@theme inline`.
- `apps/owner/src/app/layout.tsx` — Geist → Inter; drop hardcoded `bg-white` so `bg-background` applies.
- `apps/owner/src/app/(authed)/layout.tsx` — sidebar + main shell.
- `apps/owner/src/app/(auth)/layout.tsx` — widen card max-width to `400px`.
- `apps/owner/src/components/auth/sign-in-form.tsx`, `sign-up-form.tsx` — card chrome + headings.
- `apps/owner/src/app/(authed)/dashboard/page.tsx` — heading + venue-card chip styling.
- `apps/owner/src/components/dashboard/stat-card.tsx` (verify path via `Grep`) — card chrome + metric typography.
- `apps/owner/src/components/builder/builder-form.tsx`, `image-picker.tsx`, `publish-section.tsx`, `generated-pages.tsx` — section/card chrome.

**Add (new files):**
- `apps/owner/src/components/layout/sidebar-nav.tsx` — `'use client'` active-link nav.
- `apps/owner/src/components/layout/mobile-sidebar.tsx` — `'use client'` slide-over for `<md`.
- `apps/owner/src/components/dashboard/status-chip.tsx` — Published/Draft chip primitive (small enough to inline if preferred — could just live in `dashboard/page.tsx`).

**Do not touch:**
- `apps/owner/src/app/preview/*`, `apps/owner/src/components/published-page/*` (own design system).
- `apps/owner/src/app/api/*`, `apps/owner/src/app/uploads/*` (server routes — no UI).
- `apps/customer/*` (separate app).
- `apps/owner/src/lib/*` (business logic — no UI).
- `apps/owner/src/components/ui/*` (shadcn primitives — they re-theme automatically).
- `apps/owner/prisma/*` (no schema change).

## Verification

1. **Build & lint:** `pnpm typecheck` and `pnpm lint` from the repo root must stay clean. Strict TS / no-explicit-any.
2. **Visual end-to-end (manual, in the browser):** `pnpm dev` → open `http://localhost:5111`:
   - `/sign-up` and `/sign-in` — confirm the centered `max-w-[400px]` card, the new Inter font, the deep-slate primary button, the `Welcome back` / `Create your account` heading, and the form still submits + redirects.
   - `/dashboard` (signed-in, no venue) — confirm the sidebar shows "Dashboard" + "Builder", the active row highlighted, the owner email + sign-out in the footer; the empty-state CTA still navigates to `/builder`.
   - `/dashboard` (after `pnpm seed`) — confirm the "Published" chip, the stat cards, and the recharts plots all render with the new palette (no oklch leaks, no missing tokens, no white-on-white).
   - `/builder` — confirm the 2-column layout, each section in a white card with a section header, the "Enhance with AI" panel reads as a nested card, the publish flow's success status uses the muted green.
   - `/preview` — confirm it is **unchanged** (warm `#FAF7F2` shell, Playfair display headings, orange CTA with `pulse-glow`).
   - Mobile (DevTools 375px) — confirm the sidebar collapses to a top bar + hamburger and that every interactive element is ≥ 44 × 44 px.
3. **Customer app sanity** — `http://localhost:5112/hotelmizrahi` must still render the customer site unchanged (no shared CSS — they live in different apps).
4. **Tests:** `pnpm test` — no test should regress. Existing tests don't snapshot styles; the analytics aggregator + copy-bundle tests are unaffected.
