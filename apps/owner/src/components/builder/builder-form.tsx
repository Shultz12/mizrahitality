'use client';

// The venue builder form — the owner's entire input surface. Two shapes:
//   • CreateVenueForm — new venue: a single <form> that gathers name + description + image and
//     calls `saveVenueAction` (which has the create-side slug-derivation + image-upload rollback).
//     A "Create venue" submit button lives at the bottom of the form.
//   • EditVenueForm — existing venue: three sibling <form>s (Brand details, Description, Photo),
//     each with its own inline Save button in the section header that calls a per-field server
//     action (`saveVenueNameAction` / `saveVenueDescriptionAction` / `saveVenueImageAction`).
//     Each section tracks its own dirty state from "typed vs. prop" — after a successful save the
//     prop updates via `revalidatePath`, the typed value matches, and the button flips to
//     greyed-green "Saved ✓" until the owner edits again. Description still hosts the separate
//     `<EnhanceDescriptionPanel />`; Enhance is its own implicit save and has its own button.
// The shell still wires `markDirty` on every form's `onChange` so Publish / Regenerate "Done!"
// re-arms the moment the owner touches anything anywhere.

import {
  useActionState,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { deriveSlugBase } from '@/lib/slug';
import {
  saveVenueAction,
  saveVenueDescriptionAction,
  saveVenueImageAction,
  saveVenueNameAction,
  type BuilderState,
  type SaveFieldState,
} from '@/lib/builder-actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ImagePicker } from './image-picker';
import { useBuilderShell } from './builder-shell';
import { EnhanceDescriptionPanel } from './enhance-description-panel';

type FormVenue = {
  name: string;
  slug: string;
  description: string;
  imageKind: string;
  imageValue: string;
  slugLockedAt: Date | null;
};

const initialFieldState: SaveFieldState = {};
const initialBuilderState: BuilderState = {};

export function BuilderForm({
  venue,
  aiConfigured,
}: {
  venue: FormVenue | null;
  aiConfigured: boolean;
}) {
  if (!venue) return <CreateVenueForm aiConfigured={aiConfigured} />;
  return <EditVenueForm venue={venue} aiConfigured={aiConfigured} />;
}

// ---------------------------------------------------------------------------
// Shared section chrome + Save button
// ---------------------------------------------------------------------------

function SectionCard({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-[0_1px_0_rgba(20,17,13,0.04),0_4px_12px_-2px_rgba(20,17,13,0.06)]">
      {children}
    </section>
  );
}

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <h2 className="-mx-6 -mt-6 mb-1 flex items-center justify-between gap-3 rounded-t-xl border-b border-border bg-card-header px-6 py-3 font-heading text-base font-semibold tracking-tight">
      <span className="flex items-center gap-2.5">
        <span aria-hidden className="h-4 w-[3px] rounded-full bg-accent/85" />
        {title}
      </span>
      {action}
    </h2>
  );
}

function SaveFieldButton({
  label,
  pending,
  dirty,
  ok,
}: {
  label: string;
  pending: boolean;
  dirty: boolean;
  ok: boolean;
}) {
  // "Saved ✓" once the action succeeded AND the typed value still matches what's on disk.
  // The moment the owner edits again, `dirty` flips and the label returns to plain "Save".
  const showSaved = ok && !dirty && !pending;
  // Three visual states, designed so the eye lands on the button the moment there's something
  // to save:
  //   • actionable (dirty or pending) → solid primary, soft shadow, subtle ring — clearly inviting a click
  //   • saved → solid soft-green, restful — confirms the save, not clamouring for attention
  //   • idle (nothing to save) → outline + muted text — present but quiet
  const actionable = dirty || pending;
  return (
    <Button
      type="submit"
      variant={actionable ? 'default' : 'outline'}
      disabled={pending || !dirty}
      className={cn(
        'min-w-[7.5rem] font-semibold transition-colors',
        actionable &&
          'shadow-sm shadow-primary/25 ring-1 ring-primary/40 ring-offset-1 ring-offset-card-header',
        showSaved &&
          'bg-success/20 text-success border-success/40 hover:bg-success/20 shadow-none ring-0 cursor-default',
        !actionable && !showSaved && 'text-muted-foreground',
      )}
    >
      {pending ? 'Saving…' : showSaved ? 'Saved ✓' : label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Existing-venue path — three independent forms
// ---------------------------------------------------------------------------

function EditVenueForm({ venue, aiConfigured }: { venue: FormVenue; aiConfigured: boolean }) {
  return (
    <div className="space-y-6">
      <NameSection venue={venue} />
      <DescriptionSection venue={venue} aiConfigured={aiConfigured} />
      <ImageSection venue={venue} />
    </div>
  );
}

function NameSection({ venue }: { venue: FormVenue }) {
  const { markDirty } = useBuilderShell();
  const [state, formAction, pending] = useActionState(saveVenueNameAction, initialFieldState);
  const [typedName, setTypedName] = useState(venue.name);
  useEffect(() => setTypedName(venue.name), [venue.name]);

  const trimmedTyped = typedName.trim().replace(/\s+/g, ' ');
  const dirty = trimmedTyped !== venue.name;
  const slugPreview = dirty ? deriveSlugBase(typedName) : venue.slug;
  const slugNote = venue.slugLockedAt ? '(fixed once published)' : '(updates when you rename)';

  return (
    <form action={formAction} onChange={markDirty} noValidate>
      <SectionCard>
        <SectionHeader
          title="Brand details"
          action={
            <SaveFieldButton label="Save name" pending={pending} dirty={dirty} ok={!!state.ok} />
          }
        />
        <div className="space-y-1.5">
          <Label htmlFor="name">Venue name</Label>
          <Input
            id="name"
            name="name"
            value={typedName}
            onChange={(e) => setTypedName(e.currentTarget.value)}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? 'name-error' : 'name-hint'}
          />
          {state.error ? (
            <p id="name-error" className="text-sm text-destructive">
              {state.error}
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
      </SectionCard>
    </form>
  );
}

function DescriptionSection({
  venue,
  aiConfigured,
}: {
  venue: FormVenue;
  aiConfigured: boolean;
}) {
  const { markDirty, typedDescription, setTypedDescription } = useBuilderShell();
  const [state, formAction, pending] = useActionState(
    saveVenueDescriptionAction,
    initialFieldState,
  );

  const dirty = typedDescription.trim() !== venue.description;

  return (
    <form action={formAction} onChange={markDirty} noValidate>
      <SectionCard>
        <SectionHeader
          title="Description"
          action={
            <SaveFieldButton
              label="Save description"
              pending={pending}
              dirty={dirty}
              ok={!!state.ok}
            />
          }
        />
        <div className="space-y-1.5">
          <Textarea
            id="description"
            name="description"
            rows={6}
            value={typedDescription}
            onChange={(e) => setTypedDescription(e.currentTarget.value)}
            aria-label="Venue description"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? 'description-error' : undefined}
          />
          {state.error && (
            <p id="description-error" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <EnhanceDescriptionPanel aiConfigured={aiConfigured} />
        </div>
      </SectionCard>
    </form>
  );
}

function ImageSection({ venue }: { venue: FormVenue }) {
  const { markDirty } = useBuilderShell();
  const [state, formAction, pending] = useActionState(saveVenueImageAction, initialFieldState);
  const [dirty, setDirty] = useState(false);

  return (
    // Key the picker on the current image identity — once a save replaces the value, the picker
    // remounts with fresh internal state (mode/picked-file reset, dirty=false → "Saved ✓").
    <form action={formAction} onChange={markDirty} noValidate>
      <SectionCard>
        <SectionHeader
          title="Photo"
          action={
            <SaveFieldButton label="Save photo" pending={pending} dirty={dirty} ok={!!state.ok} />
          }
        />
        <ImagePicker
          key={`${venue.imageKind}:${venue.imageValue}`}
          current={{ kind: venue.imageKind, value: venue.imageValue }}
          onDirtyChange={setDirty}
        />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </SectionCard>
    </form>
  );
}

// ---------------------------------------------------------------------------
// New-venue path — single "Create venue" form
// ---------------------------------------------------------------------------

function CreateVenueForm({ aiConfigured: _aiConfigured }: { aiConfigured: boolean }) {
  const router = useRouter();
  const { markDirty, typedDescription, setTypedDescription } = useBuilderShell();
  const [state, formAction, pending] = useActionState(saveVenueAction, initialBuilderState);
  const [typedName, setTypedName] = useState(state.values?.name ?? '');

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const slugPreview = deriveSlugBase(typedName);

  return (
    <form action={formAction} onChange={markDirty} noValidate className="space-y-6">
      <SectionCard>
        <SectionHeader title="Brand details" />
        <div className="space-y-1.5">
          <Label htmlFor="name">Venue name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={state.values?.name ?? ''}
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
            (created when you save)
          </p>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Description" />
        <div className="space-y-1.5">
          <Textarea
            id="description"
            name="description"
            rows={6}
            value={typedDescription}
            onChange={(e) => setTypedDescription(e.currentTarget.value)}
            aria-label="Venue description"
            aria-invalid={state.fieldErrors?.description ? true : undefined}
            aria-describedby={state.fieldErrors?.description ? 'description-error' : undefined}
          />
          {state.fieldErrors?.description && (
            <p id="description-error" className="text-sm text-destructive">
              {state.fieldErrors.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            You&apos;ll be able to enhance and publish once your venue is created.
          </p>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Photo" />
        <ImagePicker current={null} />
        {state.fieldErrors?.image && (
          <p className="text-sm text-destructive">{state.fieldErrors.image}</p>
        )}
      </SectionCard>

      <div className="flex items-center justify-end gap-3">
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create venue'}
        </Button>
      </div>
    </form>
  );
}
