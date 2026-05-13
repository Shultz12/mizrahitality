'use client';

// Active-link nav rows for the authed sidebar. Pulled into its own client component
// so the surrounding `(authed)/layout.tsx` stays a Server Component — the active-row highlight
// needs `usePathname()`, but nothing else here does.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    // Simple house glyph — strokes, not fills, to match the rest of the chrome.
    icon: (
      <>
        <path d="M3 12l9-8 9 8" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </>
    ),
  },
  {
    href: '/builder',
    label: 'Builder',
    icon: (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="M4 9h16" />
        <path d="M9 9v11" />
      </>
    ),
  },
] as const;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-3">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex min-h-[40px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-sidebar-accent text-white'
                : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
            )}
          >
            {/* Active-state accent bar — terracotta. */}
            {active && (
              <span
                aria-hidden
                className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-[3px] bg-accent"
              />
            )}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {item.icon}
            </svg>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
