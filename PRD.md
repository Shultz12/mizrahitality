# PRD: Mizrahitality

**Status:** Draft
**Last Updated:** 2026-05-11
**Author:** Shultz (shultz.devops@gmail.com)

## 1. Problem Statement
Small hospitality venues — cafés, bars, guesthouses, restaurants — need a simple online presence, but their owners are frequently deeply non-technical: every extra button, setting, or "just edit the markup" is a wall. General-purpose site builders optimize for power and flexibility, the wrong trade-off for this user, so they end up with an unfinished draft, a generic template, or nothing. Even when a page exists, the owner can't see who visits or whether it drives bookings.

### Evidence
- **User signals:** Technophobic operators routinely abandon flexible builders mid-setup; "make me a one-pager" is a recurring ask precisely because the existing tools over-serve it.
- **Market signals:** Builders compete on feature breadth; nobody competes on *radical narrowness* for the hospitality micro-segment, and audience-tailored copy + built-in analytics are typically paid add-ons.
- **Business signals:** This is a job-interview project; its real success metric is the author's transition out of unemployment. (The dashboard, at least, is real.)

## 2. Solution Overview
Mizrahitality is a monorepo of two products. **Mizrahitality-owner** is a server-side-rendered builder platform: the owner signs up (email, password, venue slug), writes a rough free-text description of the venue, and uploads one photo — and that is the whole input. There is no layout editor, no rich-text editor, and no image-placement UI; the owner never composes a page. The platform polishes that description with AI (the owner approves the result), then a second AI step authors the approved copy into a fixed per-audience **template** — one page built from a Rich Text slot and an Image slot — for each visitor type (gender × age group) plus a neutral default; each template carries its own layout, styling, and per-audience copy rules (wording, tone, length, placement), with colors shared across a venue's templates. The owner's photo fills the Image slot automatically. The owner gets a published SSR page and an analytics dashboard (visits, gender/age breakdowns, daily-visitor bar chart with trendline, and a Book Now hover→click funnel). **Mizrahitality-customer** is a Next.js SSR site at `/<venue-slug>` that, per request, asks the platform's REST API for the right rendered page for the current visitor type, renders it, and reports visit/hover/click events back — authenticated by a per-venue API key. A demo tab on the customer site lets a reviewer switch visitor types live.

### Differentiation
One page, two slot types, on purpose (nothing to get wrong); the owner never touches a layout, an editor, or an image placement — they just write a description and pick a photo, and AI does the writing *and* the audience targeting, fitting the copy into pre-designed per-audience templates; SSR, audience-aware page delivery over a clean REST contract; the analytics dashboard is a first-class deliverable, not a bolt-on.

## 3. Target Users
| Persona | Role | Primary Need | Key Behavior |
|---|---|---|---|
| Venue owner | Owner/operator of a small hospitality venue; technophobic, time-poor | A working, good-looking venue page in minutes with zero technical decisions, plus visibility into whether it works | Signs up, writes a description, uploads a photo, accepts AI copy, publishes, checks the dashboard |
| Venue visitor | Prospective customer landing on a venue's public page | A fast page that speaks to them; a frictionless "I want to book" | Lands via the slug URL, reads, hovers/clicks "Book Now" |
| Mizrahitality-customer (API consumer) | The SSR visitor site acting as an API client | Stable REST contract: GET rendered page by slug + visitor type; POST analytics events | Calls the platform API on every request and event, using a per-venue API key |
| Interview reviewer | Person evaluating the project | A working end-to-end demo they can poke at, including switching visitor types, with no setup beyond a seed | Runs the apps, switches types via the demo tab, watches the dashboard react |

## 4. Goals & Success Metrics
| Goal | Metric | Baseline | Target | Window |
|---|---|---|---|---|
| Owners reach a published page | % of sign-ups that publish | 0 | ≥ 80% | 90 days |
| Fast first publish | Median time, sign-up → first publish | n/a | < 5 min | 90 days |
| AI is actually used | % owners accepting AI-enhanced description / generating variants | 0 | ≥ 70% / ≥ 70% | 90 days |
| Every audience is covered | % of the 7 visitor types with a distinct renderable variant per published venue | 0 | 100% | per release |
| Dashboard is live | Lag from event to dashboard reflection | n/a | ≤ next load | per release |
| Demo readiness | Reviewer can switch all types → distinct variants, watch metrics move, see Venue #2 fill, with only the seed run (pass/fail) | fail | pass | at interview |
| North star | Published venue pages receiving visitor traffic, weekly | 0 | grow | ongoing |

## 5. Requirements

### REQ-1: Owner sign-up (P0)
Sign-up with email, password, and a unique venue slug; on success an owner account and its first venue exist.
**Acceptance criteria:** Duplicate slug rejected with a clear message; weak/invalid email or password rejected; on success the owner is signed in and has one venue.

### REQ-2: Owner sign-in (P0)
Email + password sign-in with a persisted session; sign-out.
**Acceptance criteria:** Wrong credentials rejected; valid credentials create a session that survives reload; sign-out clears it.

### REQ-3: Per-venue API key (P0)
Each venue has an API key, generated at venue creation and shown to the owner; it is the only credential Mizrahitality-customer uses against the API.
**Acceptance criteria:** Key visible in the owner UI; API calls without a valid key for the targeted venue are rejected; key is scoped to a single venue.

### REQ-4: Description-driven site builder (P0)
The owner provides the venue page through two inputs only: a free-text venue description and one uploaded photo. The published page is a fixed template made of exactly two slot types — a Rich Text slot and an Image slot — populated by the system (AI authors the Rich Text slot; the uploaded photo fills the Image slot). There is **no** layout editor, **no** rich-text editor, **no** image-placement UI, and **no** drag-and-drop — the description and the photo are the owner's only inputs. The builder persists those inputs and the generated result and shows a preview.
**Acceptance criteria:** Owner can write/edit the description and upload/replace the photo; the page is assembled into the template's Rich Text and Image slots and no others; the owner has no other content controls; the uploaded image is stored and shown in its slot; inputs and generated content persist across sessions; preview reflects the current content.

### REQ-5: AI description enhancement (P0)
An "enhance with AI" action rewrites the owner's free-text venue description; the owner accepts the enhanced version or keeps their own.
**Acceptance criteria:** Triggering enhancement returns polished copy derived from the owner's input; owner can accept or reject; rejecting leaves the original untouched.

### REQ-6: AI audience-targeted templates (P0)
Generate one populated template per visitor type — 2 genders (male, female) × 3 age groups (18–30, 31–50, 50+) = 6, plus 1 neutral = **7**. Each template is a pre-built design asset (layout + slots + styling, with colors shared across a venue's templates and typography/weight/density/accents differing per template); the AI authors the owner's approved description into that template's Rich Text slot following the template's per-audience copy rules (wording, tone, length, placement), and emits the result as structured JSON. The owner's photo fills the Image slot. Owner can review per type and regenerate. Generation happens eagerly at publish and the 7 results are stored; no AI call is in the page-serving path.
**Acceptance criteria:** After generation, all 7 populated templates exist and their copy differs appropriately per audience; the neutral one is coherent plain copy; each populated template is structurally valid against its slot schema; regenerate produces a fresh set; publish is blocked unless all 7 exist and validate.

### REQ-7: Server-side-rendered published page (P0)
The published venue page is server-side rendered.
**Acceptance criteria:** The published page's HTML arrives fully composed in the initial server response (not assembled client-side).

### REQ-8: Owner analytics dashboard (P0)
For the selected venue: total visit count; "Book Now" click count; "Book Now" hover count; daily-visitors vertical bar chart with a trendline; visitor gender breakdown; visitor age-group breakdown; "Book Now" clicks by gender (vertical bar chart); and percentages — (a) clicks ÷ total visitors, (b) clickers who hovered ≥ once ÷ all clickers, (c) per (gender × age group): clicks from that segment ÷ visitors from that segment.
**Acceptance criteria:** Every listed figure/chart renders; numbers reconcile with recorded events; an empty venue shows zeroed/empty states without errors; switching venues re-scopes all figures.

### REQ-9: REST/JSON API for the visitor site (P0)
Authenticated by the per-venue API key: `GET` a fully-rendered page payload by venue slug + visitor type; `POST` analytics events (page visit, Book Now hover, Book Now click), each tagged with visitor type. Consumed exclusively by Mizrahitality-customer.
**Acceptance criteria:** GET returns the variant matching the requested type (neutral if unknown); POST records an event attributed to the right venue and type; bad/missing key → 401/403; unknown slug → 404.

### REQ-10: Demo seed script (P1)
A seed script creates demo Venue #1 with realistic historical analytics, and a second venue that starts empty.
**Acceptance criteria:** After running, Venue #1's dashboard shows populated multi-day data; Venue #2's dashboard is empty; live events thereafter accrue to whichever venue they target.

### REQ-11: Friendly owner-facing UI (P1)
Sign-up, sign-in, dashboard, and builder pages use a calm palette, clear hierarchy, and low cognitive load, including a venue selector when an owner has more than one venue. UI designs/files are supplied — implemented, not designed from scratch.
**Acceptance criteria:** Implemented screens match the supplied designs; basic accessibility (labels, focus order, contrast) holds; venue selector switches the active venue everywhere.

### REQ-12: Edit and re-publish (P2)
Owner can edit and re-publish an existing page and re-run AI enhancement / variant regeneration.
**Acceptance criteria:** Edits to the description (and a replaced photo) persist; re-publish updates what the API serves; regeneration replaces the variant set.

### REQ-13: SSR visitor site at /<slug> (P0)
Mizrahitality-customer is a Next.js, server-side-rendered site routed at `/<venue-slug>` (e.g. `localhost:<port>/<slug>`).
**Acceptance criteria:** Visiting the slug path yields a server-rendered page; the slug round-trips to the platform API.

### REQ-14: Render from the API per request (P0)
On each request the visitor site calls the platform API with the venue slug + current visitor type and renders the returned page payload server-side.
**Acceptance criteria:** The rendered content corresponds to the API payload for that slug + type; changing type changes the rendered content.

### REQ-15: Book Now button + confirmation (P0)
Render a "Book Now" button; clicking it records the event and shows a friendly confirmation modal/toast. No real booking backend.
**Acceptance criteria:** Click shows the confirmation; no external booking call is made; the click is reported to the API.

### REQ-16: Visitor analytics events (P0)
Fire events to the API: page visit on load; Book Now hover; Book Now click — each tagged with visitor type.
**Acceptance criteria:** A page load posts a visit; hovering Book Now posts a hover (de-duped per session as needed); clicking posts a click; all carry the active visitor type.

### REQ-17: Visitor-type demo tab (P0)
A hover-out tab pinned mid-left lets the viewer switch the active visitor type (gender + age group). Conceptually the site already "knows" the visitor; the tab exercises every variant for the reviewer.
**Acceptance criteria:** Hovering the tab reveals controls for all 2 genders × 3 age groups (plus a neutral/"unknown" option); selecting a type re-renders the page (SSR) for that type and tags subsequent events with it.

### REQ-18: Neutral fallback (P1)
An unknown or unset visitor type yields the neutral variant.
**Acceptance criteria:** With no type selected, the neutral variant renders; events are tagged accordingly (or as "unknown").

### REQ-19: Graceful errors (P2)
Unknown slug or unavailable API → a friendly error page.
**Acceptance criteria:** A bad slug shows a helpful not-found page; an API outage shows a friendly retry-later page rather than a stack trace.

### REQ-20: Monorepo (P0)
A single repository contains both products, with shared config/types where useful.
**Acceptance criteria:** Both apps build and run from the one repo; shared contract types are not duplicated by copy-paste.

### REQ-21: Documented API contract (P2)
A short document describing the GET-page and POST-events endpoints, for the reviewer.
**Acceptance criteria:** Endpoints, auth, request/response shapes, and event types are written down and match the implementation.

### REQ-22: Multiple venues per account (P1)
An owner can create additional venues under their account, each with its own slug, API key, builder page, and dashboard.
**Acceptance criteria:** Creating a venue requires a fresh unique slug and yields its own key and empty dashboard; the venue selector lists all of the owner's venues; data never leaks across venues.

## 6. Non-Goals
- **Real domains / DNS / SSL / hosting** — the "domain name" is a URL-path slug; everything runs on localhost. *Out of scope for an interview build.*
- **Real booking or payments** — "Book Now" ends at a confirmation modal. *The booking integration is out of scope.*
- **Multi-page sites / free-form layout / drag-and-drop / rich-text editing / image-placement controls** — one page, two slot types, AI-assembled into a fixed per-audience template; the owner provides only a description and a photo and never composes or styles anything. *Narrowness is the product.*
- **Teams, roles, org accounts** — an account owns venues; there's no sharing or permissions model. *Unneeded for the use case.*
- **Email verification & password reset** — sign-up is immediate; no reset flow. *Deferred; not core to the demo.*
- **Real visitor identification** — visitor type is simulated via the demo tab; how a real system infers gender/age is out of scope. *Unsolvable and unnecessary here.*
- **Analytics beyond the specified dashboard** — no A/B engine, no funnels other than hover→click. *Scope control.*
- **Authoring a design system or generating templates/styling** — UI designs, the per-audience template set, and per-template copy rules are supplied; the AI only authors copy into slots. *Implementation, not design, is in scope.*

## 7. Technical Considerations
- **Dependencies:** Anthropic Claude API (Sonnet 4.6, with prompt caching) for the two AI steps — (1) enhance the owner's description, (2) author the approved copy into each audience's template slots as structured JSON — requires an API key; low call volume. Next.js for Mizrahitality-customer. Supplied frontend UI files/designs **and the per-audience template set + per-template copy rules** from the user. A persistence layer for accounts, venues, pages, the 7 populated templates per published venue, and analytics events (store choice deferred to design).
- **Constraints:** SSR is mandatory for both the published owner page and the customer site. The two apps communicate only over the documented REST API, authenticated per-venue. Monorepo structure is required. Templates and styling are pre-designed assets, not AI-generated. The 7 variants are generated eagerly at publish and stored; no AI call sits in the page-serving request path.
- **Known Risks:** AI authored copy overflowing or underfilling a template's slot length constraints, or failing structural validation against the slot schema (need a validate-and-regenerate gate at publish); SSR-on-every-request latency from the API round-trip (mitigated by serving precomputed stored variants); reconciling the dashboard's percentage math with event de-duplication rules (e.g. counting "hovered at least once before clicking"); keeping shared contract types (visitor type enum, slot schema, API payloads) in sync across the monorepo.

## 8. Launch Phases
| Phase | Audience | Success Gate |
|---|---|---|
| Internal Alpha | Author, local only | Walking skeleton end-to-end on localhost (auth → builder → SSR published page → customer site renders it via the API); then all 7 AI-authored audience templates render distinctly and appropriately per audience. No P0 bugs. |
| Beta (dry run) | Author + a trial run-through | Analytics events flow from the customer site; the dashboard renders every chart/metric with correct math against seeded + live data; Venue #1 pre-populated, Venue #2 starts empty and fills; demo tab switches all visitor types. |
| GA (the interview) | Interview reviewer | Supplied UI implemented across owner pages; error handling for bad slug / API down; API contract documented; full reviewer walkthrough passes with no setup beyond running the seed. |

## 9. Open Questions
- **Resolved:** Variants are generated **eagerly at publish** and stored; the API serves precomputed payloads (no AI in the request path).
- **Resolved:** Styling is **fixed per template** and supplied as a pre-designed asset (not AI-generated); colors are shared across a venue's templates. The AI only authors copy into slots.
- **Resolved:** Visitor type = `male`/`female` × `18–30`/`31–50`/`50+` (6) + `neutral` = **7 variants per venue**; no "alien" type.
- **Resolved:** No drag-and-drop / manual layout / rich-text editor / image-placement UI — the owner's only inputs are the free-text description and one uploaded photo; the page is AI-assembled into a fixed template (AI authors the Rich Text slot from the description; the photo fills the Image slot).
- **Resolved:** The published page has exactly two slot types — `rich-text` and `image` (no title slot).
- Concrete **slot schema** (each slot's role and min/max length, required/optional) and the **per-template copy-rules format** the author-into-template AI step consumes — to be pinned in specs/design.
- Exact shape and inventory of the supplied UI design files **and the template set + per-template copy rules**.
- Do the two apps run as separate processes against a shared store, or fully separate with the API as the only link? Which ports?
- Is the venue slug editable after creation, or immutable? (Leaning immutable, given it's the API/URL key.)
