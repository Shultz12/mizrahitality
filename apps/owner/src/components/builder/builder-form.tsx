'use client';

// The venue builder form — the owner's entire input surface: a venue name (English letters +
// spaces → the slug is derived from it), a free-text description, and one image (the <ImagePicker>:
// a stock pick or an upload). Save state + action live in <BuilderShell> now (so the sticky bar's
// Save button can drive this form via the HTML `form="save-venue-form"` attribute). On a
// successful publish, the description textarea green-blinks once and re-syncs to the AI-polished
// text the server just wrote.

import { useEffect, useRef, useState } from 'react';
import { allVisitorVariants } from '@mizrahitality/contracts';
import { deriveSlugBase } from '@/lib/slug';
import { templateEntry } from '@/lib/templates';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ImagePicker } from './image-picker';
import { useBuilderShell } from './builder-shell';

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
  const { saveFormId, saveFormAction, saveState, publishedTick, markDirty } = useBuilderShell();

  const [typedName, setTypedName] = useState(venue?.name ?? '');
  const [description, setDescription] = useState(venue?.description ?? '');
  const [descriptionBlinking, setDescriptionBlinking] = useState(false);

  // Re-sync the controlled description to the server's value after a successful publish (the
  // pipeline overwrites `venue.description` with the AI-polished text, then the shell calls
  // `router.refresh()` so this prop arrives updated) and flash it green so the change is visible.
  const firstRun = useRef(true);
  const venueDescription = venue?.description ?? '';
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setDescription(venueDescription);
    setDescriptionBlinking(true);
    const t = setTimeout(() => setDescriptionBlinking(false), 1200);
    return () => clearTimeout(t);
  }, [publishedTick, venueDescription]);

  const slugPreview = venue ? venue.slug : deriveSlugBase(typedName);
  const slugNote = venue
    ? venue.slugLockedAt
      ? '(fixed once published)'
      : '(updates when you rename)'
    : '(created when you save)';

  return (
    <form
      id={saveFormId}
      action={saveFormAction}
      onChange={markDirty}
      noValidate
      encType="multipart/form-data"
      className="space-y-6"
    >
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <h2 className="border-b pb-2 text-base font-medium">Brand details</h2>
        <div className="space-y-1.5">
          <Label htmlFor="name">Venue name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={saveState.values?.name ?? venue?.name ?? ''}
            onChange={(e) => setTypedName(e.currentTarget.value)}
            aria-invalid={saveState.fieldErrors?.name ? true : undefined}
            aria-describedby={saveState.fieldErrors?.name ? 'name-error' : 'name-hint'}
          />
          {saveState.fieldErrors?.name ? (
            <p id="name-error" className="text-sm text-destructive">
              {saveState.fieldErrors.name}
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
          <div className={cn('rounded-md', descriptionBlinking && 'animate-green-blink')}>
            <Textarea
              id="description"
              name="description"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              aria-invalid={saveState.fieldErrors?.description ? true : undefined}
              aria-describedby={
                saveState.fieldErrors?.description ? 'description-error' : undefined
              }
            />
          </div>
          {saveState.fieldErrors?.description && (
            <p id="description-error" className="text-sm text-destructive">
              {saveState.fieldErrors.description}
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
        {saveState.fieldErrors?.image && (
          <p className="text-sm text-destructive">{saveState.fieldErrors.image}</p>
        )}
      </section>

      {/*
       * Sticky-bar button submits this form via the HTML `form="..."` attribute. An sr-only
       * submit button stays in-form so Enter inside any field still triggers a save.
       */}
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
        Save changes
      </button>
    </form>
  );
}
