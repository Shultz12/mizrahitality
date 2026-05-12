import type { ReactNode } from 'react';
import { Inter, Playfair_Display } from 'next/font/google';
import { cn } from '@/lib/utils';

// The `/preview` layout — a deliberately minimal shell for the published venue page. It is NOT under
// the `(authed)` route group: that layout's nav chrome would contradict the design's "zero
// navigation" rule. `/preview` is top-level (`page.tsx` calls `requireOwner()` itself) and renders
// nothing but the page. This nests inside the root `app/layout.tsx`'s `<html><body>`; the wrapper's
// `min-h-dvh bg-[#FAF7F2]` paints over the root body's white, and `pb-20 md:pb-0` keeps the sticky
// mobile bar from covering content on small screens. Headings use Playfair Display, body uses Inter
// — loaded here via `next/font/google` as the CSS vars the renderer references (`--font-playfair`,
// `--font-inter`); the inline `fontFamily: var(--font-inter)` makes Inter the body default.

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

export default function PreviewLayout({ children }: { children: ReactNode }) {
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
