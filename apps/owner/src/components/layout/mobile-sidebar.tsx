'use client';

// The mobile slide-over for the authed shell. On `<md` the sidebar collapses to a top bar
// with a wordmark + a hamburger; tapping it opens this drawer. No shadcn `Sheet` — just a
// fixed panel + a backdrop + a `useState` boolean. Body scroll is left alone; the panel
// itself scrolls when content overflows.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SidebarNav } from './sidebar-nav';

export function MobileSidebar({ footer }: { footer: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close whenever the route changes (covers programmatic redirects too).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="flex min-h-[56px] items-center gap-3 border-b border-border bg-card px-4 md:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-secondary"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="17" y2="6" />
            <line x1="3" y1="10" x2="17" y2="10" />
            <line x1="3" y1="14" x2="17" y2="14" />
          </svg>
        </button>
        <Link href="/dashboard" className="font-heading text-base font-semibold tracking-tight">
          Mizrahitality
        </Link>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-foreground/40"
          />
          <aside
            className={cn(
              'absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
            )}
          >
            <div className="flex items-start justify-between border-b border-sidebar-border px-4 py-5">
              <div className="flex items-center gap-3">
                <div
                  aria-hidden
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-accent"
                >
                  <span className="h-3 w-3 rounded-full bg-white/95" />
                </div>
                <div>
                  <p className="font-heading text-[17px] font-semibold leading-tight tracking-tight">
                    Mizrahitality
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-sidebar-muted">
                    Owner portal
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="5" y1="5" x2="15" y2="15" />
                  <line x1="15" y1="5" x2="5" y2="15" />
                </svg>
              </button>
            </div>
            <SidebarNav onNavigate={() => setOpen(false)} />
            <div className="border-t border-sidebar-border p-4">{footer}</div>
          </aside>
        </div>
      )}
    </>
  );
}
