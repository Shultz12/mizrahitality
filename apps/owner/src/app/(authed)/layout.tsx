import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { signOutAction } from '@/lib/auth-actions';
import { Button, buttonVariants } from '@/components/ui/button';

// The security boundary for owner-only routes: every page under (authed) renders behind this.
// `requireOwner()` redirects to /sign-in when there's no valid session. Also provides the small
// authed nav (wordmark + Dashboard / Builder links + Sign out) so each page gets it for free.
export default async function AuthedLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-3">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Mizrahitality
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/dashboard" className={buttonVariants({ variant: 'ghost' })}>
              Dashboard
            </Link>
            <Link href="/builder" className={buttonVariants({ variant: 'ghost' })}>
              Builder
            </Link>
          </nav>
          <form action={signOutAction} className="ml-auto">
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-10">{children}</div>
    </div>
  );
}
