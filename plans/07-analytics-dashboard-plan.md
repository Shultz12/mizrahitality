# Feature #7 — analytics-dashboard — implementation plan

> When approved, this lands at `plans/07-analytics-dashboard-plan.md` (mirrors `plans/01..06-*-plan.md`).

## Context

Features #1–#6 got us: owner auth, the builder, AI-generated copy → 7 stored `PageVariant` bundles, the owner's SSR `/preview` page, and the open REST API — including the `Event` Prisma model (`type` ∈ `visit`/`book-now-hover`/`book-now-click`, `visitorType` ∈ the 7, optional `sessionId`, `createdAt`) and the `POST /api/venues/<slug>/events` endpoint that records events. What's missing is the thing PRD §13 calls "real": the **owner analytics dashboard** — every chart/metric/percentage from **REQ-8**, computed **server-side** over those recorded `Event` rows. That's feature #7. It may interleave with #8 (customer site); both need #6's API and #6 has landed. The dashboard data is owner-internal — nothing here touches `@mizrahitality/contracts`, the customer app, the DB schema, or the REST API.

## Decisions (confirmed with the user)

1. **Daily-visitors bar chart window = fixed last 30 calendar days** ending today, zero-filled for gap days. Bucketed in the **server process's local timezone** (it's a localhost demo — that's "the day the owner sees on their machine"). Events older than 30 days don't appear in the daily chart but **still count in the all-time totals/breakdowns/percentages** (in practice the `demo-seed` (#9) creates only a few days of history, so everything reconciles; "total visit count" in REQ-8 reads as all-time).
2. **`neutral` is omitted from the gender / age-group / clicks-by-gender charts** — those charts show only male/female and 18-30/31-50/50+. `neutral` events still count in `totalVisits`, `bookNowClicks`/`bookNowHovers`, the daily series, and the click-through %. Consequence (accepted): when there are `neutral` events, the breakdown bars won't sum to the totals — the "total visits" stat card therefore is not labelled "= sum of the bars". The 6-row gender×age conversion table is always male/female-only too (neutral isn't an "audience").
3. **"Total visitors" = the count of `visit` events** (so "total visits" == "total visitors"). It's the denominator of percentage (a) (click-through) and of each per-segment row. Honest given `sessionId` is optional — a distinct-session count would systematically undercount whenever events lack a `sessionId`.
4. **The `(authed)` layout's `<main>` widens from `max-w-3xl` to `max-w-5xl`** (~1024px) — a one-line change so the dashboard can use a 2-column charts grid. Affects only `(authed)/dashboard` and `(authed)/builder` (sign-in/up are in `(auth)`, `/preview` is top-level — both untouched); the builder's form+preview grid just gets a little more room.
5. **Trendline = ordinary-least-squares linear regression** over the 30-day daily-visit series (`y = slope·x + intercept`, `x` = 0-based day index), exposed as a per-day predicted value on each daily point and drawn as a recharts `<Line>` overlay inside a `ComposedChart` (Bar + Line, sharing the X scale). `< 2` non-trivial days → no line.
6. **Charts use shadcn's Recharts-based Chart component** (already a settled cross-cutting decision in `NOTES.md`/`CLAUDE.md`) — `pnpm dlx shadcn@latest add chart` writes `apps/owner/src/components/ui/chart.tsx` and adds `recharts` to `apps/owner/package.json`. The chart components are thin `'use client'` SVG drawers fed server-computed props — no fetching, no loading state.
7. The dashboard stays at **`/dashboard`** (the existing `(authed)/dashboard` route) — the "Your venue" card is kept; the "Analytics arrives in #7" placeholder is replaced.

### Minor decisions settled in-plan (flag if you disagree)
- **All-time vs windowed:** every figure except the daily chart is all-time over all of the venue's events; the daily chart is the last 30 days. (See decision 1.)
- **Gender/age breakdowns rendered as charts** (a reusable horizontal-bar `BreakdownChart`) for visual cohesion with the other two charts — REQ-8 only mandates *bar charts* for the daily series and clicks-by-gender, so a plain `<dl>` list would also be conformant; going with charts.
- **`neutralInBreakdowns` and `timeZone` are parameters of the pure aggregator** with defaults `'omit'` / `'local'` — so the chosen behaviour is the default and a future change is one argument, not a rewrite.
- **Empty-state copy:** no venue → keep the "Create your venue" CTA, no analytics block; venue + 0 events → the full layout with a muted "No analytics yet — events arrive once visitors hit your published page" note and every stat = `0`, every ratio = `—`, every chart a centered "No data yet". Never an error.
- **Ratio rendering:** whole-percent (`Math.round(value*100)`%); raw counts shown as a hint so nothing is lost; `value === null` (zero denominator) → `—`.
- **No integration test** — the aggregator is pure and exhaustively unit-tested; the Prisma wrapper is ~8 lines of `findMany` + delegate; the page (3 states / layout / charts) is covered by manual verification, consistent with how #5 (`/preview`) and #3 (builder) chose for their rendering layers.
- **No Prisma migration / `CHANGELOG.md` entry** — `Event` already exists from #6; `@@index([venueId])` stays the only index (demo scale, in-memory aggregation).

## Scope

### 1. `apps/owner/src/lib/analytics.ts` — the pure aggregator (NEW; the heart of the feature)
Zero DB/I-O — takes narrowed event rows, returns a fully-computed `DashboardData`; unit-tested directly (mirrors `lib/rendered-page.ts` / `lib/slug.ts`). Uses `@mizrahitality/contracts` (`VISITOR_GENDERS`, `AGE_GROUPS`, `NEUTRAL_VISITOR_TYPE`, `allVisitorVariants`, `isVisitorType`, `isAnalyticsEventType`) so the bucket sets stay in lockstep with the contract.

```ts
export interface AnalyticsEventInput {            // an Event row narrowed to what aggregation needs
  type: string;          // expected AnalyticsEventType; unknown values defensively ignored
  visitorType: string;   // expected VisitorType; unknown values defensively ignored
  sessionId: string | null;
  createdAt: Date;
}
export interface ComputeDashboardArgs {
  events: AnalyticsEventInput[];
  now?: Date;                                     // "today"; default new Date()
  dailyWindowDays?: number;                       // default 30
  timeZone?: 'utc' | 'local';                     // default 'local'
  neutralInBreakdowns?: 'omit' | 'bucket';        // default 'omit'
}

export interface Ratio { numerator: number; denominator: number; value: number | null; } // value=null when denom 0
export interface DailyPoint { date: string; /* 'YYYY-MM-DD' */ label: string; /* 'May 3' */ visits: number; trend: number | null; }
export interface Trendline { slope: number | null; intercept: number | null; direction: 'rising' | 'falling' | 'flat' | null; }
export interface BreakdownBar { key: string; /* a VisitorGender | AgeGroup */ label: string; count: number; }
export interface SegmentRow { gender: 'male'|'female'; ageGroup: '18-30'|'31-50'|'50+'; visitors: number; clicks: number; clickRate: Ratio; }

export interface DashboardData {
  totalVisits: number; bookNowClicks: number; bookNowHovers: number;
  clickThroughRate: Ratio;          // clicks ÷ totalVisits
  hoverBeforeClickRate: Ratio;      // |clicker-sessions that also hovered| ÷ |clicker-sessions|
  daily: DailyPoint[];              // exactly `dailyWindowDays` entries ending at `now`'s day, ascending, zero-filled
  trendline: Trendline;
  visitorsByGender: BreakdownBar[]; // 2 bars (male, female) — visit events; (+neutral iff 'bucket')
  visitorsByAgeGroup: BreakdownBar[]; // 3 bars (18-30, 31-50, 50+) — visit events; (+neutral iff 'bucket')
  clicksByGender: BreakdownBar[];   // 2 bars (male, female) — book-now-click events; (+neutral iff 'bucket')
  segments: SegmentRow[];           // exactly 6 rows in allVisitorVariants()-minus-neutral order
  isEmpty: boolean;                 // events.length === 0 — drives the "no analytics yet" copy
}

export function computeDashboard(args: ComputeDashboardArgs): DashboardData;
```

**Algorithm specifics**
- Defensive guards: silently drop events failing `isAnalyticsEventType(type)` / `isVisitorType(visitorType)` (the #6 POST route already validates strictly — belt-and-braces).
- Counts: `totalVisits`/`bookNowClicks`/`bookNowHovers` = simple type counts. `clickThroughRate = { bookNowClicks, totalVisits, value: totalVisits === 0 ? null : bookNowClicks/totalVisits }`.
- `hoverBeforeClickRate`: one pass over events with non-null `sessionId` → `Map<sessionId, {hover, click}>`; `denominator` = #sessions with `click`; `numerator` = #of those with `hover` too; null-sessionId events excluded from this metric only. `value = null` when denominator 0.
- Daily series: `dayKey(createdAt, tz)` (`'utc'` → `toISOString().slice(0,10)`; `'local'` → zero-padded `getFullYear/getMonth+1/getDate` — avoid `toLocaleDateString` locale surprises). Window = the `dailyWindowDays` (30) calendar days ending at `dayKey(now)`, every day present, `visits` = #`visit` events that day, 0 if none. `label` derived from the key via `new Date(key+'T00:00:00Z')` formatted month+day in UTC. Events outside the window are not in `daily` (but still in the all-time counts).
- Trendline (OLS over `daily`'s `visits` indexed 0..n-1): compute `Σx, Σy, Σxy, Σx²`; `slope = (n·Σxy − Σx·Σy)/(n·Σx² − (Σx)²)`, `intercept = (Σy − slope·Σx)/n`. n is 30 here so always ≥ 2 → there's always a line; but keep the `< 2 → null` guard for robustness. `direction`: `slope > 1e-9` → rising, `< -1e-9` → falling, else flat. Each `DailyPoint.trend = slope·x + intercept` (don't clamp). For the (guarded) n<2 case: `slope/intercept/direction = null`, `trend = null` per point.
- Breakdowns: `splitVisitorType(vt)` → `{gender, ageGroup} | null` (null for `neutral`/unparseable; implement by matching `${g}-${a}` over `VISITOR_GENDERS`×`AGE_GROUPS`). `visitorsByGender`/`visitorsByAgeGroup` count `visit` events per bucket; `clicksByGender` counts `book-now-click` events per gender. Order from `VISITOR_GENDERS`/`AGE_GROUPS` (neutral bar appended last only if `neutralInBreakdowns === 'bucket'`). With `'omit'`, neutral `visit`/`click` events are simply not in these three arrays.
- `segments`: iterate `for g of VISITOR_GENDERS: for a of AGE_GROUPS:` (= `allVisitorVariants()` minus `neutral`); per row `visitors` = #`visit` events with `visitorType === ${g}-${a}`, `clicks` = #`book-now-click` events likewise, `clickRate = { clicks, visitors, value: visitors === 0 ? null : clicks/visitors }` → a 0-visit segment renders `—`.

### 2. `apps/owner/src/lib/dashboard-data.ts` — thin Prisma wrapper (NEW, ~8 lines)
```ts
export async function getDashboardData(venueId: string): Promise<DashboardData> {
  const events = await prisma.event.findMany({
    where: { venueId },
    select: { type: true, visitorType: true, sessionId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return computeDashboard({ events });
}
```
Keeps the query out of the page (consistent with `lib/publish.ts` etc.) and is the thing an optional integration test could drive without a request context.

### 3. `apps/owner/src/components/ui/chart.tsx` — shadcn Chart wrappers (NEW, generated)
`pnpm dlx shadcn@latest add chart` → writes the standard shadcn `ChartContainer`/`ChartStyle`/`ChartTooltip`/`ChartTooltipContent`/`ChartLegend*` file (a `'use client'` module), adds `recharts` to `apps/owner/package.json` `dependencies`, expects `--chart-1..5` CSS vars (already in `globals.css`). Then `pnpm install` (materialize `recharts` in the hoisted `node_modules`). Leave the greyscale `--chart-*` ramp as-is; optionally make the trendline use `--chart-5` (darkest) so it reads against the bars — a 0–1 line CSS tweak, not load-bearing. The generated file is clean under the repo's `no-explicit-any` ESLint; if a future shadcn release sneaks in an `any`, type it or `// eslint-disable-next-line` with a note.

### 4. `apps/owner/src/components/dashboard/*` — chart + table components (NEW dir)
All `'use client'` recharts wrappers (except `segment-table.tsx`, which is pure markup → a server component), each taking already-computed props, drawing SVG only — no fetching, no `useEffect`, no `useState`. Imported by path from the page (the repo doesn't use barrels). Use shadcn's `ChartContainer`/`ChartTooltip`/`ChartTooltipContent` and a `config satisfies ChartConfig` (avoids `any`); type any tick/label formatter params; use `ChartTooltipContent` rather than a hand-rolled tooltip (so no `any` on `payload`). Each renders a centered "No data yet" `<div>` when its series is empty/all-zero.
- `daily-visitors-chart.tsx` — `DailyVisitorsChart({ data: DailyPoint[] })`: recharts `ComposedChart` → `CartesianGrid`, `XAxis dataKey="label"` (`interval="preserveStartEnd"`, `minTickGap≈24` so 30 labels don't overlap), `YAxis allowDecimals={false}`, `ChartTooltip`, `<Bar dataKey="visits" radius={4}>` (vertical bars), `<Line dataKey="trend" dot={false} strokeWidth={2} connectNulls>` (the trendline). Fixed height ~`h-[240px]`.
- `clicks-by-gender-chart.tsx` — `ClicksByGenderChart({ data: BreakdownBar[] })`: a plain `BarChart` (vertical bars), `XAxis dataKey="label"`, `<Bar dataKey="count">`.
- `breakdown-chart.tsx` — reusable `BreakdownChart({ data: BreakdownBar[] })`: a small `BarChart layout="vertical"` (horizontal bars, label on the Y axis), `<Bar dataKey="count">`. Used for `visitorsByGender` and `visitorsByAgeGroup`.
- `segment-table.tsx` — `SegmentTable({ rows: SegmentRow[] })`: a Tailwind-styled plain `<table>` (shadcn `table` isn't installed — don't add it for this): columns *Audience* (`male · 18–30` …), *Visitors*, *Clicks*, *Click rate* (`—` when `clickRate.value === null`, else `${Math.round(value*100)}%`). Server component.
- `stat-card.tsx` (optional, or inline in the page) — `StatCard({ title, value, hint? })`: a small `<Card>` with a big number; pure markup. Plus a `fmtRatio(r: Ratio)` helper (`r.value === null ? '—' : Math.round(r.value*100)+'%'`).

### 5. `apps/owner/src/app/(authed)/dashboard/page.tsx` — rewrite (server component)
`const owner = await requireOwner();` (free — `cache()`d, the layout already called it). Three states:
- **No venue** (`owner.venue === null`) → the existing "Your venue" card with the "Create your venue" CTA; no analytics block (a single muted line "Analytics appear once you create your venue" is fine).
- **Venue** → `const data = await getDashboardData(owner.venue.id);` then render the "Your venue" card (unchanged) + an analytics `<section>`:
  - a heading row (`<h2 className="text-lg font-semibold tracking-tight">Analytics</h2>` + the "no analytics yet…" muted note when `data.isEmpty`);
  - a stat-cards row (`grid gap-4 sm:grid-cols-2 lg:grid-cols-4`): Total visits, "Book Now" clicks, "Book Now" hovers, Click-through rate (hint `${clicks} of ${visits} visits`). The hover→click % can be a 5th stat card or live in its own small card with the two relevant counts.
  - a charts grid (`grid gap-8 lg:grid-cols-2`), each chart in a `<Card>`: **Daily visitors** (`<DailyVisitorsChart data={data.daily}/>`), **"Book Now" clicks by gender** (`<ClicksByGenderChart data={data.clicksByGender}/>`), **Visitors by gender** (`<BreakdownChart data={data.visitorsByGender}/>`), **Visitors by age group** (`<BreakdownChart data={data.visitorsByAgeGroup}/>`).
  - a **Hover → click** card: `${fmtRatio(data.hoverBeforeClickRate)} of clickers hovered the button at least once (${num} of ${denom} clicker sessions).`
  - a **Conversion by audience** card wrapping `<SegmentTable rows={data.segments}/>`.
  - `data.isEmpty` ⇒ same layout, all zeros / `—` / "No data yet" — never an error (`computeDashboard([])` returns a fully-formed zeroed object).
- Page root `className="space-y-8"`; page title `text-2xl font-semibold tracking-tight` (keeps the existing "Welcome, {owner.email}" heading).

### 6. `apps/owner/src/app/(authed)/layout.tsx` — one-line width bump
`max-w-3xl` → `max-w-5xl` on the `<main>` wrapper (decision 4). Nothing else changes.

### 7. Tests — `apps/owner/src/__tests__/analytics.test.ts` (NEW; the main test)
Plain `environment: 'node'` unit test, no DB (mirrors `rendered-page.test.ts`/`validation.test.ts`). A terse event builder helper. Cases:
1. **Empty input** → all counts 0; `clickThroughRate.value === null`, `hoverBeforeClickRate.value === null`; `daily` has 30 entries all `visits: 0` ending at `now`'s day; `trendline.slope === 0` (all-zero series → flat), `direction === 'flat'`; `visitorsByGender` 2 zeroed bars, `visitorsByAgeGroup` 3, `clicksByGender` 2; `segments` exactly 6 rows, every `clickRate.value === null`; `isEmpty === true`. (If you'd rather an all-zero series report `slope: null`, decide and assert that instead — but n=30 ≥ 2 so OLS yields 0; assert 0.)
2. **A hand-reconcilable fixture** — pass an explicit `now` and `timeZone: 'utc'` for determinism; ~10–12 events spanning a few days *with a gap day*, mixing genders/ages, one `neutral` visit, sessions `a/b/c/d` plus some null-session events incl. a null-session click. Assert: `totalVisits`, `bookNowClicks`, `bookNowHovers`; `clickThroughRate` (incl. exact ratio); `hoverBeforeClickRate` (clicker sessions exclude the null-session click; numerator = those that also hovered) — **this is the case that locks "null sessionId excluded from (b) only"**; `daily` — find the entries for the active days, assert `visits` per day incl. the zero-filled gap, and that `daily.length === 30`; `trendline.slope` (pick fixture y-values so it's a clean reconcilable number) + `direction`; `visitorsByGender`/`visitorsByAgeGroup`/`clicksByGender` (default `'omit'` ⇒ the neutral visit is not a bar, so the bars sum to less than `totalVisits` — assert that gap is real); a second call with `neutralInBreakdowns: 'bucket'` ⇒ a 3rd `{key:'neutral'}` bar and the bars now sum to `totalVisits`; `segments` — 6 rows in `allVisitorVariants()`-minus-neutral order, including a `100%` row, a `0%` row (visitors > 0, clicks 0), and a `—` row (`visitors === 0` → `clickRate.value === null`).
3. **30-day window edges** — a `visit` 5 days ago and one 40 days ago: `daily.length === 30`, the 40-day-old one is *not* in `daily` but **is** in `totalVisits`; first/last `daily` entries' dates are exactly `now − 29 days` and `now`'s day.
4. **UTC bucketing** — events at `…T23:30:00Z` vs `…T00:30:00Z` next day land on consecutive `dayKey`s with `timeZone: 'utc'` (the local path is exercised implicitly via the page; don't fight the process TZ in a unit test).
5. **Defensive guards** — an event with `type: 'garbage'` and one with `visitorType: 'martian'` are ignored (counts unchanged).
No test renders the chart components (thin SVG drawers; recharts is tested upstream; the repo is `environment: 'node'` with no jsdom/RTL — consistent with the codebase). No integration test (see "minor decisions").

### 8. Docs (upkeep is part of the feature)
- **`NOTES.md`** — tick **#7** in the "Build order" table (✅ + `*(Landed — plan: plans/07-analytics-dashboard-plan.md.)*`); add an **"analytics-dashboard (#7) has landed"** block under "Open / pending" recording the 7 confirmed decisions + the in-plan minors (all-time totals vs 30-day daily chart; breakdowns-as-charts; `neutralInBreakdowns`/`timeZone` params + defaults; empty-state copy; ratio rendering; no integration test; no migration); note `recharts` + `components/ui/chart.tsx` were added and the `(authed)` layout went `max-w-3xl → max-w-5xl`; note no `@mizrahitality/contracts` change, no schema change, no customer-app change.
- **`CLAUDE.md`** — extend the "Landed so far" blockquote with a feature-#7 clause (the dashboard at `/dashboard`, server-computed by `lib/analytics.ts` `computeDashboard` → `DashboardData` via the thin `lib/dashboard-data.ts` wrapper; the 3-state page; the `'use client'` recharts wrappers in `components/dashboard/*` + `components/ui/chart.tsx`; no shared-package/contracts/schema change) and change the trailing "The dashboard (#7) and the customer site (#8) arrive with later features." → "The customer site (#8) arrives next."; in "Owner-app routes", note `(authed)/dashboard` now renders the analytics dashboard and that the `(authed)` `<main>` is `max-w-5xl`; the "Tech stack → UI" bullet's "shadcn's Chart component (Recharts) for the dashboard charts" is no longer aspirational — note `components/ui/chart.tsx` + `recharts` landed in #7.
- **`README.md`** — extend the "Status" / "Landed so far" line with the dashboard (total visits, "Book Now" hover/click counts, a daily-visitors bar chart with an OLS trendline, gender / age-group breakdowns, "Book Now" clicks by gender, click-through % and a hover→click funnel %, a per-audience conversion table — all server-computed; empty venue → zeroed/empty states); change "The dashboard and the customer site arrive with later features" → "The customer site arrives with a later feature". No change to the "REST API contract" or "Out of scope" sections.
- **`apps/owner/prisma/CHANGELOG.md`** — no entry (no schema change).

## Out of scope (respect these)
- **No A/B / experiment engine** — the dashboard reports per-segment conversion; it does not pick winners, allocate traffic, or compare variants statistically.
- **No funnels beyond hover→click** — the only funnel metric is "(b)"; no multi-step funnels, path analysis, time-on-page, scroll depth.
- **No venue selector / multi-venue** — one owner, one venue; the page reads `owner.venue` (REQ-22). No `?venueId=`.
- **No date-range picker / filtering UI** — the daily window is the computed last 30 days; no interactive range, comparison periods, or per-segment filters.
- **Chart components do zero fetching** — `'use client'` SVG drawers fed server-computed props; no `useEffect`, no client API calls, no loading skeletons, no SWR/React-Query. All aggregation is server-side in `lib/analytics.ts`.
- **No new `@mizrahitality/contracts` surface** — `DashboardData` & friends stay in `apps/owner/src/lib/analytics.ts`. The customer app is not involved.
- **No seed / demo data** — that's feature #9 (`demo-seed`). The dashboard must look right with 0 events and with whatever events exist; `curl` POSTs are how we verify here.
- **No customer-app changes** — `apps/customer/*` untouched; the events the dashboard reads come from #6's POST endpoint.
- **No Prisma migration / schema change** — `Event` already exists (#6); `@@index([venueId])` stays the only index (demo scale, in-memory aggregation).
- **No AI, no real-time/polling** — analytics is pure arithmetic; the page is SSR, reload to refresh.

## Dependencies
- Feature #6 (done) — the `Event` model (`type`/`visitorType`/`sessionId`/`createdAt`, `@@index([venueId])`, `events Event[]` on `Venue`) and the `POST …/events` endpoint that populates it; the pinned "(b) = a non-null `sessionId` with ≥1 hover and ≥1 click, order ignored; null-sessionId events excluded from (b) only" definition.
- Feature #2 (done) — `requireOwner()` / `OwnerWithVenue` (`owner.venue` hydrated); `lib/prisma.ts`; the `(authed)/layout.tsx` chrome.
- Feature #3 (done) — the `Venue` shape (`publishState`, `slug`, `name`, the image columns) the "Your venue" card already renders.
- Feature #1 (done) — `@mizrahitality/contracts` (`VISITOR_GENDERS`/`AGE_GROUPS`/`VisitorType`/`allVisitorVariants`/`isVisitorType`, `ANALYTICS_EVENT_TYPES`/`isAnalyticsEventType`); shadcn/ui wired in `apps/owner`; the `--chart-*` CSS vars in `globals.css`.
- New dep: `recharts` in `apps/owner` (added by `shadcn add chart`; ships its own types).
- **No supplied design asset** for the dashboard (the `plans/` design assets cover only the landing page / copy rules / stock images) — this ships plain Tailwind + shadcn, to be refined if/when an owner-UI design lands (REQ-11).

## Contracts additions
None. `DashboardData` and the aggregator are owner-internal (`apps/owner/src/lib/analytics.ts`) — same call already made for `lib/page-variant.ts` / `lib/rendered-page.ts`. `@mizrahitality/contracts` already carries every shared vocabulary item the dashboard needs.

## PRD requirements satisfied
- **REQ-8** (owner analytics dashboard) — fully: total visits; "Book Now" click count; "Book Now" hover count; daily-visitors vertical bar chart with a trendline; gender breakdown; age-group breakdown; "Book Now" clicks by gender (vertical bar chart); percentages (a) clicks ÷ total visitors, (b) clickers who hovered ≥ once ÷ all clickers, (c) per gender×age: clicks-from-segment ÷ visitors-from-segment; empty venue → zeroed/empty states; all aggregation server-side; chart components only draw what they're handed.
- Partial **REQ-11** (friendly owner UI) — ships plain Tailwind + shadcn (calm palette, clear hierarchy, Card-grouped); finished if/when a supplied design lands.

## Verification (end-to-end)
1. `pnpm install` (materialize `recharts` after `shadcn add chart`) → `pnpm --filter mizrahitality-owner test -- analytics` then `pnpm test` (the new `analytics.test.ts` green; full suite still green); `pnpm typecheck` (recharts types; `ChartConfig satisfies`); `pnpm lint` (`no-explicit-any` clean — generated `chart.tsx` + our chart wrappers); `pnpm build`; `pnpm format:check`.
2. `pnpm dev` → owner on `:5111`. Sign in. **No venue** → `/dashboard` shows the "Create your venue" CTA, no analytics block, no errors.
3. Create a venue in `/builder` (name + description + an image). Back to `/dashboard` → "Your venue" card + analytics in its **zeroed state**: Total visits `0`, clicks `0`, hovers `0`, click-through `—`, hover→click `—`, every chart "No data yet", the 6-row table all `—`. No errors.
4. POST a spread of events to the open API (POST isn't publish-gated — works even before publish). Replace `<slug>`:
   ```
   curl -s -XPOST localhost:5111/api/venues/<slug>/events -H 'content-type: application/json' -d '{"type":"visit","visitorType":"male-18-30","sessionId":"a"}'
   curl -s -XPOST localhost:5111/api/venues/<slug>/events -H 'content-type: application/json' -d '{"type":"book-now-hover","visitorType":"male-18-30","sessionId":"a"}'
   curl -s -XPOST localhost:5111/api/venues/<slug>/events -H 'content-type: application/json' -d '{"type":"book-now-click","visitorType":"male-18-30","sessionId":"a"}'
   curl -s -XPOST localhost:5111/api/venues/<slug>/events -H 'content-type: application/json' -d '{"type":"visit","visitorType":"female-50+","sessionId":"b"}'
   curl -s -XPOST localhost:5111/api/venues/<slug>/events -H 'content-type: application/json' -d '{"type":"visit","visitorType":"female-50+"}'
   curl -s -XPOST localhost:5111/api/venues/<slug>/events -H 'content-type: application/json' -d '{"type":"book-now-click","visitorType":"female-50+","sessionId":"b"}'
   curl -s -XPOST localhost:5111/api/venues/<slug>/events -H 'content-type: application/json' -d '{"type":"visit","visitorType":"neutral","sessionId":"c"}'
   ```
   (each → `201 {"ok":true}`). Optionally edit some rows' `createdAt` via `pnpm db:studio` to spread across days / create a gap, to see the zero-fill + a non-flat trendline.
5. Reload `/dashboard`; reconcile by hand: Total visits `4`; "Book Now" clicks `2`; hovers `1`; click-through `2/4` = `50%`; hover→click: clicker sessions `{a,b}` → denom 2, hovered `{a}` → `1/2` = `50%`; daily chart shows a bar today (+ zero-filled prior days, flat trendline if single-day); visitors by gender male `1` / female `2` (neutral visit not shown — bars sum to 3, not 4: expected); visitors by age `18-30`→1, `31-50`→0, `50+`→2; clicks by gender male `1` / female `1`; conversion table: `male-18-30` 1/1 `100%`, `male-31-50` `—`, `male-50+` `—`, `female-18-30` `—`, `female-31-50` `—`, `female-50+` 2/1 `50%`.
6. POST more events of varied types/segments, reload, watch every figure/chart update consistently; no console errors; `/dashboard` and `/builder` still look right at `max-w-5xl`; `/preview` unaffected.

## Critical files
- `apps/owner/src/lib/analytics.ts` — NEW: pure `computeDashboard` → `DashboardData`.
- `apps/owner/src/lib/dashboard-data.ts` — NEW: thin Prisma wrapper `getDashboardData(venueId)`.
- `apps/owner/src/app/(authed)/dashboard/page.tsx` — REWRITE: keep "Your venue", render the dashboard, 3 states.
- `apps/owner/src/app/(authed)/layout.tsx` — `max-w-3xl` → `max-w-5xl`.
- `apps/owner/src/components/ui/chart.tsx` — NEW (generated by `pnpm dlx shadcn@latest add chart`; also adds `recharts` to `apps/owner/package.json`).
- `apps/owner/src/components/dashboard/{daily-visitors-chart,clicks-by-gender-chart,breakdown-chart,segment-table,stat-card}.tsx` — NEW chart/table/stat components (`'use client'` except `segment-table`/`stat-card`).
- `apps/owner/src/__tests__/analytics.test.ts` — NEW: exhaustive unit tests for `computeDashboard`.
- Docs: `NOTES.md`, `CLAUDE.md`, `README.md`; new `plans/07-analytics-dashboard-plan.md`.
