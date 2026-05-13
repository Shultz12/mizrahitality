import type { ReactNode } from 'react';

// Public auth pages (sign-up, sign-in) — a centered wordmark above whatever each page renders.
// No guard; the pages themselves redirect to /dashboard if you're already signed in.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh grid place-items-center px-6 py-12">
      <div className="flex w-full flex-col items-center gap-8">
        <div className="text-center">
          <p className="text-lg font-semibold tracking-tight">Mizrahitality</p>
          <p className="text-sm text-muted-foreground">Owner portal</p>
        </div>
        {children}
      </div>
    </main>
  );
}
