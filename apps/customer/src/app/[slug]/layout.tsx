import type { ReactNode } from 'react';
import { Inter, Playfair_Display } from 'next/font/google';
import { cn } from '@/lib/utils';

// The `/<slug>` layout — the warm shell the published venue page (and its `not-found`) render
// inside. Mirrors `apps/owner/src/app/preview/layout.tsx`: headings use Playfair Display, body uses
// Inter, loaded here via `next/font/google` as the CSS vars the renderer references
// (`--font-playfair`, `--font-inter`); `min-h-dvh bg-[#FAF7F2]` paints over the root body's white,
// and `pb-20 md:pb-0` keeps the sticky mobile bar from covering content on small screens. The root
// `app/layout.tsx` stays plain so `/` is unaffected.

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-playfair',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-inter',
});

export default function VenueLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        playfair.variable,
        inter.variable,
        'min-h-dvh bg-[#FAF7F2] text-[#2C2824] pb-20 md:pb-0',
      )}
      style={{ fontFamily: 'var(--font-inter)' }}
    >
      {children}
    </div>
  );
}
