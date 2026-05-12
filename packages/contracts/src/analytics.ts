// Analytics events the customer site posts back to the owner API, each tagged with the
// active visitor type. Event request/response DTOs are added by feature #6 (analytics-api), below.

import { isVisitorType, type VisitorType } from './visitor';

export const ANALYTICS_EVENT_TYPES = ['visit', 'book-now-hover', 'book-now-click'] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

const ANALYTICS_EVENT_TYPE_SET: ReadonlySet<string> = new Set<string>(ANALYTICS_EVENT_TYPES);

/** Type guard: is `value` one of the recorded analytics event types? */
export function isAnalyticsEventType(value: unknown): value is AnalyticsEventType {
  return typeof value === 'string' && ANALYTICS_EVENT_TYPE_SET.has(value);
}

/**
 * The body of `POST /api/venues/<slug>/events`. `sessionId` is an opaque per-browser-session
 * correlator the customer site (#8) mints and sends on every event — it powers #7's hover→click
 * funnel %. It's optional: direct API/seed callers may omit it, and the route never 400s on a
 * missing one (a clean superset of the `{ type, visitorType }` body the README sketched).
 */
export interface AnalyticsEventRequest {
  type: AnalyticsEventType;
  visitorType: VisitorType;
  sessionId?: string;
}

/** The success body of `POST /api/venues/<slug>/events` — a row was recorded. */
export interface AnalyticsEventResponse {
  ok: true;
}

/** A `POST …/events` body after validation — `sessionId` normalised to `string | null`. */
export interface ValidAnalyticsEvent {
  type: AnalyticsEventType;
  visitorType: VisitorType;
  sessionId: string | null;
}

/** Result of {@link parseAnalyticsEventRequest}. */
export type ParsedAnalyticsEventRequest =
  | { ok: true; value: ValidAnalyticsEvent }
  | { ok: false; message: string };

/**
 * Validate an untrusted `POST …/events` body. Pure, zero-dep — keeps the route handler a thin
 * shell (mirrors `parseVisitorType` living with `VisitorType` and `parsePageVariantContent` with
 * the copy types). `type` must be a known {@link AnalyticsEventType}; `visitorType` must be one of
 * the 7 {@link VisitorType} values; `sessionId` may be absent / `null` / `undefined`, or a
 * non-empty string (anything else is rejected). Each failure carries one clear `message`, used
 * verbatim as the `ApiError.message`.
 */
export function parseAnalyticsEventRequest(body: unknown): ParsedAnalyticsEventRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }
  const record = body as Record<string, unknown>;

  if (!isAnalyticsEventType(record.type)) {
    return {
      ok: false,
      message: `"type" must be one of: ${ANALYTICS_EVENT_TYPES.join(', ')}.`,
    };
  }
  if (!isVisitorType(record.visitorType)) {
    return {
      ok: false,
      message: '"visitorType" must be one of the 7 visitor types (incl. "neutral").',
    };
  }

  const rawSessionId = record.sessionId;
  let sessionId: string | null;
  if (rawSessionId === undefined || rawSessionId === null) {
    sessionId = null;
  } else if (typeof rawSessionId === 'string' && rawSessionId.length > 0) {
    sessionId = rawSessionId;
  } else {
    return { ok: false, message: '"sessionId", when present, must be a non-empty string.' };
  }

  return { ok: true, value: { type: record.type, visitorType: record.visitorType, sessionId } };
}
