'use client';

// The "Enhance" panel below the description textarea. Reads the live typed description from the
// shell (so the action sees whatever's in the textarea right now, not the last-saved DB value),
// writes the polished result back to the shell on success (so the right-column <VenuePreview>
// can swap to it). Clicking Enhance is an implicit save of the description text — the action
// persists both `description` and `enhancedDescription` atomically.
//
// Why drive pending from local `useState` rather than `useTransition`: wrapping
// `enhanceDescriptionAction` + a refresh inside `useTransition` keeps `pending` true until the
// full server round-trip completes — so the button visibly hangs on "Enhancing…" for an extra
// beat after the AI call returns. With a plain pending flag we flip it back the instant the
// action resolves, paint the polished text from the action response immediately, and fire
// `router.refresh()` without awaiting it so other server-rendered consumers still re-fetch.
//
// Success UX mirrors the rest of the builder: the text container green-blinks once (1200ms,
// matches the `animate-green-blink` keyframes in globals.css) and the Enhance button stays in
// greyed-green "Enhanced ✓" until the owner edits any builder field — same pattern as the
// per-variant Regenerate "Done!" via the shared dirty counter.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { enhanceDescriptionAction } from '@/lib/builder-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBuilderShell } from './builder-shell';

export function EnhanceDescriptionPanel({ aiConfigured }: { aiConfigured: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blinking, setBlinking] = useState(false);
  const [flashTick, setFlashTick] = useState(0);
  const {
    markEnhanced,
    enhanceDone,
    typedDescription,
    polishedPreview,
    setPolishedPreview,
  } = useBuilderShell();

  // Drive the 1200ms green flash from a tick counter so consecutive Enhance clicks each re-arm
  // the animation.
  useEffect(() => {
    if (flashTick === 0) return;
    setBlinking(true);
    const t = setTimeout(() => setBlinking(false), 1200);
    return () => clearTimeout(t);
  }, [flashTick]);

  async function handleClick() {
    setError(null);
    setPending(true);
    let r: Awaited<ReturnType<typeof enhanceDescriptionAction>>;
    try {
      r = await enhanceDescriptionAction(typedDescription);
    } catch {
      setPending(false);
      setError('The AI service is unavailable right now — please try again.');
      return;
    }
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPolishedPreview(r.enhancedDescription, typedDescription);
    setFlashTick((n) => n + 1);
    markEnhanced();
    // Refresh server-rendered consumers in the background — do NOT await; the panel is already
    // displaying the new text from the action response.
    router.refresh();
  }

  if (!aiConfigured) {
    return (
      <p className="text-xs text-muted-foreground">
        Set <code>GOOGLE_API_KEY</code> to enable Enhance — without it, your description can&apos;t
        be polished and the 7 audience pages can&apos;t be generated.
      </p>
    );
  }

  const doneClass =
    'bg-success/15 text-success hover:bg-success/15 border-success/30 cursor-default';

  const hasTypedDescription = typedDescription.trim().length > 0;

  const buttonLabel = pending
    ? 'Enhancing…'
    : enhanceDone
      ? 'Enhanced ✓'
      : polishedPreview
        ? 'Re-enhance'
        : 'Enhance';

  return (
    <div className="space-y-2 rounded-lg border bg-secondary/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Polished description</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={pending || !hasTypedDescription || enhanceDone}
          className={cn(enhanceDone && doneClass)}
        >
          {buttonLabel}
        </Button>
      </div>
      {polishedPreview ? (
        <div
          className={cn(
            'rounded-md border bg-background/60 p-3 text-sm whitespace-pre-wrap',
            blinking && 'animate-green-blink',
          )}
        >
          {polishedPreview}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Click Enhance to generate a polished version your audience pages can use.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        AI may rewrite phrasing — review it before publishing. Editing the description above
        clears this and you&apos;ll need to enhance again.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
