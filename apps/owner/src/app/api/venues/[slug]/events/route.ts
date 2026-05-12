import { NextResponse } from 'next/server';
import {
  parseAnalyticsEventRequest,
  type AnalyticsEventResponse,
  type ApiError,
} from '@mizrahitality/contracts';
import { prisma } from '@/lib/prisma';

// `POST /api/venues/<slug>/events` — record one analytics event (`visit` | `book-now-hover` |
// `book-now-click`) against a venue. OPEN / UNAUTHENTICATED, deliberately outside `(authed)`
// (same posture as the GET sibling + `app/uploads/[...path]/route.ts`).
//
// Body: `{ type, visitorType, sessionId? }` — validated by `parseAnalyticsEventRequest`
// (`@mizrahitality/contracts`): `type` and `visitorType` strict (bad value → 400 — a bad value in
// *recorded analytics* is a real bug); `sessionId` lenient (absent/null → stored as `null`, never
// 400s on a missing one — the customer site #8 mints one, direct API/seed callers may omit it).
// Validate the body first (400 — cheap, no DB hit on garbage), then resolve the slug (404). NOT
// gated on `publishState`: records against any existing venue (dropping an event for an
// un-publishing venue is worse than recording it, and the customer only POSTs for a page it just
// rendered). Wrong HTTP method auto-405s (no handler exported). Success → 201 with `{ ok: true }`.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: 'bad_request', message: 'Request body must be JSON.' },
      { status: 400 },
    );
  }

  const parsed = parseAnalyticsEventRequest(body);
  if (!parsed.ok) {
    return NextResponse.json<ApiError>(
      { error: 'bad_request', message: parsed.message },
      { status: 400 },
    );
  }

  const venue = await prisma.venue.findUnique({ where: { slug }, select: { id: true } });
  if (!venue) {
    return NextResponse.json<ApiError>(
      { error: 'not_found', message: `No venue "${slug}".` },
      { status: 404 },
    );
  }

  await prisma.event.create({
    data: {
      venueId: venue.id,
      type: parsed.value.type,
      visitorType: parsed.value.visitorType,
      sessionId: parsed.value.sessionId,
    },
  });

  return NextResponse.json<AnalyticsEventResponse>({ ok: true }, { status: 201 });
}
