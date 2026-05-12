'use client';

// One-audience "Regenerate" button in the "Generated pages" list — re-runs that variant's copy
// step (`regenerateVariantAction`, which re-validates before swapping the row) and `router.refresh()`es
// on success. Only shown for a published venue.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { regenerateVariantAction } from '@/lib/builder-actions';
import { Button } from '@/components/ui/button';

export function RegenerateButton({ visitorType }: { visitorType: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const r = await regenerateVariantAction(visitorType);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? 'Regenerating…' : 'Regenerate'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
