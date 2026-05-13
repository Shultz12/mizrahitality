'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signUpAction, type AuthState } from '@/lib/auth-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initialState: AuthState = {};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  return (
    <div className="flex w-[440px] flex-col gap-6 rounded-xl border bg-card p-8 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-[1.75rem] font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Email and a password — that&apos;s all.</p>
      </div>

      <form action={formAction} noValidate className="space-y-5">
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
            aria-invalid={state.fieldErrors?.email ? true : undefined}
            aria-describedby={state.fieldErrors?.email ? 'email-error' : undefined}
            className="h-10 text-base md:text-base"
          />
          {state.fieldErrors?.email && (
            <p id="email-error" className="text-[14px] text-destructive">
              {state.fieldErrors.email}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[15px]">
            Password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={state.fieldErrors?.password ? true : undefined}
            aria-describedby={state.fieldErrors?.password ? 'password-error' : 'password-hint'}
            className="h-10 text-base md:text-base"
          />
          {state.fieldErrors?.password ? (
            <p id="password-error" className="text-[14px] text-destructive">
              {state.fieldErrors.password}
            </p>
          ) : (
            <p id="password-hint" className="text-[14px] text-muted-foreground">
              At least 8 characters.
            </p>
          )}
        </div>

        <Button type="submit" size="lg" disabled={pending} className="w-full text-base">
          {pending ? 'Creating your account…' : 'Sign up'}
        </Button>
      </form>

      <p className="border-t pt-4 text-center text-[14px] text-muted-foreground">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
