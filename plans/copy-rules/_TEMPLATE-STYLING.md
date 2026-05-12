# Template Styling — hardcoded, per template per customer type

This file holds the layer that is **baked into the page template**, not sent to Claude.
Claude only writes words (see `_BASE-PROMPT.md` + the `*_Rules.md` persona files); the
typography, spacing, colour, layout, animation, image placement, and the fixed strings
("Book Now", "Powered by Mizrahitality") all come from here / from the design assets.

There is **one template per customer type** (7 variants — the same 7 as
`@mizrahitality/contracts` `allVisitorVariants()`). All 7 share the global design system
and the 5-zone layout below; they differ only in the **body-text typography block**.

---

## Global layer — identical for all 7 templates

Source of truth (do not duplicate values — read these):

- `plans/site-design/DESIGN.md` — the "Warm Minimalist System": colour tokens, the heading
  type scale (Playfair Display 600–700), `body-lg` / `body-md` (Inter), radii, spacing
  (`container-max` 1200px, mobile/desktop margins, gutter, `section-gap` 120px).
- `plans/landing-page/Mizrahitality_Landing_Page_Blueprint.md` — the 5-zone conversion
  structure, the 45/55 hero split, the CSS-only pulse-glow CTA, scroll fade-ins, the
  highlight-strip 10–15% coral tint, the sticky mobile bottom CTA, the minimal footer.

Invariants worth restating here because Claude must never touch them:

- **Headings:** Playfair Display, weight 600–700. **Body & UI:** Inter.
- **Colour (60-30-10):** 60% warm off-white `#FAF7F2` (or dark `#141210`), 30% warm
  charcoal `#2C2824`, 10% warm coral `#E85D4A` — coral is the *only* highly-saturated colour
  and is reserved for the CTA / the highlight-strip tint.
- **One hero image per page.** AI never sees or describes it; it fills the Image slot
  deterministically from the owner's chosen/uploaded image.
- **Fixed strings:** the primary and closing CTA both read **"Book Now"**; the footer reads
  the venue name + muted **"Powered by Mizrahitality"**. None of these are AI-generated.
- **Zero navigation:** no top menu, no footer links, no social icons.
- **Mobile minimum body size: 16px** (anti-iOS-zoom) — so no per-variant rule may drop body
  text below 16px on mobile.
- **Measure (line length):** body text constrained to **45–75 characters** per line.

### Where each AI-authored field lands (so the template wiring is unambiguous)

| Copy-bundle field (from Claude) | Zone | Element |
|---|---|---|
| `VENUE_NAME` *(owner input, not AI)* | 1 | H1 |
| `tagline` | 1 | H2 under H1 |
| *(fixed)* "Book Now" | 1 | primary CTA button |
| `heroTrustPrimer` | 1 | micro-copy under the CTA |
| `story.hook` | 2 | paragraph 1 |
| `story.detail` + `story.detailBullets` | 2 | paragraph 2 (prose + optional `<ul>`) |
| `story.nudge` | 2 | paragraph 3 |
| `highlightStripLine` | 3 | the highlight band line (Playfair Display, may be italic) |
| `closingHeading` | 4 | H3 |
| *(fixed)* "Book Now" | 4 | closing CTA button (styled like the hero CTA) |
| `closingTrustLine` | 4 | micro-copy under the closing CTA |
| venue name + *(fixed)* "Powered by Mizrahitality" | 5 | footer |

---

## Per-customer-type layer — the body-text typography block

Only the body type scale changes between templates. Headings, colours, layout, and animation
are the global layer above. (`16–18px` / `1.5–2.0` ranges mean "pick within this range when
tuning the template"; whatever is picked must respect the 16px mobile minimum.)

| Template (customer type) | Variant id | Body font-size | Body line-height | Rationale |
|---|---|---|---|---|
| Male, 18–30 — Digital-Native Pragmatist | `male-18-30` | 16px | 1.5 | Standard scannable body for 18–50. |
| Female, 18–30 — Authentic Experiencer | `female-18-30` | 16px | 1.5 | Standard scannable body for 18–50. |
| Male, 31–50 — Efficiency Seeker | `male-31-50` | 16–18px | 1.5 | Standard 18–50, nudged up for comfortable scanning. |
| Female, 31–50 — Detail-Oriented Planner | `female-31-50` | 16–18px | 1.5 | Standard 18–50, nudged up for comfortable scanning. |
| Male, 50+ — Traditional Value-Seeker | `male-50+` | 18–20px | 1.5–2.0 | Larger type reads faster with better comprehension for older adults (presbyopia); extra leading prevents visual crowding. |
| Female, 50+ — Comfort & Security Prioritiser | `female-50+` | 18–20px | 1.5–2.0 | Same as above — accessibility-first body type. |
| Neutral (Default) — Universal Baseline | `neutral` | 18px | 1.5 | The safest bridge between younger and older readers. |

Everything else about each of the 7 templates is the global layer — no other per-variant
styling differences exist.
