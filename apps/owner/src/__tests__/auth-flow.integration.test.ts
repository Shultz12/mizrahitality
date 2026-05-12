import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  resolveOwnerByToken,
  verifyPassword,
} from '@/lib/auth';

// Runs against the throwaway SQLite DB provisioned by vitest.global-setup.ts.

afterEach(async () => {
  await prisma.session.deleteMany();
  await prisma.owner.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createOwner(email: string, password: string) {
  return prisma.owner.create({ data: { email, passwordHash: await hashPassword(password) } });
}

async function createSessionFor(ownerId: string, opts: { expired?: boolean } = {}) {
  const token = generateSessionToken();
  const expiresAt = opts.expired
    ? new Date(Date.now() - 60_000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { tokenHash: hashSessionToken(token), ownerId, expiresAt } });
  return token;
}

describe('owner credentials', () => {
  it('stores a hash that verifies the right password and rejects a wrong one', async () => {
    await createOwner('owner1@example.com', 'password123');

    const owner = await prisma.owner.findUnique({ where: { email: 'owner1@example.com' } });
    expect(owner).not.toBeNull();
    expect(owner!.passwordHash).not.toBe('password123');
    expect(await verifyPassword('password123', owner!.passwordHash)).toBe(true);
    expect(await verifyPassword('wrongpass', owner!.passwordHash)).toBe(false);
  });
});

describe('resolveOwnerByToken', () => {
  it('resolves the owner (with venue: null) for a live session', async () => {
    const created = await createOwner('owner1@example.com', 'password123');
    const token = await createSessionFor(created.id);

    const resolved = await resolveOwnerByToken(token);
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe(created.id);
    expect(resolved!.email).toBe('owner1@example.com');
    expect(resolved!.venue).toBeNull();
  });

  it('returns null and deletes the row for an expired session', async () => {
    const created = await createOwner('owner1@example.com', 'password123');
    const token = await createSessionFor(created.id, { expired: true });

    expect(await resolveOwnerByToken(token)).toBeNull();
    expect(
      await prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) } }),
    ).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    expect(await resolveOwnerByToken(generateSessionToken())).toBeNull();
  });

  it('never resolves to a different owner — data does not leak between owners', async () => {
    const ownerA = await createOwner('owner-a@example.com', 'password123');
    const ownerB = await createOwner('owner-b@example.com', 'password456');
    const tokenForA = await createSessionFor(ownerA.id);

    const resolved = await resolveOwnerByToken(tokenForA);
    expect(resolved!.id).toBe(ownerA.id);
    expect(resolved!.id).not.toBe(ownerB.id);
    expect(resolved!.email).toBe('owner-a@example.com');
  });
});
