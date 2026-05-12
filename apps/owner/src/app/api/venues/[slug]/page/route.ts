import { NextResponse } from 'next/server';
import { parseVisitorType, type ApiError } from '@mizrahitality/contracts';
import { prisma } from '@/lib/prisma';
import { buildRenderedPage } from '@/lib/rendered-page';

// `GET /api/venues/<slug>/page?type=<visitor-type>` — the precomputed `RenderedPage` payload for
// one venue + one visitor type. OPEN / UNAUTHENTICATED, deliberately outside `(authed)` (same
// posture as `app/uploads/[...path]/route.ts`); these handlers only need `prisma`, not `lib/auth`.
//
// Unknown slug — or a venue that isn't `published` — → 404 (never leaks unpublished content over
// the open API; mirrors `app/preview/page.tsx`'s check). Unknown/absent `?type` → `neutral`
// (`parseVisitorType` coerces; `searchParams.get` already URL-decodes, so `?type=female-50%2B`
// arrives as `female-50+`). NO AI here — the 7 variants were generated at publish (#4); this
// reuses `lib/rendered-page.ts`'s `buildRenderedPage` (#5), passing `baseUrl = req origin` so
// `imageUrl` comes out absolute (the customer's `<img>` loads `/uploads/…` from this same origin;
// a reverse-proxied deploy would want an env override — out of scope, there's no proxy here).
// Reading `req.url` makes the handler dynamic — no stale-render risk. `Cache-Control: no-store`:
// the customer SSR (#8) re-fetches per request to pick up the cookie-selected visitor type.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const requestedType = parseVisitorType(url.searchParams.get('type'));

  const venue = await prisma.venue.findUnique({ where: { slug }, include: { variants: true } });
  if (!venue || venue.publishState !== 'published') {
    return NextResponse.json<ApiError>(
      { error: 'not_found', message: `No published page for venue "${slug}".` },
      { status: 404 },
    );
  }

  const built = buildRenderedPage({
    venue,
    variants: venue.variants,
    requestedType,
    baseUrl: url.origin,
  });
  if (!built.ok) {
    return NextResponse.json<ApiError>(
      { error: 'not_found', message: built.error },
      { status: 404 },
    );
  }

  return NextResponse.json(built.value, { headers: { 'Cache-Control': 'no-store' } });
}
