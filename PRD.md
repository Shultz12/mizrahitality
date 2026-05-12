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
Mizrahitality is a monorepo of two products, kept deliberately minimal. **Mizrahitality-owner** is a server-side-rendered builder platform: the owner signs up with just an email and password, then opens the builder and provides three things — a **venue name** (English letters and spaces, no special characters; the URL slug is derived from it, lowercased with spaces removed), a rough **free-text description**, and **one image** (uploaded, or chosen from a small supplied set of stock images). That is the whole input — **one venue per owner**; there is no layout editor, no rich-text editor, and no image-placement UI; the owner never composes a page. The platform polishes the description text with AI (the owner approves the result), then a second AI step authors the approved copy into a fixed per-audience **template** — one page built from a Rich Text slot and an Image slot — for each visitor type (gender × age group) plus a neutral default; each template carries its own layout, styling, and per-audience copy rules (wording, tone, length, placement), with colors shared across the venue's templates. The chosen image fills the Image slot automatically; AI never touches the image. The owner gets a published SSR page and an analytics dashboard (visits, gender/age breakdowns, daily-visitor bar chart with trendline, and a Book Now hover→click funnel). **Mizrahitality-customer** is a Next.js SSR site at `/<venue-slug>` that, per request, asks the platform's **open** REST API for the right rendered page for the current visitor type, renders it, and reports visit/hover/click events back. The visitor type is never shown to the visitor or put in the URL — it stays server-side; a demo tab on the customer site lets a reviewer switch it live (via a cookie the server reads). The API needs no authentication because everything runs on localhost for the demo.

### Differentiation
One page, two slot types, on purpose (nothing to get wrong); the owner never touches a layout, an editor, or an image placement — they just write a description and pick a photo, and AI does the writing *and* the audience targeting, fitting the copy into pre-designed per-audience templates; SSR, audience-aware page delivery over a clean REST contract; the analytics dashboard is a first-class deliverable, not a bolt-on.

## 3. Target Users
| Persona | Role | Primary Need | Key Behavior |
|---|---|---|---|
| Venue owner | Owner/operator of a small hospitality venue; technophobic, time-poor | A working, good-looking venue page in minutes with zero technical decisions, plus visibility into whether it works | Signs up with email + password, names the venue, writes a description, picks an image (upload or stock), accepts AI copy, publishes, checks the dashboard |
| Venue visitor | Prospective customer landing on a venue's public page | A fast page that speaks to them; a frictionless "I want to book" | Lands via the slug URL, reads, hovers/clicks "Book Now" |
| Mizrahitality-customer (API consumer) | The SSR visitor site acting as an API client | Stable REST contract: GET rendered page by slug + visitor type; POST analytics events | Calls the platform's open API on every request and event (no credentials — localhost demo) |
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
Sign-up with email and password only; on success an owner account exists (no venue yet — the venue is created in the builder).
**Acceptance criteria:** Duplicate email rejected with a clear message; weak/invalid email or password rejected; on success the owner is signed in; the owner has no venue until they create one in the builder.

### REQ-2: Owner sign-in (P0)
Email + password sign-in with a persisted session; sign-out.
**Acceptance criteria:** Wrong credentials rejected; valid credentials create a session (an opaque token in an httpOnly cookie) that survives reload; sign-out clears it.

### REQ-3: Open localhost API (P0)
The owner REST API requires no authentication — no API keys, no tokens. It is consumed only by Mizrahitality-customer, and everything runs on localhost for the demo, so an auth layer would be ceremony without value here. (Trade-off recorded in `README.md` / `NOTES.md`; revisit if this ever leaves localhost.)
**Acceptance criteria:** Mizrahitality-customer can call the GET-page and POST-events endpoints with no credentials; an unknown slug returns 404; there is no API-key UI anywhere.

### REQ-4: Description-driven site builder (P0)
The owner provides the venue page through three inputs only: a **venue name** (English letters and spaces, no special characters — the URL slug is derived from it: lowercased, spaces removed, with a numeric suffix on collision), a **free-text venue description**, and **one image** — either uploaded by the owner or chosen from a small set of supplied stock images. The published page is a fixed template made of exactly two slot types — a Rich Text slot and an Image slot — populated by the system (AI authors the Rich Text slot from the description; the chosen image fills the Image slot; AI never touches the image). There is **no** layout editor, **no** rich-text editor, **no** image-placement UI, and **no** drag-and-drop. One venue per owner. The builder persists those inputs and the generated result and shows a preview.
**Acceptance criteria:** Owner can set/edit the venue name (invalid characters rejected with a clear message), write/edit the description, and either upload an image or pick a stock one (and change the choice later); the derived slug is shown to the owner; the page is assembled into the template's Rich Text and Image slots and no others; the owner has no other content controls; the chosen/uploaded image is stored and shown in its slot; inputs and generated content persist across sessions; preview reflects the current content.

### REQ-5: AI description enhancement (P0)
An "enhance with AI" action rewrites the owner's free-text venue description (text only — AI never touches the image); the owner accepts the enhanced version or keeps their own.
**Acceptance criteria:** Triggering enhancement returns polished copy derived from the owner's input; owner can accept or reject; rejecting leaves the original untouched.

### REQ-6: AI audience-targeted templates (P0)
Generate one populated template per visitor type — 2 genders (male, female) × 3 age groups (18–30, 31–50, 50+) = 6, plus 1 neutral = **7**. Each template is a pre-built design asset (layout + slots + styling, with colors shared across a venue's templates and typography/weight/density/accents differing per template); the AI authors the owner's approved description into that template's Rich Text slot following the template's per-audience copy rules (wording, tone, length, placement), and emits the result as structured JSON. The owner's chosen image fills the Image slot (AI never touches the image). Owner can review per type and regenerate. Generation happens eagerly at publish and the 7 results are stored; no AI call is in the page-serving path.
**Acceptance criteria:** After generation, all 7 populated templates exist and their copy differs appropriately per audience; the neutral one is coherent plain copy; each populated template is structurally valid against its slot schema; regenerate produces a fresh set; publish is blocked unless all 7 exist and validate.

### REQ-7: Server-side-rendered published page (P0)
The published venue page is server-side rendered.
**Acceptance criteria:** The published page's HTML arrives fully composed in the initial server response (not assembled client-side).

### REQ-8: Owner analytics dashboard (P0)
For the selected venue: total visit count; "Book Now" click count; "Book Now" hover count; daily-visitors vertical bar chart with a trendline; visitor gender breakdown; visitor age-group breakdown; "Book Now" clicks by gender (vertical bar chart); and percentages — (a) clicks ÷ total visitors, (b) clickers who hovered ≥ once ÷ all clickers, (c) per (gender × age group): clicks from that segment ÷ visitors from that segment.
**Acceptance criteria:** Every listed figure/chart renders; numbers reconcile with recorded events; an empty venue shows zeroed/empty states without errors; figures and percentages are computed server-side (the chart components only draw what they're handed).

### REQ-9: REST/JSON API for the visitor site (P0)
An open REST/JSON API (no auth — see REQ-3): `GET` a fully-rendered page payload by venue slug + visitor type; `POST` analytics events (page visit, Book Now hover, Book Now click), each tagged with visitor type. The visitor type is supplied by the customer app server-side, never via a browser-visible URL. Consumed exclusively by Mizrahitality-customer.
**Acceptance criteria:** GET returns the variant matching the requested type (neutral if unknown/absent); POST records an event attributed to the right venue and type; unknown slug → 404; no credentials are required.

### REQ-10: Demo seed script (P1)
A seed script creates demo Venue #1 with realistic historical analytics, and a second venue that starts empty.
**Acceptance criteria:** After running, Venue #1's dashboard shows populated multi-day data; Venue #2's dashboard is empty; live events thereafter accrue to whichever venue they target.

### REQ-11: Friendly owner-facing UI (P1)
Sign-up, sign-in, dashboard, and builder pages use a calm palette, clear hierarchy, and low cognitive load. UI designs/files are supplied — implemented with TailwindCSS + shadcn/ui, not designed from scratch.
**Acceptance criteria:** Implemented screens match the supplied designs; basic accessibility (labels, focus order, contrast) holds.

### REQ-12: Edit and re-publish (P2)
Owner can edit and re-publish their page and re-run AI enhancement / variant regeneration.
**Acceptance criteria:** Edits to the venue name/description (and a changed image) persist; re-publish updates what the API serves; regeneration replaces the variant set.

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
A hover-out tab pinned mid-left lets the viewer switch the active visitor type (gender + age group). Conceptually the site already "knows" the visitor — the type is never shown in the page UI or the URL; the tab is purely a reviewer aid to exercise every variant. The selection is held in a cookie the server reads on each request and passes into the API call.
**Acceptance criteria:** Hovering the tab reveals controls for all 2 genders × 3 age groups (plus a neutral/"unknown" option); selecting a type re-renders the page (SSR) for that type and tags subsequent events with it; nothing about the visitor type appears in the browser URL.

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

### REQ-22: One venue per owner (P0)
Each owner account has exactly one venue — one page, one slug, one builder page, one dashboard. No multi-venue, no venue selector: narrowness is the product, and a single venue keeps every screen unambiguous. (For the demo, "Venue #2" is simply a second owner account.)
**Acceptance criteria:** An owner creates their venue once; there is no "add another venue" affordance; all owner screens operate on that one venue with no selector; data never leaks between owners.

## 6. Non-Goals
- **Real domains / DNS / SSL / hosting** — the "domain name" is a URL-path slug; everything runs on localhost. *Out of scope for an interview build.*
- **Real booking or payments** — "Book Now" ends at a confirmation modal. *The booking integration is out of scope.*
- **Multiple venues per account / venue selector** — one venue per owner. *A single venue keeps every screen unambiguous; for the demo, a second venue is just a second account.*
- **API authentication / keys** — the owner REST API is open; it's consumed only by the customer app on localhost. *Auth would be ceremony without value at demo scope; revisit if it ever leaves localhost.*
- **Multi-page sites / free-form layout / drag-and-drop / rich-text editing / image-placement controls** — one page, two slot types, AI-assembled into a fixed per-audience template; the owner provides only a name, a description, and one image (uploaded or stock) and never composes or styles anything. *Narrowness is the product.*
- **AI image generation or editing** — the AI authors the description text into slots only; the Image slot is filled by the owner's uploaded or stock image, untouched. *Text is the AI's job here, not pixels.*
- **Teams, roles, org accounts** — an account owns its one venue; there's no sharing or permissions model. *Unneeded for the use case.*
- **Email verification & password reset** — sign-up is immediate; no reset flow. *Deferred; not core to the demo.*
- **Real visitor identification** — visitor type is simulated via the demo tab; how a real system infers gender/age is out of scope. *Unsolvable and unnecessary here.*
- **Analytics beyond the specified dashboard** — no A/B engine, no funnels other than hover→click. *Scope control.*
- **Authoring a design system or generating templates/styling** — UI designs (implemented with Tailwind + shadcn/ui), the per-audience template set, the per-template copy rules, and the stock images are supplied; the AI only authors copy into slots. *Implementation, not design, is in scope.*

## 7. Technical Considerations
- **Dependencies:** Anthropic Claude API (Sonnet 4.6, with prompt caching) for the two text-only AI steps — (1) enhance the owner's description, (2) author the approved copy into each audience's template slots as structured JSON — requires an Anthropic API key; low call volume. Next.js (App Router) for both apps; TailwindCSS + shadcn/ui (including shadcn's Recharts-based Chart component) for the owner UI. Supplied frontend UI files/designs, the per-audience template set + per-template copy rules, and a small set of stock images, from the user. Persistence: Prisma + SQLite (file-based), owned solely by the owner app — accounts, the one venue per owner, pages, the 7 populated templates per published venue, and analytics events. Cookie sessions (opaque token + a Session row); uploaded images on local disk under the owner app.
- **Constraints:** SSR is mandatory for both the published owner page and the customer site. The two apps communicate only over the documented REST API, which is **open** (no auth) — justified by the localhost-only demo scope. Monorepo structure is required. One venue per owner. Templates and styling are pre-designed assets, not AI-generated; AI touches the description text only, never the image. The 7 variants are generated eagerly at publish and stored; no AI call sits in the page-serving request path. The visitor type stays server-side — never in a browser URL.
- **Known Risks:** AI authored copy overflowing or underfilling a template's slot length constraints, or failing structural validation against the slot schema (need a validate-and-regenerate gate at publish); SSR-on-every-request latency from the API round-trip (mitigated by serving precomputed stored variants); reconciling the dashboard's percentage math with event de-duplication rules (e.g. counting "hovered at least once before clicking"); keeping shared contract types (visitor type enum, slot schema, API payloads) in sync across the monorepo.

## 8. Launch Phases
| Phase | Audience | Success Gate |
|---|---|---|
| Internal Alpha | Author, local only | Walking skeleton end-to-end on localhost (auth → builder → SSR published page → customer site renders it via the API); then all 7 AI-authored audience templates render distinctly and appropriately per audience. No P0 bugs. |
| Beta (dry run) | Author + a trial run-through | Analytics events flow from the customer site; the dashboard renders every chart/metric with correct math against seeded + live data; Venue #1 pre-populated, Venue #2 starts empty and fills; demo tab switches all visitor types. |
| GA (the interview) | Interview reviewer | Supplied UI implemented across owner pages; error handling for bad slug / API down; API contract documented; full reviewer walkthrough passes with no setup beyond running the seed. |

## 9. Open Questions
- **Resolved:** Variants are generated **eagerly at publish** and stored; the API serves precomputed payloads (no AI in the request path).
- **Resolved:** Styling is **fixed per template** and supplied as a pre-designed asset (not AI-generated); colors are shared across a venue's templates. The AI only authors copy into slots — text only, never the image.
- **Resolved:** Visitor type = `male`/`female` × `18–30`/`31–50`/`50+` (6) + `neutral` = **7 variants per venue**; no "alien" type. It is passed server-side and never exposed in a browser URL; the demo tab holds the reviewer's selection in a cookie.
- **Resolved:** No drag-and-drop / manual layout / rich-text editor / image-placement UI — the owner's inputs are a venue name, a free-text description, and one image (uploaded **or** chosen from a small supplied stock set); the page is AI-assembled into a fixed template (AI authors the Rich Text slot from the description; the chosen image fills the Image slot).
- **Resolved:** The published page has exactly two slot types — `rich-text` and `image` (no title slot).
- **Resolved:** One venue per owner; no venue selector. Sign-up is email + password only; the venue (and its slug) is created in the builder, the slug **derived from the venue name** (lowercased, spaces removed, numeric suffix on collision).
- **Resolved:** The owner REST API is **open** — no API keys/auth — given the localhost-only demo scope.
- **Resolved:** Two separate Next.js processes (owner :5111, customer :5112) talking only over the REST API — no shared store handle.
- **Resolved:** Persistence is Prisma + SQLite, owned solely by the owner app; cookie sessions; uploaded images on local disk under the owner app; owner UI built with TailwindCSS + shadcn/ui (charts: shadcn's Recharts-based Chart, fed server-computed data).
- Concrete **slot schema** (each slot's role and min/max length, required/optional) and the **per-template copy-rules format** the author-into-template AI step consumes — to be pinned when `ai-copy-and-variants` starts, once the supplied template assets land.
- Exact shape and inventory of the supplied UI design files, the per-audience template set + copy rules, and the stock images.
- Does renaming the venue re-derive the slug after first publish, or is the slug frozen at first publish? (Leaning: frozen at first publish — the customer URL shouldn't move under visitors.)
