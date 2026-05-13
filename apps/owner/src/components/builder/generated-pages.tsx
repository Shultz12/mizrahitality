'use client';

// A read-only list of the 7 audience pages generated at publish. Client Component now (used to be
// SSR) so each row can watch the shared `<BuilderShell>` regen-tick and green-blink once after its
// per-variant Regenerate succeeds. For each variant it shows the persona label + that bundle's
// `tagline` (the most representative one-liner), or a parse-failure / missing note; for a
// published venue each row gets a "Preview →" link (opens in a new tab) and a <RegenerateButton>.
// The builder page `router.refresh()`es after publish / regenerate so the bundle data re-renders.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { allVisitorVariants } from '@mizrahitality/contracts';
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
}: {
  variants: VariantRow[];
  published: boolean;
}) {
  const byType = new Map(variants.map((v) => [v.visitorType, v] as const));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated pages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No audience pages yet — click Publish to generate them.
          </p>
        ) : (
          <ul className="space-y-3">
            {allVisitorVariants().map((variant) => {
              const row = byType.get(variant);
              const entry = templateEntry(variant);
              const parsed = row ? parsePageVariantContent(row.content) : null;
              return (
                <VariantListRow
                  key={variant}
                  variant={variant}
                  personaLabel={entry.personaLabel}
                  tagline={parsed && parsed.ok ? parsed.value.copy.tagline : null}
                  status={!row ? 'missing' : parsed && parsed.ok ? 'ok' : 'unreadable'}
                  published={published}
                />
              );
            })}
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
}: {
  variant: string;
  personaLabel: string;
  tagline: string | null;
  status: 'ok' | 'missing' | 'unreadable';
  published: boolean;
}) {
  const { regenTickFor } = useBuilderShell();
  const tick = regenTickFor(variant);
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
    <li
      className={cn(
        'flex flex-wrap items-start justify-between gap-2 rounded-md border-b pb-3 last:border-b-0 last:pb-0',
        blinking && 'animate-green-blink',
      )}
    >
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{personaLabel}</p>
        {status === 'missing' ? (
          <p className="text-xs text-muted-foreground italic">(missing — re-publish)</p>
        ) : status === 'ok' ? (
          <p className="text-xs text-muted-foreground">&ldquo;{tagline}&rdquo;</p>
        ) : (
          <p className="text-xs text-destructive italic">
            (stored content is unreadable — re-publish to regenerate)
          </p>
        )}
      </div>
      {published && (
        <div className="flex items-center gap-2">
          <Link
            href={`/preview?type=${encodeURIComponent(variant)}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline underline-offset-2"
          >
            Preview →
          </Link>
          <RegenerateButton visitorType={variant} />
        </div>
      )}
    </li>
  );
}
