'use client';

// The coral "Book Now" CTA — REQ-15/REQ-16. Rendered three times on a page: the Zone-1 hero (with
// `id="hero-cta"` so the sticky bar can watch it), the Zone-4 close, and (as `compact`) inside the
// sticky mobile bar. Hover → records a `book-now-hover` event, but only once per `(slug, visitorType)`
// per page-load (a module-level `Set` — a demo-tab switch changes `visitorType` so each variant you
// view logs one fresh hover; a hard reload resets it). Click → records a `book-now-click` (never
// deduped — every click is a real conversion signal) then opens the confirmation modal (no real
// booking). Events are tagged with the *served* visitor type and carry the session id; firing them
// is best-effort (`trackEventAction` swallows failures).

import { useCallback, useState } from 'react';
import type { AnalyticsEventType } from '@mizrahitality/contracts';
import { cn } from '@/lib/utils';
import { trackEventAction } from '@/lib/analytics-actions';
import { getSessionId } from '@/lib/session-id';
import { BookingConfirmedModal } from './booking-confirmed-modal';

/** `(slug, visitorType)` pairs we've already logged a hover for this page-load. */
const hoveredKeys = new Set<string>();

function track(slug: string, type: AnalyticsEventType, visitorType: string): void {
  void trackEventAction({ slug, type, visitorType, sessionId: getSessionId() });
}

export function BookNowButton({
  slug,
  visitorType,
  venueName,
  label,
  id,
  compact = false,
  className,
}: {
  slug: string;
  /** The variant actually being served — what events get tagged with. */
  visitorType: string;
  /** Shown in the confirmation modal. */
  venueName: string;
  label: string;
  /** Set on the hero CTA (`hero-cta`) so the sticky mobile bar can watch it scroll out of view. */
  id?: string;
  /** The slim variant used inside the sticky mobile bar. */
  compact?: boolean;
  className?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const onMouseEnter = useCallback(() => {
    const key = `${slug}|${visitorType}`;
    if (hoveredKeys.has(key)) return;
    hoveredKeys.add(key);
    track(slug, 'book-now-hover', visitorType);
  }, [slug, visitorType]);

  const onClick = useCallback(() => {
    track(slug, 'book-now-click', visitorType);
    setModalOpen(true);
  }, [slug, visitorType]);

  return (
    <>
      <button
        type="button"
        id={id}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
        className={
          compact
            ? cn(
                'rounded bg-[#E85D4A] px-6 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white shadow-lg transition-all active:scale-95',
                className,
              )
            : cn(
                'animate-pulse-glow flex min-h-[48px] min-w-[48px] w-fit items-center justify-center rounded',
                'bg-[#E85D4A] px-8 text-[14px] font-semibold uppercase tracking-[0.1em] text-white',
                'transition-all duration-300 hover:scale-[1.03]',
                className,
              )
        }
      >
        {label}
      </button>
      {modalOpen && (
        <BookingConfirmedModal venueName={venueName} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
