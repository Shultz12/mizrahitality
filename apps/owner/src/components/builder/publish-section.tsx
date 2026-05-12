'use client';

// The Publish section — replaces the inline `<form action={publishAction}>` that the builder page
// used in feature #3. `publishAction` is a stateful `useActionState` action now: it generates +
// validates the 7 audience copy bundles and either publishes them all or changes nothing and
// reports which variants failed. On success this `router.refresh()`es so the page's Server
// Components (the "Generated pages" list, the disabled/enabled hints) re-render. No `redirect()` —
// the result shows inline. (No-JS limitation, carried from #2/#3: the form posts without JS, but
// the per-variant error list and the "✓ Published" notice need hydration.)

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { publishAction } from '@/lib/builder-actions';
import type { PublishState } from '@/lib/publish';
import { templateEntry } from '@/lib/templates';
import { Button } from '@/components/ui/button';

const initialState: PublishState = {};

export function PublishSection({
  hasVenue,
  aiConfigured,
  published,
  hasDescription,
}: {
  hasVenue: boolean;
  aiConfigured: boolean;
  published: boolean;
  hasDescription: boolean;
}) {
  const [state, formAction, pending] = useActionState(publishAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="space-y-2 border-t pt-6">
      <h2 className="text-lg font-semibold tracking-tight">Publish</h2>
      <p className="text-sm text-muted-foreground">
        Publishing freezes your page address and uses AI to write a tailored version of your copy
        for each of the 7 audiences.
      </p>

      <form action={formAction}>
        <Button type="submit" disabled={!hasVenue || !aiConfigured || pending}>
          {pending ? 'Generating 7 audience pages…' : published ? 'Re-publish' : 'Publish'}
        </Button>
      </form>

      {!hasVenue && <p className="text-sm text-muted-foreground">Save your venue first.</p>}
      {hasVenue && !aiConfigured && (
        <p className="text-sm text-muted-foreground">
          Publishing generates 7 audience-tailored pages with AI — set ANTHROPIC_API_KEY in
          apps/owner/.env to enable it.
        </p>
      )}
      {hasVenue && aiConfigured && !hasDescription && (
        <p className="text-sm text-muted-foreground">
          Write a venue description first — that&apos;s what the AI tailors.
        </p>
      )}

      {pending && (
        <p role="status" className="text-sm text-muted-foreground">
          Writing copy for each audience — this takes a moment…
        </p>
      )}

      {state.ok && (
        <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">
          ✓ Published — 7 audience-tailored pages generated.
        </p>
      )}

      {published && (
        <p className="text-sm">
          <Link href="/preview" className="underline underline-offset-2">
            View your published page →
          </Link>{' '}
          <span className="text-muted-foreground">
            (append <code>?type=</code> — e.g. <code>?type=female-18-30</code> — to preview each
            audience)
          </span>
        </p>
      )}

      {state.variantErrors && state.variantErrors.length > 0 ? (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          <p>Couldn&apos;t generate {state.variantErrors.length} of 7 pages:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {state.variantErrors.map((v) => (
              <li key={v.variant}>
                {templateEntry(v.variant).personaLabel}: {v.errors.join('; ')}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Nothing was changed — your previous page (if any) is still live.
          </p>
        </div>
      ) : (
        state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )
      )}
    </div>
  );
}
