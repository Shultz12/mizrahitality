'use client';

// The builder page's outer client wrapper. Two things live here:
//   1. The sticky top-right action bar with the Save Changes + Re-publish buttons (which scroll
//      with the user). The buttons are bound to the underlying <form> elements (kept inside
//      <BuilderForm> and <PublishSection>) via the HTML `form="..."` attribute, so the form
//      semantics — names, validation, FormData — are unchanged. Save/Publish status and errors
//      surface in the bar's status slot.
//   2. The shared "Done!"/dirty state machine. After Publish succeeds, the Publish button stays
//      disabled in greyed-out green ("Done!") and the description textarea flashes
//      `animate-green-blink` once; after a per-variant Regenerate succeeds, that variant's row
//      blinks and its button stays disabled-green. Either button re-arms the moment the user
//      edits *anything* in the builder form (name, description, image) — a single shared dirty
//      counter drives all three buttons.
//
// `useActionState` for both forms also lives here, so the bar's button labels/disabled state stay
// in lock-step with the child forms (which receive the action + state via context).

import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { templateEntry } from '@/lib/templates';
import { publishAction } from '@/lib/builder-actions';
import { saveVenueAction, type BuilderState } from '@/lib/builder-actions';
import type { PublishState } from '@/lib/publish';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SAVE_FORM_ID = 'save-venue-form';
const PUBLISH_FORM_ID = 'publish-form';

const initialBuilderState: BuilderState = {};
const initialPublishState: PublishState = {};

type SaveAction = (formData: FormData) => void;
type PublishActionFn = (formData: FormData) => void;

type BuilderShellContextValue = {
  saveFormId: string;
  publishFormId: string;

  saveState: BuilderState;
  saveFormAction: SaveAction;
  savePending: boolean;

  publishState: PublishState;
  publishFormAction: PublishActionFn;
  publishPending: boolean;

  /** Bumps on a successful publish — children watch it to trigger the description blink. */
  publishedTick: number;
  /** Bumps when a specific variant has just successfully regenerated — drives that row's blink. */
  regenTickFor: (variant: string) => number;

  /** Publish-button "Done!" — true until the user edits anything. */
  publishDone: boolean;
  /** Per-variant "Done!" — true until the user edits anything (or re-publish wipes it). */
  regenDoneFor: (variant: string) => boolean;

  /** Called by RegenerateButton on a successful regen. */
  markVariantRegenerated: (variant: string) => void;
  /** Called by form fields on every change to re-arm all buttons. */
  markDirty: () => void;
};

const BuilderShellContext = createContext<BuilderShellContextValue | null>(null);

export function useBuilderShell(): BuilderShellContextValue {
  const ctx = useContext(BuilderShellContext);
  if (!ctx) throw new Error('useBuilderShell must be used inside <BuilderShell>');
  return ctx;
}

export function BuilderShell({
  hasVenue,
  aiConfigured,
  published,
  hasDescription,
  isNewVenue,
  children,
}: {
  hasVenue: boolean;
  aiConfigured: boolean;
  published: boolean;
  hasDescription: boolean;
  /** When true (no venue yet), the save button reads "Create venue" instead of "Save changes". */
  isNewVenue: boolean;
  children: ReactNode;
}) {
  const router = useRouter();

  const [saveState, saveFormAction, savePending] = useActionState(
    saveVenueAction,
    initialBuilderState,
  );
  const [publishState, publishFormAction, publishPending] = useActionState(
    publishAction,
    initialPublishState,
  );

  // ---- Dirty / Done state machine. ---------------------------------------
  // `dirtyCounter` bumps on any field change. The "Done!" snapshots store the counter value at
  // the moment of success — they stay equal to the live counter until the next edit.
  const [dirtyCounter, setDirtyCounter] = useState(0);
  const [lastPublishDirty, setLastPublishDirty] = useState<number | null>(null);
  const [publishedTick, setPublishedTick] = useState(0);
  const [regenDirty, setRegenDirty] = useState<Record<string, number>>({});
  const [regenTicks, setRegenTicks] = useState<Record<string, number>>({});

  // Mirror `dirtyCounter` into a ref so success effects can read the latest value at the moment
  // of success without re-running when the counter advances later (which would re-snapshot and
  // never let the buttons leave "Done!").
  const dirtyCounterRef = useRef(0);
  useEffect(() => {
    dirtyCounterRef.current = dirtyCounter;
  }, [dirtyCounter]);

  const markDirty = useCallback(() => {
    setDirtyCounter((n) => n + 1);
  }, []);

  const markVariantRegenerated = useCallback((variant: string) => {
    const snapshot = dirtyCounterRef.current;
    setRegenDirty((prev) => ({ ...prev, [variant]: snapshot }));
    setRegenTicks((prev) => ({ ...prev, [variant]: (prev[variant] ?? 0) + 1 }));
  }, []);

  // After a successful save (router.refresh runs once on `state.ok`), the venue data is
  // re-fetched. The save itself counts as making the form "fresh" — don't reset Done states.
  useEffect(() => {
    if (saveState.ok) router.refresh();
  }, [saveState.ok, router]);

  // After a successful publish: snapshot dirty, blink the description, drop all variant
  // "Done!" states (the publish just regenerated all 7 variants, so per-variant Done is stale).
  useEffect(() => {
    if (!publishState.ok) return;
    setLastPublishDirty(dirtyCounterRef.current);
    setPublishedTick((n) => n + 1);
    setRegenDirty({});
    router.refresh();
  }, [publishState.ok, router]);

  const publishDone = lastPublishDirty !== null && dirtyCounter === lastPublishDirty;
  const regenDoneFor = useCallback(
    (variant: string) => regenDirty[variant] === dirtyCounter,
    [regenDirty, dirtyCounter],
  );
  const regenTickFor = useCallback(
    (variant: string) => regenTicks[variant] ?? 0,
    [regenTicks],
  );

  const ctxValue = useMemo<BuilderShellContextValue>(
    () => ({
      saveFormId: SAVE_FORM_ID,
      publishFormId: PUBLISH_FORM_ID,
      saveState,
      saveFormAction,
      savePending,
      publishState,
      publishFormAction,
      publishPending,
      publishedTick,
      regenTickFor,
      publishDone,
      regenDoneFor,
      markVariantRegenerated,
      markDirty,
    }),
    [
      saveState,
      saveFormAction,
      savePending,
      publishState,
      publishFormAction,
      publishPending,
      publishedTick,
      regenTickFor,
      publishDone,
      regenDoneFor,
      markVariantRegenerated,
      markDirty,
    ],
  );

  // ---- Bar styling: "Done!" button. -------------------------------------
  const doneClass =
    'bg-success/15 text-success hover:bg-success/15 border-success/30 cursor-default';

  // Publish button visibility logic.
  const publishDisabled = !hasVenue || !aiConfigured || publishPending || publishDone;
  const publishLabel = publishPending
    ? 'Generating 7 audience pages…'
    : publishDone
      ? 'Done!'
      : published
        ? 'Re-publish'
        : 'Publish';

  const saveLabel = savePending ? 'Saving…' : isNewVenue ? 'Create venue' : 'Save changes';

  return (
    <BuilderShellContext.Provider value={ctxValue}>
      <div className="sticky top-0 z-30 -mx-6 -mt-10 mb-6 border-b border-border bg-background/85 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="min-w-0 flex-1 text-right text-xs">
            <StatusSlot
              saveState={saveState}
              savePending={savePending}
              publishState={publishState}
              publishPending={publishPending}
            />
          </div>
          <Button form={SAVE_FORM_ID} type="submit" disabled={savePending}>
            {saveLabel}
          </Button>
          <Button
            form={PUBLISH_FORM_ID}
            type="submit"
            disabled={publishDisabled}
            className={cn(publishDone && doneClass)}
          >
            {publishLabel}
          </Button>
        </div>
        <PublishGuardHints
          hasVenue={hasVenue}
          aiConfigured={aiConfigured}
          hasDescription={hasDescription}
          published={published}
        />
        {publishState.variantErrors && publishState.variantErrors.length > 0 && (
          <div role="alert" className="mt-2 space-y-1 text-xs text-destructive">
            <p>Couldn&apos;t generate {publishState.variantErrors.length} of 7 pages:</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {publishState.variantErrors.map((v) => (
                <li key={v.variant}>
                  {templateEntry(v.variant).personaLabel}: {v.errors.join('; ')}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Nothing was changed — your previous page (if any) is still live.
            </p>
          </div>
        )}
      </div>
      {children}
    </BuilderShellContext.Provider>
  );
}

function StatusSlot({
  saveState,
  savePending,
  publishState,
  publishPending,
}: {
  saveState: BuilderState;
  savePending: boolean;
  publishState: PublishState;
  publishPending: boolean;
}) {
  if (publishPending) {
    return (
      <span className="text-muted-foreground">
        Writing copy for each audience — this takes a moment…
      </span>
    );
  }
  if (savePending) return <span className="text-muted-foreground">Saving…</span>;
  if (publishState.ok) {
    return (
      <span className="font-medium text-success">
        ✓ Published — 7 audience-tailored pages generated.
      </span>
    );
  }
  if (saveState.ok) return <span className="font-medium text-success">Saved.</span>;
  if (publishState.error && (!publishState.variantErrors || publishState.variantErrors.length === 0)) {
    return <span className="text-destructive">{publishState.error}</span>;
  }
  if (saveState.error) return <span className="text-destructive">{saveState.error}</span>;
  return null;
}

function PublishGuardHints({
  hasVenue,
  aiConfigured,
  hasDescription,
  published,
}: {
  hasVenue: boolean;
  aiConfigured: boolean;
  hasDescription: boolean;
  published: boolean;
}) {
  // Mirror the previous in-card hints, but slim — they live under the bar now.
  if (!hasVenue) {
    return (
      <p className="mt-2 text-right text-xs text-muted-foreground">
        Save your venue first to enable Publish.
      </p>
    );
  }
  if (!aiConfigured) {
    return (
      <p className="mt-2 text-right text-xs text-muted-foreground">
        Publishing needs <code>GOOGLE_API_KEY</code> in <code>apps/owner/.env</code>.
      </p>
    );
  }
  if (!hasDescription) {
    return (
      <p className="mt-2 text-right text-xs text-muted-foreground">
        Write a venue description first — that&apos;s what the AI tailors.
      </p>
    );
  }
  if (!published) return null;
  return null;
}
