// A read-only list of the 7 audience pages generated at publish. Server Component — for each
// variant it shows the persona label + that bundle's `tagline` (the most representative one-liner),
// or a parse-failure / missing note; for a published venue each row gets a <RegenerateButton>. The
// builder page `router.refresh()`es after a publish / regenerate so this re-renders. The full
// per-audience page render (the 5-zone design) arrives with feature #5.

import Link from 'next/link';
import { allVisitorVariants } from '@mizrahitality/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { templateEntry } from '@/lib/templates';
import { parsePageVariantContent } from '@/lib/page-variant';
import { RegenerateButton } from './regenerate-button';

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
                <li
                  key={variant}
                  className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{entry.personaLabel}</p>
                    {!row ? (
                      <p className="text-xs text-muted-foreground italic">(missing — re-publish)</p>
                    ) : parsed && parsed.ok ? (
                      <p className="text-xs text-muted-foreground">
                        &ldquo;{parsed.value.copy.tagline}&rdquo;
                      </p>
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
                        className="text-xs underline underline-offset-2"
                      >
                        Preview →
                      </Link>
                      <RegenerateButton visitorType={variant} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
