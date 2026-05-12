// Small presentational bits shared by the dashboard page (feature #7): a stat card (a label + a big
// number + an optional hint), the `—`-aware ratio formatter, and the "No data yet" placeholder the
// chart components drop in when their series is empty/all-zero. Pure markup — server components.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Ratio } from '@/lib/analytics';

/** A `Ratio` as a whole-percent string, or `'—'` when the denominator was 0. */
export function fmtRatio(r: Ratio): string {
  return r.value === null ? '—' : `${Math.round(r.value * 100)}%`;
}

export function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Centered "No data yet" filler — same footprint a chart would occupy. `className` sets the height. */
export function ChartEmpty({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center text-sm text-muted-foreground',
        className ?? 'h-[200px]',
      )}
    >
      No data yet
    </div>
  );
}
