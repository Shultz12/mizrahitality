'use client';

import { cn } from '@/lib/utils';

type DemoAccount = {
  email: string;
  password: string;
  tag: string;
  explanation: string;
};

const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: 'owner@mizrahitality.test',
    password: 'mizrahitality',
    tag: 'Pre-seeded',
    explanation:
      'Pre-seeded with ~30 days of synthetic analytics — sign in to explore a populated dashboard, the published page, and full breakdowns.',
  },
  {
    email: 'owner2@mizrahitality.test',
    password: 'mizrahitality',
    tag: 'Empty · live',
    explanation:
      'Starts empty. Sign in, open the venue page in another tab, and watch the dashboard fill up live as you click around.',
  },
];

function fillCredentials(email: string, password: string) {
  const emailInput = document.getElementById('email') as HTMLInputElement | null;
  const passwordInput = document.getElementById('password') as HTMLInputElement | null;
  if (emailInput) emailInput.value = email;
  if (passwordInput) passwordInput.value = password;
  passwordInput?.focus();
  passwordInput?.select();
}

export function DemoCredentialsPanel() {
  return (
    <aside
      aria-label="Quick-fill demo credentials (not part of the page)"
      className={cn(
        'relative flex w-[440px] -rotate-1 flex-col rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-6 shadow-sm',
      )}
    >
      <div className="absolute -top-3 left-5 select-none rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-amber-800 uppercase">
        Quick fill
      </div>

      <p className="mt-1 text-sm leading-snug text-amber-800">
        A reviewer aid — not part of the page. Click an account below to fill the sign-in form.
      </p>

      <ul className="mt-4 space-y-3">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email}>
            <button
              type="button"
              onClick={() => fillCredentials(account.email, account.password)}
              className={cn(
                'group block w-full cursor-pointer rounded-lg border border-amber-300 bg-white/80 p-3.5 text-left transition-all',
                'hover:-translate-y-0.5 hover:border-amber-500 hover:bg-white hover:shadow-md',
                'focus-visible:border-amber-600 focus-visible:bg-white focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60',
                'active:translate-y-0',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-amber-950">
                  {account.email}
                </span>
                <span className="shrink-0 text-xs font-medium text-amber-700 opacity-70 transition-opacity group-hover:opacity-100">
                  Click to fill →
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="font-mono text-[13px] text-amber-800">
                  pw: {account.password}
                </span>
                <span className="text-[11px] font-medium text-amber-700/80 uppercase tracking-wider">
                  {account.tag}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-snug text-amber-900/80">
                {account.explanation}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
