'use client';

// The friendly "you clicked Book Now" confirmation — REQ-15: a "Book Now" click records the event
// and shows a confirmation modal; there is no real booking. Plain Tailwind dialog (the customer app
// deliberately ships plain Tailwind/React, no shadcn). Backdrop + a centered warm card; Escape or a
// backdrop click closes it; the close button is focused on open; `role="dialog" aria-modal="true"`.

import { useEffect, useRef } from 'react';

export function BookingConfirmedModal({
  venueName,
  onClose,
}: {
  venueName: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#141210]/60 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-confirmed-title"
        className="w-full max-w-md rounded-lg bg-[#FAF7F2] px-8 py-10 text-center text-[#2C2824] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="booking-confirmed-title"
          style={{ fontFamily: 'var(--font-playfair)' }}
          className="mb-3 text-[28px] font-semibold leading-[1.2]"
        >
          You&rsquo;re all set ✓
        </h2>
        <p className="mb-8 text-[15px] leading-[1.6] text-[#2C2824]/75">
          This is a demo — your reservation at {venueName} isn&rsquo;t real, but the click was
          recorded.
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="min-h-[48px] rounded bg-[#E85D4A] px-8 text-[14px] font-semibold uppercase tracking-[0.1em] text-white transition-all duration-300 hover:scale-[1.03]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
