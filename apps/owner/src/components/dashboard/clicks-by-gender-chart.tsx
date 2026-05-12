'use client';

// "Book Now" clicks by gender (REQ-8): a vertical bar chart, one bar per gender (male/female —
// `neutral` clicks count in the totals but aren't an audience bar). Server-computed `BreakdownBar[]`
// in; thin SVG drawer, no fetching/state. All-zero → "No data yet".

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
  count: { label: 'Clicks', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function ClicksByGenderChart({ data }: { data: BreakdownBar[] }) {
  if (!data.some((d) => d.count > 0)) return <ChartEmpty className="h-[220px]" />;

  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
