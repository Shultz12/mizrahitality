'use client';

// The sticky mobile conversion bar (Zone 1's mobile companion): a slim, frosted-glass bar that
// slides up and anchors to the bottom once the hero "Book Now" button scrolls out of view —
// mirrors the inline `<script>` in `plans/site-design/code.html`. Purely presentational and
// `md:hidden`. It hydrates *after* the server-rendered HTML, so it doesn't affect the REQ-7 gate
// (the page's HTML still arrives fully composed in the initial server response). Inert "Book Now",
// like `<BookNowButton>` — feature #8 wires the click.

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function StickyMobileBar({ venueName, ctaLabel }: { venueName: string; ctaLabel: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function syncVisibility() {
      const heroCta = document.getElementById('hero-cta');
      if (!heroCta) return;
      // Visible once the hero CTA has scrolled entirely above the viewport (matches code.html).
      setVisible(heroCta.getBoundingClientRect().bottom < 0);
    }
    syncVisibility();
    window.addEventListener('scroll', syncVisibility, { passive: true });
    return () => window.removeEventListener('scroll', syncVisibility);
  }, []);

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 z-[100] flex w-full items-center justify-between md:hidden',
        'border-t border-[#c8c7be]/20 bg-[#fdf8f7]/80 px-6 py-3 backdrop-blur-md',
        'transition-transform duration-300',
        visible ? 'translate-y-0' : 'translate-y-full',
      )}
    >
      <div className="text-[14px] font-semibold uppercase tracking-wider text-[#2C2824]">
        {venueName}
      </div>
      <button
        type="button"
        className="rounded bg-[#E85D4A] px-6 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white shadow-lg transition-all active:scale-95"
      >
        {ctaLabel}
      </button>
    </div>
  );
}
