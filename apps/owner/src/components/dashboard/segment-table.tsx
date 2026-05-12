// The gender×age conversion table (REQ-8 percentage (c)): one row per audience (male/female × the 3
// age groups — `neutral` isn't an audience), showing visitors, "Book Now" clicks, and the click rate
// (`—` for a 0-visitor segment). Plain Tailwind-styled <table> — shadcn's `table` isn't installed and
// this doesn't warrant adding it. Server component — pure markup over server-computed `SegmentRow[]`.

import type { SegmentRow } from '@/lib/analytics';
import { fmtRatio } from './stat-card';

function audienceLabel(row: SegmentRow): string {
  const gender = row.gender === 'male' ? 'Male' : 'Female';
  const age = row.ageGroup.replace('-', '–'); // en-dash for display: "18–30"
  return `${gender} · ${age}`;
}

export function SegmentTable({ rows }: { rows: SegmentRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Audience</th>
            <th className="py-2 pr-4 text-right font-medium">Visitors</th>
            <th className="py-2 pr-4 text-right font-medium">Clicks</th>
            <th className="py-2 text-right font-medium">Click rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.gender}-${row.ageGroup}`} className="border-b last:border-0">
              <td className="py-2 pr-4">{audienceLabel(row)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{row.visitors}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{row.clicks}</td>
              <td className="py-2 text-right tabular-nums">{fmtRatio(row.clickRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
