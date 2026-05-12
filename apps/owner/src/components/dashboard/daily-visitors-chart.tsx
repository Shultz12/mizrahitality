'use client';

// The daily-visitors chart (REQ-8): a vertical bar per day over the fixed last 30 calendar days,
// zero-filled for gap days, with an ordinary-least-squares trendline overlaid as a <Line> inside a
// recharts ComposedChart (Bar + Line share the X scale). It's a thin SVG drawer — server-computed
// `DailyPoint[]` in, no fetching / state / effects. All-zero series → the "No data yet" filler.

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { DailyPoint } from '@/lib/analytics';
import { ChartEmpty } from './stat-card';

const config = {
  visits: { label: 'Visits', color: 'var(--chart-2)' },
  trend: { label: 'Trend', color: 'var(--chart-5)' },
} satisfies ChartConfig;

export function DailyVisitorsChart({ data }: { data: DailyPoint[] }) {
  if (!data.some((d) => d.visits > 0)) return <ChartEmpty className="h-[240px]" />;

  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
      <ComposedChart accessibilityLayer data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="visits" fill="var(--color-visits)" radius={4} />
        <Line
          dataKey="trend"
          stroke="var(--color-trend)"
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
