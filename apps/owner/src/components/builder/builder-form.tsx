'use client';

// The venue builder form — the owner's entire input surface: a venue name (English letters +
// spaces → the slug is derived from it), a free-text description, and one image (the <ImagePicker>:
// a stock pick or an upload). Submits to `saveVenueAction`; on success it `router.refresh()`es so
// the sibling <VenuePreview> Server Component re-renders with the saved content. The description
// box also carries an "Enhance with AI" affordance (feature #4): clicking it asks Claude to polish
// the text via `enhanceDescriptionAction` and shows the suggestion in a panel — "Use this" fills
// the box (the owner still clicks Save), "Keep mine" dismisses it. Non-destructive: nothing about
// the suggestion is persisted until a Save. Mirrors the `useActionState` + manual-error-`<p>`
// pattern from the auth forms (no `form`/`field` primitive).

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  enhanceDescriptionAction,
  saveVenueAction,
  type BuilderState,
} from '@/lib/builder-actions';
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
  const [enhancing, startEnhance] = useTransition();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const slugPreview = venue ? venue.slug : deriveSlugBase(typedName);
  const slugNote = venue
    ? venue.slugLockedAt
      ? '(fixed once published)'
      : '(updates when you rename)'
    : '(created when you save)';

  function handleEnhance() {
    setEnhanceError(null);
    setSuggestion(null);
    startEnhance(async () => {
      const r = await enhanceDescriptionAction(description);
      if (r.ok) setSuggestion(r.enhanced);
      else setEnhanceError(r.error);
    });
  }

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

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEnhance}
            disabled={!aiConfigured || enhancing || description.trim().length === 0}
          >
            {enhancing ? 'Enhancing…' : 'Enhance with AI'}
          </Button>
          {!aiConfigured && (
            <p className="text-xs text-muted-foreground">
              Set ANTHROPIC_API_KEY to use AI enhancement.
            </p>
          )}
        </div>

        {enhanceError && (
          <p role="alert" className="text-sm text-destructive">
            {enhanceError}
          </p>
        )}

        {suggestion !== null && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">Suggested rewrite</p>
            <p className="text-sm whitespace-pre-wrap">{suggestion}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setDescription(suggestion);
                  setSuggestion(null);
                }}
              >
                Use this
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
                Keep mine
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              &ldquo;Use this&rdquo; only fills the box — click Save changes to keep it.
            </p>
          </div>
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
