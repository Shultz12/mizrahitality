// Small presentational bits shared by the dashboard page (feature #7, restyled in #10): a stat card
// (a label + a big number + an optional hint), the `—`-aware ratio formatter, and the "No data yet"
// placeholder the chart components drop in when their series is empty/all-zero. Pure markup — server
// components.

import { cn } from '@/lib/utils';
import type { Ratio } from '@/lib/analytics';

/** A `Ratio` as a whole-percent string, or `'—'` when the denominator was 0. */
export function fmtRatio(r: Ratio): string {
  return r.value === null ? '—' : `${Math.round(r.value * 100)}%`;
}

export function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-6 shadow-[0_1px_0_rgba(20,17,13,0.04),0_4px_12px_-2px_rgba(20,17,13,0.06)]">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p className="font-heading text-[36px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
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
