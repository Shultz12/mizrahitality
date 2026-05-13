'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signInAction, type AuthState } from '@/lib/auth-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initialState: AuthState = {};

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  return (
    <div className="flex w-[440px] flex-col gap-6 rounded-xl border bg-card p-8 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-[1.75rem] font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your owner portal.</p>
      </div>

      <form action={formAction} noValidate className="space-y-5">
        {state.error && (
          <p role="alert" className="text-[14px] text-destructive">
            {state.error}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[15px]">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.values?.email ?? ''}
            aria-invalid={state.error ? true : undefined}
            className="h-10 text-base md:text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[15px]">
            Password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={state.error ? true : undefined}
            className="h-10 text-base md:text-base"
          />
          {/* Reserves the same vertical space as the sign-up form's password
              hint so both cards render at identical heights. */}
          <p aria-hidden="true" className="h-[21px]" />
        </div>

        <Button type="submit" size="lg" disabled={pending} className="w-full text-base">
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="border-t pt-4 text-center text-[14px] text-muted-foreground">
        Need an account?{' '}
        <Link href="/sign-up" className="font-medium text-foreground hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
