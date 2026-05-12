// The published venue page — the "Warm Minimalist" 5-zone design from `plans/site-design/code.html`
// + `plans/site-design/DESIGN.md` + `plans/landing-page/Mizrahitality_Landing_Page_Blueprint.md`,
// translated to Tailwind-v4 React. Server Component: it composes a precomputed `RenderedPage` DTO
// (stored copy bundle + chosen image + per-variant body typography + the fixed strings) into HTML —
// no AI, no fetching. The field→zone wiring follows the table in `plans/copy-rules/_TEMPLATE-STYLING.md`
// ("Where each AI-authored field lands"): `code.html` is the visual reference, but the blueprint +
// that mapping table are authoritative for *which* field lands where (e.g. `code.html` repeats the
// Zone-1 hook in Zone 2 — the blueprint's Zone 2 is exactly the 3 story paragraphs, so we render
// only those). Colours/spacing are inlined as arbitrary values from the design tokens (no Tailwind
// theme entries); Playfair Display / Inter come from the CSS vars `app/preview/layout.tsx` sets.
//
// Out of scope here (later features): the "Book Now" buttons are inert (#8 wires the click + the
// confirmation modal; #6 records the event); no analytics; the customer site re-implements its own
// copy of this renderer in #8.

import type { RenderedPage } from '@mizrahitality/contracts';
import { BookNowButton } from './book-now-button';
import { StickyMobileBar } from './sticky-mobile-bar';

const playfair = { fontFamily: 'var(--font-playfair)' } as const;

export function PublishedPage({ page }: { page: RenderedPage }) {
  const { copy, typography } = page;

  return (
    <>
      {/* Zone 1 — Hero. Desktop: 45/55 split (text left, image right). Mobile: image full-bleed
          behind the text with a bottom→top dark gradient for contrast. */}
      <main className="relative flex min-h-screen w-full flex-col md:flex-row">
        {/* Mobile-only background image + gradient overlay (hidden on desktop, where the image is
            the right column). */}
        <div className="absolute inset-0 z-0 block md:hidden">
          {/* Plain <img>: the /uploads/* route is dynamic (next/image would need extra config),
              same call as venue-preview.tsx. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.imageUrl} alt={page.imageAlt} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141210]/80 via-[#141210]/40 to-transparent" />
        </div>

        {/* Left column — content. Full width on mobile (over the bg image), 45% on desktop (on the
            warm off-white). Text is light on mobile, charcoal on desktop. */}
        <section className="relative z-10 flex min-h-screen w-full flex-col justify-end px-6 pb-12 text-[#FAF7F2] md:w-[45%] md:justify-center md:bg-[#FAF7F2] md:px-20 md:pb-0 md:text-[#2C2824]">
          <div className="max-w-md">
            <h1
              style={playfair}
              className="mb-6 text-[40px] font-bold leading-[1.2] tracking-[-0.01em] md:text-[64px] md:leading-[1.1] md:tracking-[-0.02em]"
            >
              {page.venueName}
            </h1>
            <h2
              style={playfair}
              className="mb-8 text-[32px] font-semibold leading-[1.25] text-[#FAF7F2]/90 md:text-[48px] md:leading-[1.2] md:text-[#2C2824]/80"
            >
              {copy.tagline}
            </h2>
            <div className="mb-8 flex flex-col gap-2">
              <BookNowButton id="hero-cta" label={page.fixed.ctaLabel} />
              <p className="text-[12px] opacity-70">{copy.heroTrustPrimer}</p>
            </div>
          </div>
        </section>

        {/* Right column — hero image (desktop only; on mobile it's the bg above). */}
        <section className="relative hidden min-h-screen md:block md:w-[55%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.imageUrl} alt={page.imageAlt} className="h-full w-full object-cover" />
        </section>
      </main>

      {/* Zone 2 — The Story. White section, fade-in-up on load. Exactly three paragraphs:
          story.hook / story.detail (+ optional bullets) / story.nudge. Body type comes from the
          per-variant typography; headings keep the global Playfair scale (none in this zone). */}
      <section className="animate-fade-in-up bg-white px-6 py-[120px] md:px-20">
        <div
          className="mx-auto max-w-2xl space-y-8 text-[#2C2824]"
          style={{
            fontSize: `${typography.bodyFontSizePx}px`,
            lineHeight: typography.bodyLineHeight,
          }}
        >
          <p>{copy.story.hook}</p>
          <div className="space-y-4">
            <p>{copy.story.detail}</p>
            {copy.story.detailBullets.length > 0 && (
              <ul className="list-disc space-y-2 pl-6 marker:text-[#E85D4A]">
                {copy.story.detailBullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            )}
          </div>
          <p>{copy.story.nudge}</p>
        </div>
      </section>

      {/* Zone 3 — The Highlight Strip. Full-width band, ~10% coral tint, one Playfair (italic) line. */}
      <section className="w-full bg-[#E85D4A]/10 px-6 py-16 md:px-20">
        <div className="mx-auto max-w-[1200px] text-center">
          <p
            style={playfair}
            className="text-[24px] font-semibold italic leading-[1.3] text-[#2C2824]"
          >
            {copy.highlightStripLine}
          </p>
        </div>
      </section>

      {/* Zone 4 — The Final Close. H3 + a second "Book Now" styled like the hero CTA + a trust line. */}
      <section className="flex flex-col items-center justify-center px-6 py-[120px] text-center md:px-20">
        <h3
          style={playfair}
          className="mb-8 max-w-2xl text-[24px] font-semibold leading-[1.3] text-[#2C2824]"
        >
          {copy.closingHeading}
        </h3>
        <BookNowButton label={page.fixed.ctaLabel} className="mb-4" />
        <p className="text-[12px] text-[#2C2824]/60">{copy.closingTrustLine}</p>
      </section>

      {/* Zone 5 — The Minimal Footer. Venue name + muted "Powered by Mizrahitality". Zero links. */}
      <footer className="w-full border-t border-[#c8c7be]/20 px-6 py-8 md:px-20">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-center gap-2 text-center text-[12px] text-[#2C2824]/50 md:flex-row md:justify-between">
          <span>{page.venueName}</span>
          <span>{page.fixed.poweredBy}</span>
        </div>
      </footer>

      <StickyMobileBar venueName={page.venueName} ctaLabel={page.fixed.ctaLabel} />
    </>
  );
}
