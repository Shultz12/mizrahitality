'use client';

// The builder page's outer client wrapper. Three things live here:
//   1. The sticky top-right action bar with the Save Changes + Re-publish buttons (which scroll
//      with the user). The save button is bound to <BuilderForm>'s form via `form="..."` (form
//      semantics unchanged); the publish button opens the confirm modal, which calls
//      `startPublishAction` and we then poll `pollPublishJobAction` so the in-button progress fill
//      can advance "X / 7" as each variant completes (the Server-Action transport can't stream
//      progress mid-action, so we run the pipeline async + poll). Save/Publish status and errors
//      surface in the bar's status slot.
//   2. The shared "Done!"/dirty state machine. After Publish succeeds, the Publish button stays
//      disabled in greyed-out green ("Done!") and the description textarea flashes
//      `animate-green-blink` once; after a per-variant Regenerate succeeds, that variant's row
//      blinks and its button stays disabled-green. Either button re-arms the moment the user
//      edits *anything* in the builder form (name, description, image) — a single shared dirty
//      counter drives all three buttons.
//   3. The publish-job polling hook itself — `triggerPublish` starts a job, then a poll timer
//      drains `pollPublishJobAction` every PUBLISH_POLL_INTERVAL_MS until the job terminates.
//      `activeJobRef` lets a fresh publish supersede an in-flight one cleanly.

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
import {
  pollPublishJobAction,
  saveVenueAction,
  startPublishAction,
  type BuilderState,
} from '@/lib/builder-actions';
import type { PublishState } from '@/lib/publish';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PublishConfirmModal, type PublishConfirmMode } from './publish-confirm-modal';

const SAVE_FORM_ID = 'save-venue-form';
const PUBLISH_POLL_INTERVAL_MS = 600;
const PUBLISH_TOTAL = 7;

const initialBuilderState: BuilderState = {};

type SaveAction = (formData: FormData) => void;

type PublishProgress = { done: number; total: number };

type BuilderShellContextValue = {
  saveFormId: string;

  saveState: BuilderState;
  saveFormAction: SaveAction;
  savePending: boolean;

  publishState: PublishState;
  /** Trigger a publish (start-job + poll). Wired to the modal's confirm button. */
  triggerPublish: () => void;
  publishPending: boolean;
  /** Live `{ done, total }` while a publish job is running. Drives the in-button progress bar. */
  publishProgress: PublishProgress;

  /** Bumps on a successful publish — children watch it to trigger the description blink. */
  publishedTick: number;
  /** Bumps when a specific variant has just successfully regenerated — drives that row's blink. */
  regenTickFor: (variant: string) => number;

  /** Publish-button "Done!" — true until the user edits anything. */
  publishDone: boolean;
  /** Per-variant "Done!" — true until the user edits anything (or re-publish wipes it). */
  regenDoneFor: (variant: string) => boolean;
  /** Enhance-button "Enhanced ✓" — true until the user edits anything. */
  enhanceDone: boolean;

  /** Live description state, lifted to the shell so the right-column <VenuePreview> can render
   *  what the owner is typing right now — and swap to the polished version after Enhance.
   *  `typedDescription` mirrors the textarea on every keystroke; `polishedPreview` is the
   *  enhanced text *if* it still corresponds to the current typed text (the moment the owner
   *  edits the textarea after enhancing, `setTypedDescription` clears `polishedPreview`). */
  typedDescription: string;
  setTypedDescription: (value: string) => void;
  polishedPreview: string | null;
  /** Called by EnhanceDescriptionPanel after a successful enhance — `polished` is what the AI
   *  returned, `source` is the typed text at enhance time (used to detect later edits). */
  setPolishedPreview: (polished: string, source: string) => void;

  /** Called by RegenerateButton on a successful regen. */
  markVariantRegenerated: (variant: string) => void;
  /** Called by EnhanceDescriptionPanel on a successful enhance — re-arms Publish / Regenerate
   *  Done states (an enhance changes the source text for any subsequent generation) and pins
   *  the enhance button into its own sticky-green "Enhanced ✓" state until the next edit. */
  markEnhanced: () => void;
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
  initialDescription,
  initialEnhancedDescription,
  children,
}: {
  hasVenue: boolean;
  aiConfigured: boolean;
  published: boolean;
  hasDescription: boolean;
  /** When true (no venue yet), the save button reads "Create venue" instead of "Save changes". */
  isNewVenue: boolean;
  /** Seed values for the live description state — what's currently saved on the venue. */
  initialDescription: string;
  initialEnhancedDescription: string | null;
  children: ReactNode;
}) {
  const router = useRouter();

  const [saveState, saveFormAction, savePending] = useActionState(
    saveVenueAction,
    initialBuilderState,
  );

  // ---- Publish job state (start-action + polling). -----------------------
  const [publishState, setPublishState] = useState<PublishState>({});
  const [publishPending, setPublishPending] = useState(false);
  const [publishProgress, setPublishProgress] = useState<PublishProgress>({
    done: 0,
    total: PUBLISH_TOTAL,
  });
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeJobRef = useRef<string | null>(null);

  // ---- Dirty / Done state machine. ---------------------------------------
  // `dirtyCounter` bumps on any field change. The "Done!" snapshots store the counter value at
  // the moment of success — they stay equal to the live counter until the next edit.
  const [dirtyCounter, setDirtyCounter] = useState(0);
  const [lastPublishDirty, setLastPublishDirty] = useState<number | null>(null);
  const [lastEnhancedDirty, setLastEnhancedDirty] = useState<number | null>(null);
  const [publishedTick, setPublishedTick] = useState(0);
  const [regenDirty, setRegenDirty] = useState<Record<string, number>>({});
  const [regenTicks, setRegenTicks] = useState<Record<string, number>>({});

  // ---- Live description state for the preview. ---------------------------
  // The textarea writes to `typedDescription` on every keystroke (via the form). The Enhance
  // panel writes to `polished` on success, also stashing the source text it was enhanced from.
  // The preview reads `polishedPreview` (polished iff source still matches typed); typing any
  // change in the textarea makes `polishedPreview` null, so the live typed text reappears.
  const [typedDescription, setTypedDescriptionState] = useState(initialDescription);
  const [polished, setPolished] = useState<{ source: string; polished: string } | null>(
    initialEnhancedDescription
      ? { source: initialDescription, polished: initialEnhancedDescription }
      : null,
  );

  // Re-seed local state if the server prop changes externally (e.g. another tab edited the
  // venue). The owner's in-progress typing isn't lost mid-session because props only change on
  // an actual server re-render, which happens after their own save/enhance — both of which set
  // local state first.
  useEffect(() => {
    setTypedDescriptionState(initialDescription);
  }, [initialDescription]);
  useEffect(() => {
    setPolished(
      initialEnhancedDescription
        ? { source: initialDescription, polished: initialEnhancedDescription }
        : null,
    );
    // Source-of-truth is `initialEnhancedDescription`; `initialDescription` is read here only
    // for the `source` field — re-running on a description prop change is harmless (it just
    // re-anchors source to the same text).
  }, [initialEnhancedDescription, initialDescription]);

  const setTypedDescription = useCallback((value: string) => {
    setTypedDescriptionState(value);
    // Any edit invalidates the polished preview: it was enhanced from a now-stale source.
    setPolished((prev) => (prev && prev.source !== value ? null : prev));
  }, []);

  const setPolishedPreview = useCallback((polishedText: string, source: string) => {
    setPolished({ source, polished: polishedText });
  }, []);

  const polishedPreview =
    polished && polished.source === typedDescription ? polished.polished : null;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<PublishConfirmMode>('confirm');

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

  // A successful enhance bumps the dirty counter (re-arms Publish & Regenerate "Done!" states —
  // the source text just changed) and snapshots the new counter as the enhance Done baseline, so
  // the Enhance button itself stays in its sticky-green state until the next edit.
  const markEnhanced = useCallback(() => {
    const next = dirtyCounterRef.current + 1;
    dirtyCounterRef.current = next;
    setDirtyCounter(next);
    setLastEnhancedDirty(next);
  }, []);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Cancel any pending poll on unmount — server-side pipeline keeps running, but the client
  // stops asking. Re-mounts (route changes) would otherwise pile timers on top of each other.
  useEffect(() => () => clearPollTimer(), [clearPollTimer]);

  const pollPublishJob = useCallback(
    (jobId: string): void => {
      pollTimerRef.current = setTimeout(async () => {
        if (activeJobRef.current !== jobId) return; // a newer publish (or unmount) superseded us
        let resp: Awaited<ReturnType<typeof pollPublishJobAction>>;
        try {
          resp = await pollPublishJobAction(jobId);
        } catch {
          // Network blip — try again on the next tick rather than aborting the publish.
          if (activeJobRef.current === jobId) pollPublishJob(jobId);
          return;
        }
        if (activeJobRef.current !== jobId) return;
        if (!resp.ok) {
          activeJobRef.current = null;
          setPublishPending(false);
          setPublishState({ error: resp.error });
          return;
        }
        setPublishProgress({ done: resp.done, total: resp.total });
        if (resp.status === 'running') {
          pollPublishJob(jobId);
          return;
        }
        // Terminal — surface the final PublishState the same way useActionState used to.
        activeJobRef.current = null;
        setPublishPending(false);
        setPublishState(resp.result ?? {});
      }, PUBLISH_POLL_INTERVAL_MS);
    },
    [],
  );

  const beginPublishJob = useCallback(
    (allowWithoutEnhanced: boolean): void => {
      clearPollTimer();
      setPublishState({});
      setPublishPending(true);
      setPublishProgress({ done: 0, total: PUBLISH_TOTAL });
      void startPublishAction(allowWithoutEnhanced ? { allowWithoutEnhanced: true } : undefined).then(
        (resp) => {
          if (!resp.ok) {
            setPublishPending(false);
            if ('needsEnhanceConfirm' in resp) {
              // The owner needs to confirm "Generate anyway" — swap the modal mode and re-open.
              setConfirmMode('enhance-missing');
              setConfirmOpen(true);
              return;
            }
            setPublishState({ error: resp.error });
            return;
          }
          activeJobRef.current = resp.jobId;
          setPublishProgress({ done: 0, total: resp.total });
          pollPublishJob(resp.jobId);
        },
      );
    },
    [clearPollTimer, pollPublishJob],
  );

  const triggerPublish = useCallback((): void => {
    if (publishPending) return;
    // Close the confirm dialog immediately on click — progress is shown only in the sticky-bar
    // Re-publish button from this point on. If this came from the enhance-missing modal, the
    // user already confirmed "Generate anyway" — forward that to the action.
    const allowWithoutEnhanced = confirmMode === 'enhance-missing';
    setConfirmOpen(false);
    beginPublishJob(allowWithoutEnhanced);
  }, [publishPending, confirmMode, beginPublishJob]);

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
    setConfirmOpen(false);
    router.refresh();
  }, [publishState.ok, router]);

  const publishDone = lastPublishDirty !== null && dirtyCounter === lastPublishDirty;
  const enhanceDone = lastEnhancedDirty !== null && dirtyCounter === lastEnhancedDirty;
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
      saveState,
      saveFormAction,
      savePending,
      publishState,
      triggerPublish,
      publishPending,
      publishProgress,
      publishedTick,
      regenTickFor,
      publishDone,
      regenDoneFor,
      enhanceDone,
      typedDescription,
      setTypedDescription,
      polishedPreview,
      setPolishedPreview,
      markVariantRegenerated,
      markEnhanced,
      markDirty,
    }),
    [
      saveState,
      saveFormAction,
      savePending,
      publishState,
      triggerPublish,
      publishPending,
      publishProgress,
      publishedTick,
      regenTickFor,
      publishDone,
      regenDoneFor,
      enhanceDone,
      typedDescription,
      setTypedDescription,
      polishedPreview,
      setPolishedPreview,
      markVariantRegenerated,
      markEnhanced,
      markDirty,
    ],
  );

  // Publish button visibility logic.
  const publishDisabled = !hasVenue || !aiConfigured || publishPending || publishDone;

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
              publishProgress={publishProgress}
            />
          </div>
          <Button form={SAVE_FORM_ID} type="submit" disabled={savePending}>
            {saveLabel}
          </Button>
          <PublishProgressButton
            type="button"
            published={published}
            done={publishProgress.done}
            total={publishProgress.total}
            pending={publishPending}
            disabled={publishDisabled}
            doneState={publishDone}
            onClick={() => {
              setConfirmMode('confirm');
              setConfirmOpen(true);
            }}
          />
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
      <PublishConfirmModal
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmMode('confirm');
        }}
        published={published}
        mode={confirmMode}
        onConfirm={triggerPublish}
      />
      {children}
    </BuilderShellContext.Provider>
  );
}

/**
 * The Publish / Re-publish / Generating X/N… / Done! button — with an animated progress fill that
 * advances as each variant completes. The fill is an absolute-positioned `<span>` whose width is
 * `done/total*100%` and whose background interpolates `gray → full success-green` via a CSS
 * variable, so width and color both transition smoothly. When the publish settles in the "Done!"
 * state (a successful publish, until the user edits anything), the button is greyed-green and the
 * label flips to "Done!".
 */
function PublishProgressButton({
  type,
  published,
  done,
  total,
  pending,
  disabled,
  doneState,
  onClick,
  form,
}: {
  type: 'button' | 'submit';
  published: boolean;
  done: number;
  total: number;
  pending: boolean;
  disabled: boolean;
  doneState: boolean;
  onClick?: () => void;
  form?: string;
}) {
  const doneClass =
    'bg-success/15 text-success hover:bg-success/15 border-success/30 cursor-default';

  const label = pending
    ? `Generating ${done}/${total}…`
    : doneState
      ? 'Done!'
      : published
        ? 'Re-publish'
        : 'Publish';

  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  // Interpolate hue/lightness so the bar visibly warms from cool grey-green → full success green.
  const fillStyle = pending
    ? {
        width: `${ratio * 100}%`,
        // Light grey-green at 0 → success-green saturation at 100%. `currentColor` would inherit
        // the disabled button text colour, so use explicit hsl() values for predictable shading.
        backgroundColor: `hsl(${140 + ratio * 10}deg ${30 + ratio * 50}% ${78 - ratio * 38}%)`,
      }
    : { width: '0%' };

  return (
    <Button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled}
      className={cn('relative overflow-hidden', doneState && doneClass)}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 transition-[width,background-color] duration-700 ease-out"
        style={fillStyle}
      />
      <span className="relative z-10">{label}</span>
    </Button>
  );
}

function StatusSlot({
  saveState,
  savePending,
  publishState,
  publishPending,
  publishProgress,
}: {
  saveState: BuilderState;
  savePending: boolean;
  publishState: PublishState;
  publishPending: boolean;
  publishProgress: PublishProgress;
}) {
  if (publishPending) {
    const { done, total } = publishProgress;
    return (
      <span className="text-muted-foreground">
        Writing copy for each audience — {done}/{total} done…
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
