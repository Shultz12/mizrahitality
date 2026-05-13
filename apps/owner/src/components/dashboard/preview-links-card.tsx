// Dashboard card with one link per audience variant + a Random button — each opens the venue's
// live customer-side page in a new tab with `?type=<variant>` appended, so the customer SSR
// renders that audience and the resulting visit logs as a real entry of that type in the
// dashboard analytics. The `?type=` is one-shot (it doesn't write the customer-site cookie), so
// multiple preview tabs stay independent and the on-page demo tab's state isn't clobbered.
// Server Component (persona-label render stays server-side, keeping the large `lib/templates.ts`
// prompt assets out of the client bundle); the Random button is a small client subcomponent.
//
// Layout (≥sm):
//   Row 1: Neutral, centered (same cell width as a normal column).
//   Rows 2–4: Male variant in the left column, Female variant in the right — one row per age group.
//   Row 5: Random button, centered (vertically aligned with Neutral).
// Single column on mobile.

import { Fragment } from 'react';
import { AGE_GROUPS } from '@mizrahitality/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { templateEntry } from '@/lib/templates';
import { cn } from '@/lib/utils';
import { RandomizePreviewButton } from './randomize-preview-button';

// 50% minus half the row gap (`gap-2` = 0.5rem) → matches a single column's width.
const CENTERED_CELL_WIDTH = 'sm:w-[calc(50%-0.25rem)]';

function VariantLink({ variant, customerSiteUrl }: { variant: string; customerSiteUrl: string }) {
  const entry = templateEntry(variant as Parameters<typeof templateEntry>[0]);
  return (
    <a
      href={`${customerSiteUrl}?type=${encodeURIComponent(variant)}`}
      target="_blank"
      rel="noreferrer"
      className={cn(
        buttonVariants({ variant: 'outline', size: 'sm' }),
        'h-auto w-full justify-between gap-3 px-3 py-2 text-left whitespace-normal',
      )}
    >
      <span className="text-xs leading-snug">{entry.personaLabel}</span>
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        ↗
      </span>
    </a>
  );
}

export function PreviewLinksCard({ customerSiteUrl }: { customerSiteUrl: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview your published page</CardTitle>
        <p className="text-sm text-muted-foreground">
          Each link opens the page as that audience and counts as a fresh visit in the analytics
          below.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {/* Row 1: Neutral, centered with the same cell width as a column. */}
          <li className="sm:col-span-2 sm:flex sm:justify-center">
            <div className={cn('w-full', CENTERED_CELL_WIDTH)}>
              <VariantLink variant="neutral" customerSiteUrl={customerSiteUrl} />
            </div>
          </li>

          {/* Rows 2–4: male in column 1, female in column 2, one age group per row. */}
          {AGE_GROUPS.map((ag) => (
            <Fragment key={ag}>
              <li>
                <VariantLink variant={`male-${ag}`} customerSiteUrl={customerSiteUrl} />
              </li>
              <li>
                <VariantLink variant={`female-${ag}`} customerSiteUrl={customerSiteUrl} />
              </li>
            </Fragment>
          ))}

          {/* Row 5: Random, centered — same horizontal position as Neutral. */}
          <li className="sm:col-span-2 sm:flex sm:justify-center">
            <div className={cn('w-full', CENTERED_CELL_WIDTH)}>
              <RandomizePreviewButton
                customerSiteUrl={customerSiteUrl}
                className="h-auto w-full justify-center px-3 py-2"
              />
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
