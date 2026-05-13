import type { ReactNode } from 'react';
import { requireOwner } from '@/lib/auth';
import { signOutAction } from '@/lib/auth-actions';
import { Button } from '@/components/ui/button';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';

// The security boundary for owner-only routes: every page under (authed) renders behind this.
// `requireOwner()` redirects to /sign-in when there's no valid session. Also paints the authed
// shell — a 248px dark-slate sidebar on `md:+` (brand block with a terracotta mark → nav → email +
// sign-out with a small adjacent helper pill), collapsed to a top bar with a hamburger-driven
// slide-over on `<md`.
export default async function AuthedLayout({ children }: { children: ReactNode }) {
  const owner = await requireOwner();

  const footer = (
    <div className="space-y-3">
      <div className="flex items-center gap-2 min-w-0">
        <div
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground"
        >
          {owner.email.slice(0, 2)}
        </div>
        <p
          className="truncate text-xs text-sidebar-muted"
          title={owner.email}
        >
          {owner.email}
        </p>
      </div>

      <form action={signOutAction}>
        <Button
          type="submit"
          variant="ghost"
          className="w-full justify-start gap-2 border border-sidebar-border bg-transparent px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H4" />
            <path d="M9 4h10v16H9" />
          </svg>
          Sign out
        </Button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:fixed md:inset-y-0">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
          {/* Brand mark — terracotta tile with a soft inset dot. */}
          <div
            aria-hidden
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-accent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_1px_0_rgba(0,0,0,0.2)]"
          >
            <span className="h-3 w-3 rounded-full bg-white/95" />
          </div>
          <div className="min-w-0">
            <p className="font-heading text-[17px] font-semibold leading-tight tracking-tight">
              Mizrahitality
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-sidebar-muted">
              Owner portal
            </p>
          </div>
        </div>
        <SidebarNav />
        <div className="border-t border-sidebar-border p-4">{footer}</div>
      </aside>

      <MobileSidebar footer={footer} />

      <div className="flex-1 md:pl-[248px]">
        <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">{children}</main>
      </div>
    </div>
  );
}
