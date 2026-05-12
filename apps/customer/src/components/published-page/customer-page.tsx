// The customer site's published-venue renderer — the "Warm Minimalist" 5-zone design, a faithful
// re-implementation of `apps/owner/src/components/published-page/published-page.tsx` (#5) against the
// shared `RenderedPage` DTO (the two apps talk only over the REST API + `@mizrahitality/contracts`,
// so there's no shared component — re-implementing here is intentional, per #5's notes). Server
// Component: composes the precomputed copy bundle + the chosen hero image + per-variant body
// typography + the fixed strings into HTML — no AI, no DB, no fetching here (the page route already
// fetched the DTO). The interactive bits — the "Book Now" CTA (analytics + confirmation modal), the
// sticky mobile bar, the `visit` beacon, and the mid-left demo tab — are the client/server children;
// `slug` + the served `visitorType` flow down so events get tagged correctly.

import type { RenderedPage } from '@mizrahitality/contracts';
import { BookNowButton } from './book-now-button';
import { StickyMobileBar } from './sticky-mobile-bar';
import { AnalyticsBeacon } from './analytics-beacon';
import { DemoTab } from './demo-tab';

const playfair = { fontFamily: 'var(--font-playfair)' } as const;

export function CustomerPage({ page, slug }: { page: RenderedPage; slug: string }) {
  const { copy, typography } = page;
  const cta = {
    slug,
    visitorType: page.visitorType,
    venueName: page.venueName,
    label: page.fixed.ctaLabel,
  };

  return (
    <>
      <AnalyticsBeacon slug={slug} visitorType={page.visitorType} />
      <DemoTab current={page.visitorType} />

      {/* Zone 1 — Hero. Desktop: 45/55 split (text left, image right). Mobile: image full-bleed
          behind the text with a bottom→top dark gradient for contrast. */}
      <main className="relative flex min-h-screen w-full flex-col md:flex-row">
        {/* Mobile-only background image + gradient overlay (hidden on desktop, where the image is
            the right column). Plain <img>: the cross-origin /uploads/* (or /stock/*) URL needs no
            next/image config. */}
        <div className="absolute inset-0 z-0 block md:hidden">
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
              <BookNowButton id="hero-cta" {...cta} />
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
        <BookNowButton {...cta} className="mb-4" />
        <p className="text-[12px] text-[#2C2824]/60">{copy.closingTrustLine}</p>
      </section>

      {/* Zone 5 — The Minimal Footer. Venue name + muted "Powered by Mizrahitality". Zero links. */}
      <footer className="w-full border-t border-[#c8c7be]/20 px-6 py-8 md:px-20">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-center gap-2 text-center text-[12px] text-[#2C2824]/50 md:flex-row md:justify-between">
          <span>{page.venueName}</span>
          <span>{page.fixed.poweredBy}</span>
        </div>
      </footer>

      <StickyMobileBar
        slug={slug}
        visitorType={page.visitorType}
        venueName={page.venueName}
        ctaLabel={page.fixed.ctaLabel}
      />
    </>
  );
}
