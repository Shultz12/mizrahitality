'use server';

// The single analytics conduit for the customer app: a Server Action the client beacon / Book Now
// button call, which `fetch`es the owner REST API's `POST /api/venues/<slug>/events` (#6). Keeping
// it a Server Action — not a customer `/api/*` route — means same-origin from the browser (no CORS,
// owner app untouched) and `OWNER_API_BASE_URL` stays server-only; it matches the repo's
// "Server Actions, not route handlers" convention. Analytics is best-effort: any failure (owner
// down, bad slug, network) is swallowed — it must never surface to the visitor.

import { isAnalyticsEventType, isVisitorType } from '@mizrahitality/contracts';
import { env } from './env';

export interface TrackEventInput {
  slug: string;
  type: string;
  visitorType: string;
  sessionId?: string | null;
}

export async function trackEventAction(input: TrackEventInput): Promise<void> {
  const { slug, type, visitorType, sessionId } = input;
  // Cheap client-supplied-arg guard — the owner API validates too, but no point firing junk.
  if (!slug || !isAnalyticsEventType(type) || !isVisitorType(visitorType)) return;

  try {
    await fetch(`${env.OWNER_API_BASE_URL}/api/venues/${encodeURIComponent(slug)}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, visitorType, sessionId: sessionId ?? undefined }),
      cache: 'no-store',
    });
  } catch {
    // Best-effort — swallow.
  }
}
