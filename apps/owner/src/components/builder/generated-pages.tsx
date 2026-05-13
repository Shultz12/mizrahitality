'use client';

// A read-only list of the 7 audience pages generated at publish. Client Component (used to be
// SSR) so each row can watch the shared `<BuilderShell>` regen-tick and green-blink once after its
// per-variant Regenerate succeeds. For each variant it shows the persona label + that bundle's
// `tagline` (the most representative one-liner), or a parse-failure / missing note; for a
// published venue each row gets a "Visit live ↗" link (opens the customer page in a new tab with
// `?type=<variant>` so the visit logs as that audience in analytics) and a <RegenerateButton>.
// The card header's "View live page ↗" link stays plain `<CUSTOMER_BASE_URL>/<slug>` — that's a
// generic "see my site" entry, not a per-audience preview.
// The builder page `router.refresh()`es after publish / regenerate so the bundle data re-renders.
//
// Layout (≥sm):
//   Row 1: Neutral, full-width across both columns.
//   Rows 2–4: Male variant in the left column, Female variant in the right — one row per age group.
// Single column on mobile.

import { Fragment, useEffect, useRef, useState } from 'react';
import { AGE_GROUPS, NEUTRAL_VISITOR_TYPE } from '@mizrahitality/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { templateEntry } from '@/lib/templates';
import { parsePageVariantContent } from '@/lib/page-variant';
import { cn } from '@/lib/utils';
import { RegenerateButton } from './regenerate-button';
import { useBuilderShell } from './builder-shell';

type VariantRow = { visitorType: string; content: unknown; updatedAt: Date };

export function GeneratedPages({
  variants,
  published,
  customerSiteUrl,
}: {
  variants: VariantRow[];
  published: boolean;
  customerSiteUrl: string | null;
}) {
  const byType = new Map(variants.map((v) => [v.visitorType, v] as const));

  function rowFor(variant: string) {
    const row = byType.get(variant);
    const entry = templateEntry(variant as Parameters<typeof templateEntry>[0]);
    const parsed = row ? parsePageVariantContent(row.content) : null;
    return (
      <VariantListRow
        variant={variant}
        personaLabel={entry.personaLabel}
        tagline={parsed && parsed.ok ? parsed.value.copy.tagline : null}
        status={!row ? 'missing' : parsed && parsed.ok ? 'ok' : 'unreadable'}
        published={published}
        customerSiteUrl={customerSiteUrl}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Generated pages</CardTitle>
          {published && customerSiteUrl && (
            <a
              href={customerSiteUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline underline-offset-2"
            >
              View live page ↗
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No audience pages yet — click Publish to generate them.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Row 1: Neutral — full-width across both columns. */}
            <li className="sm:col-span-2">{rowFor(NEUTRAL_VISITOR_TYPE)}</li>

            {/* Rows 2–4: male left, female right, one age group per row. */}
            {AGE_GROUPS.map((ag) => (
              <Fragment key={ag}>
                <li>{rowFor(`male-${ag}`)}</li>
                <li>{rowFor(`female-${ag}`)}</li>
              </Fragment>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function VariantListRow({
  variant,
  personaLabel,
  tagline,
  status,
  published,
  customerSiteUrl,
}: {
  variant: string;
  personaLabel: string;
  tagline: string | null;
  status: 'ok' | 'missing' | 'unreadable';
  published: boolean;
  customerSiteUrl: string | null;
}) {
  const { regenTickFor, regenTaglineFor } = useBuilderShell();
  const tick = regenTickFor(variant);
  const overrideTagline = regenTaglineFor(variant);
  const displayedTagline = overrideTagline ?? tagline;
  const firstRun = useRef(true);
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setBlinking(true);
    const t = setTimeout(() => setBlinking(false), 1200);
    return () => clearTimeout(t);
  }, [tick]);

  return (
    <div
      className={cn(
        'flex h-full flex-col gap-3 rounded-md border bg-card/30 p-3',
        blinking && 'animate-green-blink',
      )}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">{personaLabel}</p>
        {status === 'missing' ? (
          <p className="text-xs text-muted-foreground italic">(missing — re-publish)</p>
        ) : status === 'ok' ? (
          <p className="text-xs text-muted-foreground">&ldquo;{displayedTagline}&rdquo;</p>
        ) : (
          <p className="text-xs text-destructive italic">
            (stored content is unreadable — re-publish to regenerate)
          </p>
        )}
      </div>
      {published && (
        <div className="mt-auto flex items-center justify-between gap-2">
          {customerSiteUrl ? (
            <a
              href={`${customerSiteUrl}?type=${encodeURIComponent(variant)}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline underline-offset-2"
            >
              Visit live ↗
            </a>
          ) : (
            <span />
          )}
          <RegenerateButton visitorType={variant} />
        </div>
      )}
    </div>
  );
}
