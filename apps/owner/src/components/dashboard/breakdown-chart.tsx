'use client';

// A small reusable horizontal-bar chart (label on the Y axis) — used for "Visitors by gender" and
// "Visitors by age group" (REQ-8). Server-computed `BreakdownBar[]` in; thin SVG drawer, no
// fetching/state. All-zero → "No data yet".

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { BreakdownBar } from '@/lib/analytics';
import { ChartEmpty } from './stat-card';

const config = {
  count: { label: 'Visitors', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function BreakdownChart({ data }: { data: BreakdownBar[] }) {
  if (!data.some((d) => d.count > 0)) return <ChartEmpty className="h-[180px]" />;

  return (
    <ChartContainer config={config} className="aspect-auto h-[180px] w-full">
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis type="number" dataKey="count" hide allowDecimals={false} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={64} />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
