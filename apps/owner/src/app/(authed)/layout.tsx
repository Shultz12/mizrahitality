import type { ReactNode } from 'react';
import { requireOwner } from '@/lib/auth';

// The security boundary for owner-only routes: every page under (authed) renders behind this.
// `requireOwner()` redirects to /sign-in when there's no valid session.
export default async function AuthedLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  return <div className="mx-auto max-w-3xl px-6 py-10">{children}</div>;
}
