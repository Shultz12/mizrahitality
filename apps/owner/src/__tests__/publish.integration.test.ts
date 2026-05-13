import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { allVisitorVariants, type VisitorType } from '@mizrahitality/contracts';
import { prisma } from '@/lib/prisma';
import { runPublishPipeline } from '@/lib/publish';
import { parsePageVariantContent } from '@/lib/page-variant';
import type { OwnerWithVenue } from '@/lib/auth';
import type { GenAiClient } from '@/lib/ai';

// Exercises `runPublishPipeline` against the throwaway SQLite DB (vitest.global-setup.ts provisions
// `page_variants`) with a faked Google GenAI client + a real Owner/Venue row. Targets the pipeline
// rather than `publishAction` (a `'use server'` form action — needs a request context).

type FakePart = { text: string };
type FakeGenerateContentParams = {
  config?: { systemInstruction?: string | { parts: FakePart[] } };
};
type FakeResp = { text: string };

function textResp(text: string): FakeResp {
  return { text };
}

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

const POLISHED_DESCRIPTION = 'Polished description for tests.';

/**
 * A fake that handles both publish-time calls. The enhance step uses a plain string
 * `systemInstruction` (`ENHANCE_DESCRIPTION_PROMPT`); the per-variant copy step uses
 * `{ parts: [BASE_COPY_PROMPT, personaBlock] }`. `garbageFor` always returns un-parseable text for
 * that variant; `failEnhance` throws for the enhance call.
 */
function fakeClient(opts: { garbageFor?: VisitorType; failEnhance?: boolean } = {}): GenAiClient {
  const generateContent = vi.fn(async (params: FakeGenerateContentParams): Promise<FakeResp> => {
    if (typeof params.config?.systemInstruction === 'string') {
      if (opts.failEnhance) throw new Error('boom');
      return textResp(POLISHED_DESCRIPTION);
    }
    const variant = personaVariant(params);
    if (opts.garbageFor && variant === opts.garbageFor) return textResp('this is not json');
    return textResp(JSON.stringify(validBundleFor(variant)));
  });
  return { models: { generateContent } } as unknown as GenAiClient;
}

let ownerCounter = 0;
async function createOwnerWithVenue(
  opts: { description?: string; publishState?: string } = {},
): Promise<OwnerWithVenue> {
  ownerCounter += 1;
  const owner = await prisma.owner.create({
    data: { email: `pub${ownerCounter}-${Date.now()}@example.com`, passwordHash: 'x'.repeat(60) },
  });
  const venue = await prisma.venue.create({
    data: {
      ownerId: owner.id,
      name: 'Blue Lagoon',
      slug: `bluelagoon${ownerCounter}`,
      description:
        opts.description ?? 'A cosy place by the sea, with reliable Wi-Fi and good coffee.',
      imageKind: 'stock',
      imageValue: 'atlantis-paradise',
      publishState: opts.publishState ?? 'draft',
    },
  });
  return { ...owner, venue };
}

afterEach(async () => {
  await prisma.pageVariant.deleteMany();
  await prisma.session.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.owner.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('runPublishPipeline — happy path', () => {
  it('publishes all 7 variants, freezes slug+publishedAt, and persists the polished description', async () => {
    const owner = await createOwnerWithVenue();
    const result = await runPublishPipeline(owner, { client: fakeClient() });
    expect(result).toEqual({ ok: true });

    const rows = await prisma.pageVariant.findMany({ where: { venueId: owner.venue!.id } });
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.visitorType))).toEqual(new Set(allVisitorVariants()));
    for (const row of rows) {
      const parsed = parsePageVariantContent(row.content);
      expect(parsed.ok, row.visitorType).toBe(true);
      if (parsed.ok) {
        expect(parsed.value.schemaVersion).toBe(1);
        expect(parsed.value.copy.variant).toBe(row.visitorType);
      }
    }

    const venue = await prisma.venue.findUnique({ where: { id: owner.venue!.id } });
    expect(venue!.publishState).toBe('published');
    expect(venue!.publishedAt).not.toBeNull();
    expect(venue!.slugLockedAt).not.toBeNull();
    expect(venue!.slugLockedAt!.getTime()).toBe(venue!.publishedAt!.getTime()); // equal on a first publish
    expect(venue!.description).toBe(POLISHED_DESCRIPTION);
  });
});

describe('runPublishPipeline — failure handling', () => {
  it('one variant invalid → nothing committed, publishState reverts, variantErrors reported, description unchanged', async () => {
    const owner = await createOwnerWithVenue();
    const originalDescription = owner.venue!.description;
    const result = await runPublishPipeline(owner, {
      client: fakeClient({ garbageFor: 'female-31-50' }),
      retries: 1,
    });

    expect(result.ok).toBeUndefined();
    expect(result.error).toMatch(/Couldn't generate/);
    expect(result.variantErrors).toEqual([{ variant: 'female-31-50', errors: expect.any(Array) }]);
    expect(result.variantErrors![0]!.errors.length).toBeGreaterThan(0);

    expect(await prisma.pageVariant.count({ where: { venueId: owner.venue!.id } })).toBe(0);
    const venue = await prisma.venue.findUnique({ where: { id: owner.venue!.id } });
    expect(venue!.publishState).toBe('draft');
    expect(venue!.publishedAt).toBeNull();
    expect(venue!.description).toBe(originalDescription);
  });

  it('a failed re-publish leaves the previously-published page (and the persisted polished description) intact', async () => {
    const owner = await createOwnerWithVenue();
    expect((await runPublishPipeline(owner, { client: fakeClient() })).ok).toBe(true);
    const afterFirst = await prisma.venue.findUnique({
      where: { id: owner.venue!.id },
      include: { variants: true },
    });
    expect(afterFirst!.variants).toHaveLength(7);
    expect(afterFirst!.description).toBe(POLISHED_DESCRIPTION);
    const originalIds = new Set(afterFirst!.variants.map((v) => v.id));

    const ownerForRepublish: OwnerWithVenue = { ...owner, venue: afterFirst! };
    const result = await runPublishPipeline(ownerForRepublish, {
      client: fakeClient({ garbageFor: 'male-50+' }),
      retries: 1,
    });
    expect(result.ok).toBeUndefined();
    expect(result.variantErrors).toEqual([{ variant: 'male-50+', errors: expect.any(Array) }]);

    const afterFail = await prisma.venue.findUnique({
      where: { id: owner.venue!.id },
      include: { variants: true },
    });
    expect(afterFail!.publishState).toBe('published');
    expect(afterFail!.variants).toHaveLength(7);
    expect(new Set(afterFail!.variants.map((v) => v.id))).toEqual(originalIds);
    expect(afterFail!.description).toBe(POLISHED_DESCRIPTION);
  });

  it('AI enhancement fails → publish aborts, no state change', async () => {
    const owner = await createOwnerWithVenue();
    const originalDescription = owner.venue!.description;
    const result = await runPublishPipeline(owner, { client: fakeClient({ failEnhance: true }) });

    expect(result.ok).toBeUndefined();
    expect(result.error).toMatch(/AI service is unavailable/);
    expect(result.variantErrors).toBeUndefined();

    expect(await prisma.pageVariant.count({ where: { venueId: owner.venue!.id } })).toBe(0);
    const venue = await prisma.venue.findUnique({ where: { id: owner.venue!.id } });
    expect(venue!.publishState).toBe('draft');
    expect(venue!.publishedAt).toBeNull();
    expect(venue!.description).toBe(originalDescription);
  });

  it('blocks an empty description with no state change', async () => {
    const owner = await createOwnerWithVenue({ description: '' });
    const result = await runPublishPipeline(owner, { client: fakeClient() });
    expect(result).toEqual({ error: 'Write a venue description before publishing.' });
    expect(await prisma.pageVariant.count({ where: { venueId: owner.venue!.id } })).toBe(0);
    const venue = await prisma.venue.findUnique({ where: { id: owner.venue!.id } });
    expect(venue!.publishState).toBe('draft');
  });

  it('blocks when AI is not configured (no client) with no state change', async () => {
    const owner = await createOwnerWithVenue();
    const result = await runPublishPipeline(owner);
    expect(result).toEqual({ error: 'AI is not configured — set GOOGLE_API_KEY to publish.' });
    expect(await prisma.pageVariant.count({ where: { venueId: owner.venue!.id } })).toBe(0);
    const venue = await prisma.venue.findUnique({ where: { id: owner.venue!.id } });
    expect(venue!.publishState).toBe('draft');
  });
});
