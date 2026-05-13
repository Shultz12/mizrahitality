'use server';

// Server Action behind the live-updating dashboard (`<DashboardLive>` polls this every ~0.5s).
// Mirrors what the `/dashboard` Server Component does on initial render: identifies the signed-in
// owner via the session cookie, fetches their venue's events, and returns the aggregated
// `DashboardData`. Returns `null` when the owner has no venue (the live wrapper isn't mounted in
// that state anyway, but the action stays safe either way).

import { requireOwner } from '@/lib/auth';
import { getDashboardData } from '@/lib/dashboard-data';
import type { DashboardData } from '@/lib/analytics';

export async function getLiveDashboardAction(): Promise<DashboardData | null> {
  const owner = await requireOwner();
  return owner.venue ? getDashboardData(owner.venue.id) : null;
}
