'use client';

// Live-updating wrapper around the analytics layout (previously inlined in `dashboard/page.tsx`).
// Receives an initial `DashboardData` snapshot from the Server Component, then polls
// `getLiveDashboardAction()` every 500 ms — paused when the tab is hidden, with an in-flight guard
// that skips ticks until the previous fetch returns (protects against pile-up on slow DB calls).
// Swaps props into the existing recharts components in place — no router refresh, no remount, no
// chart flicker.

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard, fmtRatio } from '@/components/dashboard/stat-card';
import { DailyVisitorsChart } from '@/components/dashboard/daily-visitors-chart';
import { ClicksByGenderChart } from '@/components/dashboard/clicks-by-gender-chart';
import { BreakdownChart } from '@/components/dashboard/breakdown-chart';
import { SegmentTable } from '@/components/dashboard/segment-table';
import { getLiveDashboardAction } from '@/lib/dashboard-actions';
import type { DashboardData } from '@/lib/analytics';

const POLL_MS = 500;

export function DashboardLive({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const next = await getLiveDashboardAction();
        if (!cancelled && next) setData(next);
      } catch {
        // Best-effort polling — swallow transient errors and try again next tick.
      } finally {
        inFlight.current = false;
      }
    }

    function start() {
      if (timer != null) return;
      timer = setInterval(tick, POLL_MS);
      void tick();
    }
    function stop() {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') start();
      else stop();
    }

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const ctr = data.clickThroughRate;
  const hbc = data.hoverBeforeClickRate;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">Analytics</h2>
          <LiveDot />
        </div>
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
          <CardTitle>Hover &rarr; click</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="font-heading text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {fmtRatio(hbc)}
          </p>
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
          <SegmentTable rows={data.segments} neutral={data.neutralSegment} />
        </CardContent>
      </Card>
    </section>
  );
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      Live
    </span>
  );
}
