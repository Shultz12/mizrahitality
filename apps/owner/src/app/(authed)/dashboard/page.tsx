// The owner dashboard (feature #7). Three states:
//   • signed in, no venue yet → the "Your venue" card with the "Create your venue" CTA, no analytics;
//   • venue + no events → the full analytics layout, every figure zeroed / `—`, every chart "No data yet";
//   • venue + events → the full analytics layout, server-computed from the venue's recorded `Event` rows.
// All aggregation is server-side (`lib/analytics.ts` via the thin `lib/dashboard-data.ts` wrapper); the
// chart components under `components/dashboard/*` are thin `'use client'` recharts SVG drawers fed
// already-computed props — no fetching, no loading state. Never an error: `computeDashboard([])` is a
// fully-formed zeroed object. SSR — reload to refresh.

import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isStockImageId, stockImagePath } from '@/lib/stock-images';
import { getDashboardData } from '@/lib/dashboard-data';
import type { DashboardData } from '@/lib/analytics';
import { StatCard, fmtRatio } from '@/components/dashboard/stat-card';
import { DailyVisitorsChart } from '@/components/dashboard/daily-visitors-chart';
import { ClicksByGenderChart } from '@/components/dashboard/clicks-by-gender-chart';
import { BreakdownChart } from '@/components/dashboard/breakdown-chart';
import { SegmentTable } from '@/components/dashboard/segment-table';

function venueThumbSrc(kind: string, value: string): string {
  if (kind === 'upload') return `/uploads/${value}`;
  return isStockImageId(value) ? stockImagePath(value) : `/stock/${value}.jpg`;
}

export default async function DashboardPage() {
  const owner = await requireOwner();
  const venue = owner.venue;
  const data = venue ? await getDashboardData(venue.id) : null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {owner.email}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Your venue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {venue ? (
            <>
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={venueThumbSrc(venue.imageKind, venue.imageValue)}
                  alt={`${venue.name} photo`}
                  className="h-16 w-24 shrink-0 rounded-md object-cover"
                />
                <div className="space-y-0.5">
                  <p className="font-medium">{venue.name}</p>
                  <p className="text-sm text-muted-foreground">/{venue.slug}</p>
                  <p className="text-sm text-muted-foreground">Status: {venue.publishState}</p>
                </div>
              </div>
              <Link href="/builder" className={buttonVariants({ variant: 'outline' })}>
                Edit in the builder
              </Link>
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

      {data ? (
        <AnalyticsSection data={data} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Analytics appear once you create your venue.
        </p>
      )}
    </div>
  );
}

function AnalyticsSection({ data }: { data: DashboardData }) {
  const ctr = data.clickThroughRate;
  const hbc = data.hoverBeforeClickRate;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
        {data.isEmpty ? (
          <p className="text-sm text-muted-foreground">
            No analytics yet — events arrive once visitors hit your published page.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total visits" value={String(data.totalVisits)} />
        <StatCard title={'"Book Now" clicks'} value={String(data.bookNowClicks)} />
        <StatCard title={'"Book Now" hovers'} value={String(data.bookNowHovers)} />
        <StatCard
          title="Click-through rate"
          value={fmtRatio(ctr)}
          hint={`${ctr.numerator} of ${ctr.denominator} visits`}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily visitors</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyVisitorsChart data={data.daily} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>&ldquo;Book Now&rdquo; clicks by gender</CardTitle>
          </CardHeader>
          <CardContent>
            <ClicksByGenderChart data={data.clicksByGender} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Visitors by gender</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownChart data={data.visitorsByGender} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Visitors by age group</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownChart data={data.visitorsByAgeGroup} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hover → click</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{fmtRatio(hbc)}</p>
          <p className="text-sm text-muted-foreground">
            of clickers hovered the button at least once ({hbc.numerator} of {hbc.denominator}{' '}
            clicker sessions).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conversion by audience</CardTitle>
        </CardHeader>
        <CardContent>
          <SegmentTable rows={data.segments} />
        </CardContent>
      </Card>
    </section>
  );
}
