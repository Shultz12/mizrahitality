// The coral "Book Now" CTA — used twice on the published page (Zone 1 hero + Zone 4 close), styled
// identically. INERT on feature #5: a plain `<button type="button">` with no handler. Feature #8
// wires the click → POST a `book-now-click` analytics event + open the confirmation modal (and
// hover → `book-now-hover`); feature #6 records those events server-side. Keep it a Server Component
// (no `'use client'`) until then — it has no interactivity.

import { cn } from '@/lib/utils';

export function BookNowButton({
  label,
  id,
  className,
}: {
  label: string;
  /** Set on the hero CTA so the sticky mobile bar can watch it scroll out of view. */
  id?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      className={cn(
        'animate-pulse-glow flex min-h-[48px] min-w-[48px] w-fit items-center justify-center rounded',
        'bg-[#E85D4A] px-8 text-[14px] font-semibold uppercase tracking-[0.1em] text-white',
        'transition-all duration-300 hover:scale-[1.03]',
        className,
      )}
    >
      {label}
    </button>
  );
}
