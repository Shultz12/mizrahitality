// The owner dashboard (feature #7). Three states:
//   • signed in, no venue yet → the "Your venue" card with the "Create your venue" CTA, no analytics;
//   • venue + no events → the full analytics layout, every figure zeroed / `—`, every chart "No data yet";
//   • venue + events → the full analytics layout, server-computed from the venue's recorded `Event` rows.
// Initial render is SSR (`getDashboardData` → `computeDashboard` → `DashboardData`); the analytics
// layout then lives in `<DashboardLive>`, a `'use client'` wrapper that polls
// `getLiveDashboardAction()` every ~0.5 s so reviewers can watch numbers go up live without
// reloading. The "Your venue" card stays Server-rendered — it doesn't change on event ingestion.

import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { env } from '@/lib/env';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isStockImageId, stockImagePath } from '@/lib/stock-images';
import { getDashboardData } from '@/lib/dashboard-data';
import { DashboardLive } from '@/components/dashboard/dashboard-live';
import { PreviewLinksCard } from '@/components/dashboard/preview-links-card';

function venueThumbSrc(kind: string, value: string): string {
  if (kind === 'upload') return `/uploads/${value}`;
  return isStockImageId(value) ? stockImagePath(value) : `/stock/${value}.jpg`;
}

export default async function DashboardPage() {
  const owner = await requireOwner();
  const venue = owner.venue;
  const data = venue ? await getDashboardData(venue.id) : null;
  const published = venue?.publishState === 'published';
  const customerSiteUrl = venue
    ? `${env.CUSTOMER_BASE_URL}/${encodeURIComponent(venue.slug)}`
    : null;

  return (
    <div className="space-y-8">
      <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
        Dashboard
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Your venue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {venue ? (
            <>
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={venueThumbSrc(venue.imageKind, venue.imageValue)}
                  alt={`${venue.name} photo`}
                  className="h-16 w-24 shrink-0 rounded-md object-cover"
                />
                <div className="space-y-1">
                  <p className="font-medium">{venue.name}</p>
                  <p className="text-sm text-muted-foreground">/{venue.slug}</p>
                  <StatusChip published={published} />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {published && customerSiteUrl && (
                  <a
                    href={customerSiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants()}
                  >
                    Visit published site ↗
                  </a>
                )}
                <Link href="/builder" className={buttonVariants({ variant: 'outline' })}>
                  Edit in the builder
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You haven&apos;t created your venue yet.
              </p>
              <Link href="/builder" className={buttonVariants()}>
                Create your venue
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      {published && customerSiteUrl ? (
        <PreviewLinksCard customerSiteUrl={customerSiteUrl} />
      ) : null}

      {data ? (
        <DashboardLive initialData={data} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Analytics appear once you create your venue.
        </p>
      )}
    </div>
  );
}

function StatusChip({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
      Published
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      Draft
    </span>
  );
}
