# Product Vision: Mizrahitality

## Elevator Pitch
For independent hospitality venue owners who are intimidated by web tooling and have no time to learn it,
Mizrahitality is a landing-page platform that turns a rough description and one image (their own or a stock pick) into a fast, server-rendered venue page that quietly tailors itself to whoever is looking at it.
Unlike general-purpose website builders that drown non-technical users in options, Mizrahitality ships exactly one page — a Rich Text slot the AI writes and an Image slot the owner's chosen image fills — with no editor, no layout, and nothing to compose, and hands back a live analytics dashboard instead of a blank canvas.

> Founder's note: the deeper problem Mizrahitality solves is its author's unemployment. He is a perfectly good engineer who is, at time of writing, conspicuously between jobs — a state of affairs this project is a not-very-subtle attempt to correct. If the venue-owner story doesn't move you, consider the engineer. He has a dashboard and everything.

## Problem
Small hospitality venues — cafés, bars, guesthouses, restaurants — need a simple online presence, but their owners are often deeply non-technical: every extra button, setting, or "just edit the HTML" is a wall. Existing site builders optimize for power and flexibility, which is exactly the wrong trade-off for this user; they end up with an unfinished draft, a generic template, or nothing at all. And even when a page exists, the owner has no idea who's visiting it or whether it's actually driving bookings.

## Target Users
| User Type | Description | Primary Need |
|-----------|-------------|-------------|
| Hospitality venue owner | Owner/operator of a small venue; technophobic, time-poor; signs up with just an email and password, then names the venue (and gets a derived slug) when building | Get a working, good-looking venue page live in minutes without making any technical decisions, and see whether it's working |
| Venue page visitor | A prospective customer who lands on a venue's public page | A fast page that speaks to them and a frictionless way to express "I want to book" |
| API consumer (Mizrahitality-customer) | The server-rendered visitor-facing site that fetches rendered pages and reports visit/hover/click events back over an open localhost API | A stable REST contract: request a page by venue slug + visitor type, receive a fully-formed page; post analytics events reliably |
| Interview reviewer | The person evaluating this project | A working end-to-end demo they can poke at — including switching visitor types live — without reading a manual |

## Value Proposition
A venue owner goes from "I should probably have a website" to a published, server-rendered page — with AI-written copy, audience-tailored variants, and a populated analytics dashboard — in a single short session, without ever touching a layout, a stylesheet, or a deployment setting. The work the owner can't or won't do (writing, design, measurement) is done for them; the work they can do (describing their place, picking a photo) is all that's asked.

## Differentiation
- **One page, two slot types, on purpose** — a Rich Text slot and an Image slot. No layout engine, no component library, no rich-text editor, no image placement, no drag-and-drop, nothing to get wrong; the owner just names the venue, writes a description, and picks an image (their own or a stock one). One venue per owner — no project list to manage.
- **AI does the writing and the targeting** — the owner supplies a rough description and one image; the platform polishes the copy (owner-approved), then authors it into the Rich Text slot of a pre-designed template per visitor type (gender × age group), plus a neutral default, each tailored by that template's per-audience rules, while the owner's chosen image fills the Image slot. Templates and styling are designed up front; the AI fills the copy — text only, never the image — it doesn't invent layout or styling.
- **Server-side rendered, audience-aware delivery** — the public page is composed on the server per visitor type and served fully-formed; the visitor site is a thin SSR client over a clean (open, localhost) REST API, and the visitor type stays server-side — never in the URL.
- **The dashboard is the product, not a bolt-on** — visit counts, daily-visitor charts with trendlines, gender/age breakdowns, and "Book Now" hover→click funnel metrics are first-class, populated from real events (with a seed for the demo venue).

## Success Vision (3-5 Year Horizon)
Non-technical venue owners treat "make a page" the way they treat "make a menu" — a quick, low-stakes task with a good-looking result — and they expect that page to know its audience and report back on what it did. The two-product split (an opinionated builder + a thin SSR storefront over a documented API) becomes a template others copy: editing tools and rendering surfaces are separate, and the boring parts (copywriting, design tuning, analytics) are assumed, not optional. And, ideally, the author is gainfully employed and this paragraph is quietly embarrassing.
