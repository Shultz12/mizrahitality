// The thin DB seam for the owner dashboard (feature #7): load a venue's `Event` rows and hand them
// to the pure `computeDashboard` aggregator. Keeps the Prisma query out of the page Server Component
// (consistent with `lib/publish.ts` etc.) and gives a request-context-free entry point a test could
// drive directly. All the real arithmetic is in `lib/analytics.ts`.

import { prisma } from './prisma';
import { computeDashboard, type DashboardData } from './analytics';

/** The fully-computed dashboard payload for one venue, over all of its recorded events. */
export async function getDashboardData(venueId: string): Promise<DashboardData> {
  const events = await prisma.event.findMany({
    where: { venueId },
    select: { type: true, visitorType: true, sessionId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return computeDashboard({ events });
}
