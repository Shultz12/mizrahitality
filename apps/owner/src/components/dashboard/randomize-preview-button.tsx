'use client';

// Tiny client subcomponent for the dashboard's "Preview your published page" card: picks a random
// VisitorType per click and opens `/preview?type=<variant>` in a new tab. Kept separate from the
// parent Server Component so the persona-label rendering (which pulls in the large
// `lib/templates.ts` prompt assets) stays out of the client bundle.

import { allVisitorVariants } from '@mizrahitality/contracts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function RandomizePreviewButton({ className }: { className?: string }) {
  const variants = allVisitorVariants();

  function handleClick() {
    const pick = variants[Math.floor(Math.random() * variants.length)] ?? 'neutral';
    window.open(`/preview?type=${encodeURIComponent(pick)}`, '_blank', 'noreferrer');
  }

  return (
    <Button onClick={handleClick} variant="outline" size="sm" className={cn(className)}>
      Random ↗
    </Button>
  );
}
