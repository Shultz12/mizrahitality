import { notFound } from 'next/navigation';
import {
  RENDERED_PAGE_SCHEMA_VERSION,
  isVisitorType,
  type RenderedPage,
} from '@mizrahitality/contracts';
import { env } from '@/lib/env';
import { readVisitorType } from '@/lib/visitor-type-cookie';
import { CustomerPage } from '@/components/published-page/customer-page';
import { ServiceUnavailable } from '@/components/service-unavailable';

// The SSR public visitor page — REQ-13/14/18/19. On every request it picks the active visitor type
// (a one-shot `?type=` query — only used by owner preview links from the dashboard/builder — wins
// over the `httpOnly` `miz_visitor_type` cookie; absent/invalid both → `neutral`), asks the owner
// REST API for the matching precomputed `RenderedPage` (`GET /api/venues/<slug>/page?type=…`,
// `no-store`), and renders it server-side via `CustomerPage`. A 404 from the API → the friendly
// `not-found.tsx`; any other failure (owner down, network, unreadable body) → `<ServiceUnavailable />`
// — never a stack trace. The `?type=` doesn't write the cookie, so multiple preview tabs stay
// independent and the on-page demo tab's state is never clobbered by a preview entry. Reading
// `cookies()` already makes this route dynamic; `force-dynamic` says so plainly.

export const dynamic = 'force-dynamic';

/** Minimal structural check on the API payload — guards the renderer against a malformed body. */
function isRenderedPage(value: unknown): value is RenderedPage {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  if (p.schemaVersion !== RENDERED_PAGE_SCHEMA_VERSION) return false;
  if (typeof p.venueName !== 'string' || typeof p.imageUrl !== 'string') return false;
  if (typeof p.imageAlt !== 'string' || typeof p.visitorType !== 'string') return false;
  const copy = p.copy as Record<string, unknown> | undefined;
  if (!copy || typeof copy.tagline !== 'string' || typeof copy.heroTrustPrimer !== 'string') {
    return false;
  }
  const story = copy.story as Record<string, unknown> | undefined;
  if (!story || typeof story.hook !== 'string' || typeof story.detail !== 'string') return false;
  if (typeof story.nudge !== 'string' || !Array.isArray(story.detailBullets)) return false;
  if (typeof copy.highlightStripLine !== 'string' || typeof copy.closingHeading !== 'string') {
    return false;
  }
  if (typeof copy.closingTrustLine !== 'string') return false;
  const typography = p.typography as Record<string, unknown> | undefined;
  if (!typography || typeof typography.bodyFontSizePx !== 'number') return false;
  if (typeof typography.bodyLineHeight !== 'number') return false;
  const fixed = p.fixed as Record<string, unknown> | undefined;
  if (!fixed || typeof fixed.ctaLabel !== 'string' || typeof fixed.poweredBy !== 'string') {
    return false;
  }
  return true;
}

export default async function VenuePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { slug } = await params;
  const { type: rawType } = await searchParams;
  // A `?type=` from an owner preview link wins over the cookie — one-shot, doesn't update state.
  const urlType = Array.isArray(rawType) ? rawType[0] : rawType;
  const visitorType = isVisitorType(urlType) ? urlType : await readVisitorType();

  let res: Response;
  try {
    res = await fetch(
      `${env.OWNER_API_BASE_URL}/api/venues/${encodeURIComponent(slug)}/page?type=${encodeURIComponent(visitorType)}`,
      { cache: 'no-store' },
    );
  } catch {
    return <ServiceUnavailable />;
  }

  if (res.status === 404) notFound();
  if (!res.ok) return <ServiceUnavailable />;

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return <ServiceUnavailable />;
  }
  if (!isRenderedPage(payload)) return <ServiceUnavailable />;

  return <CustomerPage page={payload} slug={slug} />;
}
