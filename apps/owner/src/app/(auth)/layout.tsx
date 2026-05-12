import type { ReactNode } from 'react';

// Public auth pages (sign-up, sign-in) — a centered card. No guard; the pages themselves
// redirect to /dashboard if you're already signed in.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
