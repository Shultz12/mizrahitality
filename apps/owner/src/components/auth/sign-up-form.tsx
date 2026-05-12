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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Email and a password — that&apos;s all.</p>
      </div>

      <form action={formAction} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.values?.email ?? ''}
            aria-invalid={state.fieldErrors?.email ? true : undefined}
            aria-describedby={state.fieldErrors?.email ? 'email-error' : undefined}
          />
          {state.fieldErrors?.email && (
            <p id="email-error" className="text-sm text-destructive">
              {state.fieldErrors.email}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={state.fieldErrors?.password ? true : undefined}
            aria-describedby={state.fieldErrors?.password ? 'password-error' : 'password-hint'}
          />
          {state.fieldErrors?.password ? (
            <p id="password-error" className="text-sm text-destructive">
              {state.fieldErrors.password}
            </p>
          ) : (
            <p id="password-hint" className="text-sm text-muted-foreground">
              At least 8 characters.
            </p>
          )}
        </div>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Creating your account…' : 'Sign up'}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
