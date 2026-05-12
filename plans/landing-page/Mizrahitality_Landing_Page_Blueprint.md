# The Ultimate Mizrahitality Blueprint

This is the definitive, high-conversion landing page structure engineered specifically for the Mizrahitality monorepo architecture. The layout, colors, and behavior are fixed hardcoded elements. The AI only injects the text based on the target audience variant.

## 1. Global Architecture & UI Constraints

* **The Single Visual Asset:** Exactly one high-quality image per page. No carousels, no background noise.
* **Zero Navigation:** No top menu, no footer links, no social icons. Every outbound link is a conversion leak.
* **Mobile-First SSR:** The page utilizes Server-Side Rendering (SSR) and aggressive image compression to ensure sub-1.5-second load times.
* **Typography:** Playfair Display (Weight 600-700) for all headings to signal editorial luxury. Inter for highly legible, scannable body text and UI elements.
* **Color Psychology (60-30-10 Rule):**
    * **60% Background:** Warm off-white (`#FAF7F2`) or dark mode (`#141210`) for visual comfort.
    * **30% Typography:** Warm charcoal (`#2C2824`) for high-contrast legibility.
    * **10% The CTA:** Warm Coral (`#E85D4A`). This must be the *only* highly saturated element on the page to hijack visual attention.

## 2. The 5-Zone Conversion Structure

### Zone 1: The Hero (Above the Fold)
* **Layout:** 45/55 split on desktop (Text Left, Image Right to match Z-pattern scanning). On mobile, the image becomes a full-bleed background with a bottom-to-top dark gradient overlay (approx. 60% opacity) for text contrast.
* **H1 (Venue Name):** Top-left, maximum 10 words, bold font weight.
* **H2 (Tagline):** Directly beneath. Strictly 10–20 words. AI-tailored to the audience's "Dream Outcome."
* **Primary CTA ("Book Now"):** Massive button (minimum 48x48px for touch targets). Features a subtle CSS-only pulse-glow micro-animation. Scales to 1.03x on hover.
* **Trust Primer:** A single line of micro-copy directly under the CTA (e.g., "Takes less than 2 minutes" or "Free to reserve").

### Zone 2: The Story (The Rich Text Slot)
The AI must generate exactly three paragraphs, written in an active voice at an 8th-grade reading level. Text triggers a subtle fade-in-up animation on scroll.
* **Paragraph 1 (The Hook):** 2-3 sentences. Acknowledges the specific audience variant's desires.
* **Paragraph 2 (The Details/Solution):** Explains what makes the venue special. *Allowed to use 3-4 short bullet points* for maximum scannability.
* **Paragraph 3 (The Nudge):** 1-2 sentences. An audience-specific emotional appeal to drive action.

### Zone 3: The Highlight Strip ("The X-Factor")
* **Design:** A full-width callout band utilizing a 10-15% opacity tint of the Warm Coral accent color to act as a visual speed-bump.
* **Content:** A single, AI-authored punchy line set in Playfair Display (optionally italicized). Acts as social proof or an emotional peak to re-engage passive scrollers.

### Zone 4: The Final Close
* **H3 Sub-header:** A short, clear statement (e.g., "Your table is waiting").
* **Closing CTA:** A duplicated "Book Now" button, styled exactly like the Hero CTA.
* **Secondary Trust Line:** A final friction-reducer (e.g., "Instant confirmation").

### Zone 5: The Minimal Footer
* **Content:** Venue name and muted "Powered by Mizrahitality" text. Absolutely zero clickable links.

## 3. Mobile-Specific Behaviors

* **Sticky Bottom CTA:** When the Hero CTA scrolls out of view, a slim, frosted-glass bar (`backdrop-filter: blur(12px)`) slides up and anchors to the bottom. It contains the Venue Name (left) and a condensed "Book Now" button (right).
* **Anti-Zoom Typography:** All body text must have a strict minimum of 16px to prevent iOS auto-zooming.
