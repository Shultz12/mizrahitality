import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { deriveSlugBase, nextAvailableSlug } from '@/lib/slug';

// Exercises the persistence layer the builder Server Actions drive, without invoking the actions
// themselves (which need a request context for `cookies()`). Runs against the throwaway SQLite DB
// provisioned by vitest.global-setup.ts.

let ownerCounter = 0;
async function createOwner() {
  ownerCounter += 1;
  return prisma.owner.create({
    data: { email: `owner${ownerCounter}-${Date.now()}@example.com`, passwordHash: 'x'.repeat(60) },
  });
}

/** Mirrors `builder-actions.ts`'s `slugTakenInDb` probe. */
function slugTakenInDb(exceptId?: string) {
  return async (slug: string) => {
    const hit = await prisma.venue.findUnique({ where: { slug }, select: { id: true } });
    return hit !== null && hit.id !== exceptId;
  };
}

function isUniqueSlugViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

afterEach(async () => {
  await prisma.pageVariant.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.session.deleteMany();
  await prisma.owner.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('venue persistence', () => {
  it('round-trips name/slug/description/image and defaults publishState to draft', async () => {
    const owner = await createOwner();
    const slug = await nextAvailableSlug(deriveSlugBase('Blue Lagoon'), slugTakenInDb());
    await prisma.venue.create({
      data: {
        ownerId: owner.id,
        name: 'Blue Lagoon',
        slug,
        description: 'A cosy place by the sea.',
        imageKind: 'stock',
        imageValue: 'atlantis-paradise',
      },
    });

    const reread = await prisma.owner.findUnique({
      where: { id: owner.id },
      include: { venue: true },
    });
    expect(reread!.venue).toMatchObject({
      name: 'Blue Lagoon',
      slug: 'bluelagoon',
      description: 'A cosy place by the sea.',
      imageKind: 'stock',
      imageValue: 'atlantis-paradise',
      publishState: 'draft',
      slugLockedAt: null,
      publishedAt: null,
    });
  });
});

describe('slug collision', () => {
  it('a second venue with the same name gets a numeric suffix; a direct duplicate slug throws P2002', async () => {
    const a = await createOwner();
    await prisma.venue.create({
      data: {
        ownerId: a.id,
        name: 'Cafe',
        slug: 'cafe',
        description: '',
        imageKind: 'stock',
        imageValue: 'burj-al-arab',
      },
    });

    const b = await createOwner();
    const slugForB = await nextAvailableSlug(deriveSlugBase('Cafe'), slugTakenInDb());
    expect(slugForB).toBe('cafe2');
    await prisma.venue.create({
      data: {
        ownerId: b.id,
        name: 'Cafe',
        slug: slugForB,
        description: '',
        imageKind: 'stock',
        imageValue: 'burj-al-arab',
      },
    });

    const c = await createOwner();
    let threw: unknown;
    try {
      await prisma.venue.create({
        data: {
          ownerId: c.id,
          name: 'Cafe',
          slug: 'cafe',
          description: '',
          imageKind: 'stock',
          imageValue: 'burj-al-arab',
        },
      });
    } catch (err) {
      threw = err;
    }
    expect(isUniqueSlugViolation(threw)).toBe(true);
  });
});

describe('image-kind switching', () => {
  it('updates from stock → upload → a different stock id', async () => {
    const owner = await createOwner();
    const venue = await prisma.venue.create({
      data: {
        ownerId: owner.id,
        name: 'Harbor House',
        slug: 'harborhouse',
        description: '',
        imageKind: 'stock',
        imageValue: 'atlantis-paradise',
      },
    });

    await prisma.venue.update({
      where: { id: venue.id },
      data: { imageKind: 'upload', imageValue: `venues/${venue.id}/abc123.jpg` },
    });
    expect((await prisma.venue.findUnique({ where: { id: venue.id } }))!).toMatchObject({
      imageKind: 'upload',
      imageValue: `venues/${venue.id}/abc123.jpg`,
    });

    await prisma.venue.update({
      where: { id: venue.id },
      data: { imageKind: 'stock', imageValue: 'mardan-palace' },
    });
    expect((await prisma.venue.findUnique({ where: { id: venue.id } }))!).toMatchObject({
      imageKind: 'stock',
      imageValue: 'mardan-palace',
    });
  });
});

describe('publish stub', () => {
  it('marks the venue published, freezes the slug, and leaves page_variants empty', async () => {
    const owner = await createOwner();
    const venue = await prisma.venue.create({
      data: {
        ownerId: owner.id,
        name: 'Sunset Bar',
        slug: 'sunsetbar',
        description: '',
        imageKind: 'stock',
        imageValue: 'burj-al-arab',
      },
    });

    // slugLockedAt is null → a rename would re-derive (this branch is exercised in the action).
    expect(venue.slugLockedAt).toBeNull();

    const lockedAt = new Date();
    await prisma.venue.update({
      where: { id: venue.id },
      data: { publishState: 'published', publishedAt: lockedAt, slugLockedAt: lockedAt },
    });

    const reread = await prisma.venue.findUnique({ where: { id: venue.id } });
    expect(reread!.publishState).toBe('published');
    expect(reread!.publishedAt).not.toBeNull();
    expect(reread!.slugLockedAt).not.toBeNull();
    // Re-publish keeps the original lock (mirrors `slugLockedAt ?? new Date()` in publishAction).
    const keptLock = reread!.slugLockedAt ?? new Date();
    expect(keptLock.getTime()).toBe(lockedAt.getTime());

    expect(await prisma.pageVariant.count()).toBe(0);
  });
});

describe('no leak between owners', () => {
  it('an owner query never returns another owner’s venue', async () => {
    const a = await createOwner();
    await prisma.venue.create({
      data: {
        ownerId: a.id,
        name: 'Alpha',
        slug: 'alpha',
        description: '',
        imageKind: 'stock',
        imageValue: 'atlantis-paradise',
      },
    });
    const b = await createOwner();
    await prisma.venue.create({
      data: {
        ownerId: b.id,
        name: 'Beta',
        slug: 'beta',
        description: '',
        imageKind: 'stock',
        imageValue: 'mardan-palace',
      },
    });

    const bWithVenue = await prisma.owner.findUnique({
      where: { id: b.id },
      include: { venue: true },
    });
    expect(bWithVenue!.venue!.name).toBe('Beta');
    expect(bWithVenue!.venue!.ownerId).toBe(b.id);
  });
});
