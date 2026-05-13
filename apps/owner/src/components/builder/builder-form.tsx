'use client';

// The venue builder form — the owner's entire input surface: a venue name (English letters +
// spaces → the slug is derived from it), a free-text description, and one image (the <ImagePicker>:
// a stock pick or an upload). Save state + action live in <BuilderShell> now (so the sticky bar's
// Save button can drive this form via the HTML `form="save-venue-form"` attribute). The
// description's polished AI version lives in the separate `<EnhanceDescriptionPanel />` below the
// textarea; the typed description itself is never overwritten by Publish, so no post-publish
// re-sync or green-blink effect is needed here.

import { useState } from 'react';
import { deriveSlugBase } from '@/lib/slug';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImagePicker } from './image-picker';
import { useBuilderShell } from './builder-shell';
import { EnhanceDescriptionPanel } from './enhance-description-panel';

type FormVenue = {
  name: string;
  slug: string;
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
  const {
    saveFormId,
    saveFormAction,
    saveState,
    markDirty,
    typedDescription,
    setTypedDescription,
  } = useBuilderShell();

  const [typedName, setTypedName] = useState(venue?.name ?? '');

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
          <Textarea
            id="description"
            name="description"
            rows={6}
            value={typedDescription}
            onChange={(e) => setTypedDescription(e.currentTarget.value)}
            aria-invalid={saveState.fieldErrors?.description ? true : undefined}
            aria-describedby={
              saveState.fieldErrors?.description ? 'description-error' : undefined
            }
          />
          {saveState.fieldErrors?.description && (
            <p id="description-error" className="text-sm text-destructive">
              {saveState.fieldErrors.description}
            </p>
          )}

          <EnhanceDescriptionPanel aiConfigured={aiConfigured} />
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
