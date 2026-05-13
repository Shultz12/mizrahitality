'use client';

// Small client subcomponent for the dashboard's "Preview your published page" card: picks a uniform
// random variant from the 7 (`allVisitorVariants()`) and opens the live customer-side page in a new
// tab with `?type=<picked>` so the visit logs as a real entry of that type — same contract as the
// per-variant links above it.

import { allVisitorVariants } from '@mizrahitality/contracts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function RandomizePreviewButton({
  customerSiteUrl,
  className,
}: {
  customerSiteUrl: string;
  className?: string;
}) {
  function handleClick() {
    const variants = allVisitorVariants();
    const pick = variants[Math.floor(Math.random() * variants.length)]!;
    window.open(`${customerSiteUrl}?type=${encodeURIComponent(pick)}`, '_blank', 'noreferrer');
  }

  return (
    <Button onClick={handleClick} variant="outline" size="sm" className={cn(className)}>
      Random ↗
    </Button>
  );
}
