import type { ReactNode } from 'react';
import { requireOwner } from '@/lib/auth';
import { signOutAction } from '@/lib/auth-actions';
import { Button } from '@/components/ui/button';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';

// The security boundary for owner-only routes: every page under (authed) renders behind this.
// `requireOwner()` redirects to /sign-in when there's no valid session. Also paints the authed
// shell — a 240px sidebar on `md:+` (brand block → nav → email + sign-out footer), collapsed to
// a top bar with a hamburger-driven slide-over on `<md`.
export default async function AuthedLayout({ children }: { children: ReactNode }) {
  const owner = await requireOwner();

  const footer = (
    <div className="space-y-3">
      <p className="truncate text-xs text-muted-foreground" title={owner.email}>
        {owner.email}
      </p>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" className="w-full justify-start px-3">
          Sign out
        </Button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex md:fixed md:inset-y-0">
        <div className="border-b px-4 py-5">
          <p className="text-xl font-semibold tracking-tight">Mizrahitality</p>
          <p className="text-xs text-muted-foreground">Owner portal</p>
        </div>
        <SidebarNav />
        <div className="border-t p-4">{footer}</div>
      </aside>

      <MobileSidebar footer={footer} />

      <div className="flex-1 md:pl-60">
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </div>
    </div>
  );
}
