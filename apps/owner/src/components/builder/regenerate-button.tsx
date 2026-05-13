'use client';

// One-audience "Regenerate" button in the "Generated pages" list — re-runs that variant's copy
// step (`regenerateVariantAction`, which re-validates before swapping the row) and
// `router.refresh()`es on success. Only shown for a published venue.
//
// Success UX: stays disabled in greyed-green "Done!" until the user edits any builder field
// (shared dirty signal from <BuilderShell>) — keeps the owner from accidentally re-clicking a
// no-op regenerate. The variant's row in <GeneratedPages> green-blinks once (driven by
// `regenTickFor(visitorType)`).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { regenerateVariantAction } from '@/lib/builder-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBuilderShell } from './builder-shell';

export function RegenerateButton({ visitorType }: { visitorType: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { regenDoneFor, markVariantRegenerated } = useBuilderShell();
  const done = regenDoneFor(visitorType);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const r = await regenerateVariantAction(visitorType);
      if (r.ok) {
        markVariantRegenerated(visitorType);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  const doneClass = 'bg-success/15 text-success hover:bg-success/15 border-success/30 cursor-default';

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={pending || done}
        className={cn(done && doneClass)}
      >
        {pending ? 'Regenerating…' : done ? 'Done!' : 'Regenerate'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
