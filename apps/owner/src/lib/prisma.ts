import { PrismaClient } from '@prisma/client';
import { env } from './env';

// Single PrismaClient instance, cached on globalThis in dev so HMR doesn't leak connections.
// The owner app is the sole owner of the database — the customer app never imports this.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
