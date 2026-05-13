'use client';

// The venue builder form — the owner's entire input surface: a venue name (English letters +
// spaces → the slug is derived from it), a free-text description, and one image (the <ImagePicker>:
// a stock pick or an upload). Submits to `saveVenueAction`; on success it `router.refresh()`es so
// the sibling <VenuePreview> Server Component re-renders with the saved content. AI enhancement
// is no longer a separate affordance — it's folded into Publish (lib/publish.ts step 1), so this
// form just shows a static info panel telling the owner what Publish will do with their text.
// Mirrors the `useActionState` + manual-error-`<p>` pattern from the auth forms (no `form`/`field`
// primitive).

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { allVisitorVariants } from '@mizrahitality/contracts';
import { saveVenueAction, type BuilderState } from '@/lib/builder-actions';
import { deriveSlugBase } from '@/lib/slug';
import { templateEntry } from '@/lib/templates';
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

export function BuilderForm({
  venue,
  aiConfigured,
}: {
  venue: FormVenue | null;
  aiConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveVenueAction, initialState);
  const router = useRouter();
  const [typedName, setTypedName] = useState(venue?.name ?? '');
  const [description, setDescription] = useState(venue?.description ?? '');

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
    <form action={formAction} noValidate encType="multipart/form-data" className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <h2 className="border-b pb-2 text-base font-medium">Brand details</h2>
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
      </section>

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <h2 className="border-b pb-2 text-base font-medium">Description</h2>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            aria-invalid={state.fieldErrors?.description ? true : undefined}
            aria-describedby={state.fieldErrors?.description ? 'description-error' : undefined}
          />
          {state.fieldErrors?.description && (
            <p id="description-error" className="text-sm text-destructive">
              {state.fieldErrors.description}
            </p>
          )}

          {aiConfigured ? (
            <div className="space-y-2 rounded-lg border bg-secondary/40 p-3">
              <p className="text-sm">
                On Publish, your description will be polished by AI and turned into 7
                audience-tailored pages:
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {allVisitorVariants().map((v) => (
                  <li key={v}>{templateEntry(v).personaLabel}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Your typed description will be replaced with the polished version on a successful
                publish.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Set <code>GOOGLE_API_KEY</code> to publish — without it, your description can&apos;t
              be polished and the 7 audience pages can&apos;t be generated.
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <h2 className="border-b pb-2 text-base font-medium">Photo</h2>
        <ImagePicker current={venue ? { kind: venue.imageKind, value: venue.imageValue } : null} />
        {state.fieldErrors?.image && (
          <p className="text-sm text-destructive">{state.fieldErrors.image}</p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : venue ? 'Save changes' : 'Create venue'}
        </Button>
        {state.ok && (
          <p role="status" className="text-xs font-medium text-success">
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
