import type { ReactNode } from 'react';

// Public auth pages (sign-up, sign-in) — a centered card with the wordmark above. No guard;
// the pages themselves redirect to /dashboard if you're already signed in.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh grid place-items-center px-6 py-12">
      <div className="w-full max-w-[400px] space-y-6">
        <div className="text-center">
          <p className="text-base font-semibold tracking-tight">Mizrahitality</p>
          <p className="text-xs text-muted-foreground">Owner portal</p>
        </div>
        {children}
      </div>
    </main>
  );
}
