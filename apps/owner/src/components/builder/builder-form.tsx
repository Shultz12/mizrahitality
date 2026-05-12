'use client';

// The venue builder form — the owner's entire input surface: a venue name (English letters +
// spaces → the slug is derived from it), a free-text description, and one image (the <ImagePicker>:
// a stock pick or an upload). Submits to `saveVenueAction`; on success it `router.refresh()`es so
// the sibling <VenuePreview> Server Component re-renders with the saved content. Mirrors the
// `useActionState` + manual-error-`<p>` pattern from the auth forms (no `form`/`field` primitive).

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveVenueAction, type BuilderState } from '@/lib/builder-actions';
import { deriveSlugBase } from '@/lib/slug';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImagePicker } from './image-picker';

const initialState: BuilderState = {};

type FormVenue = {
  name: string;
  slug: string;
  description: string;
  imageKind: string;
  imageValue: string;
  slugLockedAt: Date | null;
};

export function BuilderForm({ venue }: { venue: FormVenue | null }) {
  const [state, formAction, pending] = useActionState(saveVenueAction, initialState);
  const router = useRouter();
  const [typedName, setTypedName] = useState(venue?.name ?? '');

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const slugPreview = venue ? venue.slug : deriveSlugBase(typedName);
  const slugNote = venue
    ? venue.slugLockedAt
      ? '(fixed once published)'
      : '(updates when you rename)'
    : '(created when you save)';

  return (
    <form action={formAction} noValidate encType="multipart/form-data" className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Venue name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={state.values?.name ?? venue?.name ?? ''}
          onChange={(e) => setTypedName(e.currentTarget.value)}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
          aria-describedby={state.fieldErrors?.name ? 'name-error' : 'name-hint'}
        />
        {state.fieldErrors?.name ? (
          <p id="name-error" className="text-sm text-destructive">
            {state.fieldErrors.name}
          </p>
        ) : (
          <p id="name-hint" className="text-sm text-muted-foreground">
            English letters and spaces only.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Your page address:{' '}
          {slugPreview ? (
            <code className="rounded bg-muted px-1 py-0.5">/{slugPreview}</code>
          ) : (
            <span className="italic">type a name to see it</span>
          )}{' '}
          {slugNote}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={6}
          defaultValue={state.values?.description ?? venue?.description ?? ''}
          aria-invalid={state.fieldErrors?.description ? true : undefined}
          aria-describedby={state.fieldErrors?.description ? 'description-error' : undefined}
        />
        {state.fieldErrors?.description && (
          <p id="description-error" className="text-sm text-destructive">
            {state.fieldErrors.description}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Photo</Label>
        <ImagePicker current={venue ? { kind: venue.imageKind, value: venue.imageValue } : null} />
        {state.fieldErrors?.image && (
          <p className="text-sm text-destructive">{state.fieldErrors.image}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : venue ? 'Save changes' : 'Create venue'}
        </Button>
        {state.ok && (
          <p role="status" className="text-sm text-muted-foreground">
            Saved.
          </p>
        )}
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
