import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  allVisitorVariants,
  type AnalyticsEventType,
  type ApiError,
  type RenderedPage,
  type VisitorType,
} from '@mizrahitality/contracts';
import { prisma } from '@/lib/prisma';
import { runPublishPipeline } from '@/lib/publish';
import type { OwnerWithVenue } from '@/lib/auth';
import type { GenAiClient } from '@/lib/ai';
import { GET } from '@/app/api/venues/[slug]/page/route';
import { POST } from '@/app/api/venues/[slug]/events/route';

// Drives the two open REST route handlers directly against the throwaway SQLite DB
// (vitest.global-setup.ts's `prisma db push` auto-creates the `events` table). Reuses the
// `createOwnerWithVenue` + `fakeClient()` + `runPublishPipeline` pattern from
// publish.integration.test.ts to materialise a published venue with its 7 stored variants.
// A `Request` requires an absolute URL — naturally enforced by `new Request('http://localhost:5111/…')`.

const ORIGIN = 'http://localhost:5111';

type FakePart = { text: string };
type FakeGenerateContentParams = {
  config?: { systemInstruction?: string | { parts: FakePart[] } };
};
type FakeResp = { text: string };

function validBundleFor(variant: VisitorType) {
  return {
    variant,
    tagline: 'A genuinely calm and comfortable place to stay near everything that matters',
    heroTrustPrimer: 'Takes less than two minutes.',
    story: {
      hook: 'You want a stay that just works. This place gives you exactly that.',
      detail:
        'Comfortable rooms, a quiet setting, and an easy location make this a straightforward choice for a short trip.',
      detailBullets: [] as string[],
      nudge: 'Your dates are still open right now.',
    },
    highlightStripLine: 'Comfort, quiet, and a location that just works.',
    closingHeading: 'Your stay is waiting',
    closingTrustLine: 'Instant confirmation.',
  };
}

function personaVariant(params: FakeGenerateContentParams): VisitorType {
  const instruction = params.config?.systemInstruction;
  const personaText =
    instruction && typeof instruction === 'object' && Array.isArray(instruction.parts)
      ? (instruction.parts[1]?.text ?? '')
      : '';
  const match = personaText.match(/<!-- variant: (.+?) -->/);
  const found = match?.[1];
  return found && allVisitorVariants().includes(found as VisitorType)
    ? (found as VisitorType)
    : 'neutral';
}

function fakeClient(): GenAiClient {
  const generateContent = vi.fn(
    async (params: FakeGenerateContentParams): Promise<FakeResp> => ({
      text: JSON.stringify(validBundleFor(personaVariant(params))),
    }),
  );
  return { models: { generateContent } } as unknown as GenAiClient;
}

let ownerCounter = 0;
async function createOwnerWithVenue(): Promise<OwnerWithVenue> {
  ownerCounter += 1;
  const owner = await prisma.owner.create({
    data: { email: `ana${ownerCounter}-${Date.now()}@example.com`, passwordHash: 'x'.repeat(60) },
  });
  const venue = await prisma.venue.create({
    data: {
      ownerId: owner.id,
      name: 'Blue Lagoon',
      slug: `bluelagoon${ownerCounter}`,
      description: 'A cosy place by the sea, with reliable Wi-Fi and good coffee.',
      imageKind: 'stock',
      imageValue: 'atlantis-paradise',
      publishState: 'draft',
    },
  });
  return { ...owner, venue };
}

/** A published venue with its 7 stored variants — returns its slug. */
async function publishedVenue(): Promise<string> {
  const owner = await createOwnerWithVenue();
  // The seeded venue has no `enhancedDescription`; pass `allowWithoutEnhanced: true` so the
  // pipeline uses the typed description as-is (post-#9 separate Enhance step).
  const result = await runPublishPipeline(owner, {
    client: fakeClient(),
    allowWithoutEnhanced: true,
  });
  expect(result).toEqual({ ok: true });
  return owner.venue!.slug;
}

function getPage(slug: string, type?: string): Promise<Response> {
  const qs = type === undefined ? '' : `?type=${encodeURIComponent(type)}`;
  return GET(new Request(`${ORIGIN}/api/venues/${slug}/page${qs}`), {
    params: Promise.resolve({ slug }),
  });
}

function postEvent(slug: string, body: unknown, raw = false): Promise<Response> {
  return POST(
    new Request(`${ORIGIN}/api/venues/${slug}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

afterEach(async () => {
  await prisma.event.deleteMany();
  await prisma.pageVariant.deleteMany();
  await prisma.session.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.owner.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/venues/[slug]/page', () => {
  it('unknown slug → 404 with an ApiError body', async () => {
    const res = await getPage('does-not-exist');
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiError;
    expect(body.error).toBe('not_found');
    expect(typeof body.message).toBe('string');
  });

  it('a venue that exists but is not published → 404', async () => {
    const owner = await createOwnerWithVenue();
    const res = await getPage(owner.venue!.slug);
    expect(res.status).toBe(404);
  });

  it('published venue, no ?type → 200 neutral with an absolute imageUrl and the fixed strings', async () => {
    const slug = await publishedVenue();
    const res = await getPage(slug);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as RenderedPage;
    expect(body.schemaVersion).toBe(1);
    expect(body.visitorType).toBe('neutral');
    expect(body.slug).toBe(slug);
    expect(body.imageUrl.startsWith('http://localhost')).toBe(true);
    expect(body.fixed.ctaLabel).toBe('Book Now');
    expect(body.copy).toBeTruthy();
    expect(body.copy.variant).toBe('neutral');
  });

  it('?type=female-18-30 → 200 with that variant', async () => {
    const slug = await publishedVenue();
    const res = await getPage(slug, 'female-18-30');
    expect(res.status).toBe(200);
    const body = (await res.json()) as RenderedPage;
    expect(body.visitorType).toBe('female-18-30');
    expect(body.copy.variant).toBe('female-18-30');
  });

  it('?type=50%2B-style values decode and select that variant', async () => {
    const slug = await publishedVenue();
    const res = await getPage(slug, 'male-50+');
    expect(res.status).toBe(200);
    const body = (await res.json()) as RenderedPage;
    expect(body.visitorType).toBe('male-50+');
  });

  it('?type=garbage → 200 neutral (lenient fallback)', async () => {
    const slug = await publishedVenue();
    const res = await getPage(slug, 'garbage');
    expect(res.status).toBe(200);
    const body = (await res.json()) as RenderedPage;
    expect(body.visitorType).toBe('neutral');
  });
});

describe('POST /api/venues/[slug]/events', () => {
  it('unknown slug → 404', async () => {
    const res = await postEvent('does-not-exist', { type: 'visit', visitorType: 'neutral' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiError;
    expect(body.error).toBe('not_found');
  });

  it('valid event with a sessionId → 201 and a stored row', async () => {
    const slug = await publishedVenue();
    const res = await postEvent(slug, { type: 'visit', visitorType: 'neutral', sessionId: 's1' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });

    const venue = await prisma.venue.findUnique({ where: { slug } });
    const rows = await prisma.event.findMany({ where: { venueId: venue!.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'visit',
      visitorType: 'neutral',
      sessionId: 's1',
    });
  });

  it('valid event without a sessionId → 201 and the row stores sessionId === null', async () => {
    const slug = await publishedVenue();
    const res = await postEvent(slug, { type: 'book-now-hover', visitorType: 'female-31-50' });
    expect(res.status).toBe(201);

    const venue = await prisma.venue.findUnique({ where: { slug } });
    const rows = await prisma.event.findMany({ where: { venueId: venue!.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sessionId).toBeNull();
  });

  it('records a book-now-click for the 50+ age group end-to-end', async () => {
    const slug = await publishedVenue();
    const type: AnalyticsEventType = 'book-now-click';
    const res = await postEvent(slug, { type, visitorType: 'male-50+', sessionId: 's2' });
    expect(res.status).toBe(201);

    const venue = await prisma.venue.findUnique({ where: { slug } });
    const rows = await prisma.event.findMany({ where: { venueId: venue!.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'book-now-click',
      visitorType: 'male-50+',
      sessionId: 's2',
    });
  });

  it('records against an existing venue regardless of publish state (not gated)', async () => {
    const owner = await createOwnerWithVenue(); // never published — still draft
    const res = await postEvent(owner.venue!.slug, { type: 'visit', visitorType: 'neutral' });
    expect(res.status).toBe(201);
    expect(await prisma.event.count({ where: { venueId: owner.venue!.id } })).toBe(1);
  });

  it('malformed JSON body → 400 bad_request', async () => {
    const slug = await publishedVenue();
    const res = await postEvent(slug, 'not json', true);
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiError;
    expect(body.error).toBe('bad_request');
  });

  it('non-object JSON body → 400', async () => {
    const slug = await publishedVenue();
    const res = await postEvent(slug, '"hello"', true);
    expect(res.status).toBe(400);
  });

  it('bad event type → 400', async () => {
    const slug = await publishedVenue();
    const res = await postEvent(slug, { type: 'foo', visitorType: 'neutral' });
    expect(res.status).toBe(400);
  });

  it('bad visitorType → 400', async () => {
    const slug = await publishedVenue();
    const res = await postEvent(slug, { type: 'visit', visitorType: 'martian' });
    expect(res.status).toBe(400);
  });

  it('does not record a row on a 400', async () => {
    const slug = await publishedVenue();
    await postEvent(slug, { type: 'foo', visitorType: 'neutral' });
    const venue = await prisma.venue.findUnique({ where: { slug } });
    expect(await prisma.event.count({ where: { venueId: venue!.id } })).toBe(0);
  });
});
