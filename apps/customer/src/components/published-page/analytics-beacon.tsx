'use client';

// Fires the `visit` analytics event (REQ-16) — client-side on mount and again whenever the served
// `visitorType` changes (i.e. after a demo-tab switch SSR re-render). A `useRef` "last-sent" guard
// makes it fire exactly once per variant view, so React's dev-only StrictMode double-invoke doesn't
// double-count. Server-side firing is deliberately avoided (side-effect-in-render, and it can't
// carry the per-browser `sessionId`). Reloads counting as fresh visits is intended. Renders nothing.

import { useEffect, useRef } from 'react';
import { trackEventAction } from '@/lib/analytics-actions';
import { getSessionId } from '@/lib/session-id';

export function AnalyticsBeacon({ slug, visitorType }: { slug: string; visitorType: string }) {
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (lastSent.current === visitorType) return;
    lastSent.current = visitorType;
    void trackEventAction({ slug, type: 'visit', visitorType, sessionId: getSessionId() });
  }, [slug, visitorType]);

  return null;
}
