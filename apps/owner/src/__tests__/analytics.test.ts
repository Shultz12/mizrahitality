import { describe, expect, it } from 'vitest';
import { computeDashboard, type AnalyticsEventInput } from '@/lib/analytics';

// `computeDashboard` is pure (no DB / I-O) — exercised here directly with synthetic event rows,
// like `rendered-page.test.ts` / `validation.test.ts`. All cases that touch the daily series pass an
// explicit `now` + `timeZone: 'utc'` so they don't depend on the process timezone (the page exercises
// the default `'local'` path implicitly).

function ev(
  type: string,
  visitorType: string,
  isoDate: string,
  sessionId: string | null = null,
): AnalyticsEventInput {
  return { type, visitorType, sessionId, createdAt: new Date(isoDate) };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('computeDashboard — empty input', () => {
  it('returns a fully-formed zeroed object, never an error', () => {
    const d = computeDashboard({
      events: [],
      now: new Date('2026-05-12T12:00:00Z'),
      timeZone: 'utc',
    });

    expect(d.totalVisits).toBe(0);
    expect(d.bookNowClicks).toBe(0);
    expect(d.bookNowHovers).toBe(0);
    expect(d.clickThroughRate.value).toBeNull();
    expect(d.hoverBeforeClickRate.value).toBeNull();

    expect(d.daily).toHaveLength(30);
    expect(d.daily.every((p) => p.visits === 0)).toBe(true);
    expect(d.daily.at(-1)?.date).toBe('2026-05-12');

    // 30 days, all zero ⇒ OLS yields a flat line (slope exactly 0), not a null trendline.
    expect(d.trendline.slope).toBe(0);
    expect(d.trendline.direction).toBe('flat');

    expect(d.visitorsByGender).toHaveLength(2);
    expect(d.visitorsByAgeGroup).toHaveLength(3);
    expect(d.clicksByGender).toHaveLength(2);
    expect(d.visitorsByGender.every((b) => b.count === 0)).toBe(true);

    expect(d.segments).toHaveLength(6);
    expect(d.segments.every((s) => s.clickRate.value === null)).toBe(true);

    expect(d.isEmpty).toBe(true);
  });
});

describe('computeDashboard — hand-reconcilable fixture', () => {
  // Window: 2026-05-01 .. 2026-05-30 (now = 2026-05-30T12:00:00Z, UTC); day 2026-05-DD = index DD−1.
  const now = new Date('2026-05-30T12:00:00Z');
  const events: AnalyticsEventInput[] = [
    // visit events (drive the daily series, breakdowns, segments)
    ev('visit', 'male-18-30', '2026-05-26T10:00:00Z', 'a'), // idx 25
    ev('visit', 'female-31-50', '2026-05-26T11:00:00Z', 'b'), // idx 25  → 2 visits on 05-26
    // 2026-05-27 (idx 26): no visits — the gap day
    ev('visit', 'female-31-50', '2026-05-28T09:00:00Z', 'c'), // idx 27
    ev('visit', 'neutral', '2026-05-28T09:30:00Z', null), // idx 27 (neutral visit, null session)
    ev('visit', 'female-18-30', '2026-05-28T12:00:00Z', 'e'), // idx 27  → 3 visits on 05-28
    ev('visit', 'female-50+', '2026-05-30T08:00:00Z', 'd'), // idx 29  → 1 visit on 05-30
    // 2026-05-29 (idx 28): no visits
    // hover events
    ev('book-now-hover', 'male-18-30', '2026-05-26T10:01:00Z', 'a'), // session a hovered
    ev('book-now-hover', 'female-50+', '2026-05-30T08:01:00Z', 'b'), // session b hovered (never clicks)
    // click events
    ev('book-now-click', 'male-18-30', '2026-05-26T10:03:00Z', 'a'), // session a: hovered + clicked
    ev('book-now-click', 'female-50+', '2026-05-30T08:03:00Z', 'd'), // session d: clicked, did NOT hover
    ev('book-now-click', 'female-31-50', '2026-05-28T09:05:00Z', null), // null-session click
  ];

  it('counts visits / clicks / hovers and the click-through ratio', () => {
    const d = computeDashboard({ events, now, timeZone: 'utc' });
    expect(d.totalVisits).toBe(6);
    expect(d.bookNowClicks).toBe(3);
    expect(d.bookNowHovers).toBe(2);
    expect(d.clickThroughRate).toEqual({ numerator: 3, denominator: 6, value: 0.5 });
    expect(d.isEmpty).toBe(false);
  });

  it('computes the hover→click funnel over click-bearing sessions only — null-session events excluded from (b) only', () => {
    const d = computeDashboard({ events, now, timeZone: 'utc' });
    // Sessions: a {hover,click}, b {hover}, c {}, d {click}, e {}.
    // Clicker sessions = {a, d} → denom 2; of those that also hovered = {a} → num 1.
    // The null-session click still counts in bookNowClicks (3 above) but never in this funnel.
    expect(d.hoverBeforeClickRate).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it('builds the 30-day daily series, zero-filled across the gap day', () => {
    const d = computeDashboard({ events, now, timeZone: 'utc' });
    expect(d.daily).toHaveLength(30);
    expect(d.daily.at(0)?.date).toBe('2026-05-01');
    expect(d.daily.at(0)?.label).toBe('May 1');
    expect(d.daily.at(-1)?.date).toBe('2026-05-30');

    const by = (date: string) => d.daily.find((p) => p.date === date);
    expect(by('2026-05-26')).toMatchObject({ visits: 2, label: 'May 26' });
    expect(by('2026-05-27')?.visits).toBe(0); // the gap day
    expect(by('2026-05-28')?.visits).toBe(3);
    expect(by('2026-05-29')?.visits).toBe(0);
    expect(by('2026-05-30')?.visits).toBe(1);
  });

  it('fits an OLS trendline over the daily series', () => {
    const d = computeDashboard({ events, now, timeZone: 'utc' });
    // y has 2 at idx 25, 3 at idx 27, 1 at idx 29, 0 elsewhere over n=30.
    // Σx=435, Σx²=8555, Σy=6, Σxy=25·2+27·3+29·1=160.
    // slope = (30·160 − 435·6) / (30·8555 − 435²) = 2190 / 67425.
    expect(d.trendline.slope).toBe(2190 / 67425);
    expect(d.trendline.direction).toBe('rising');
    // every daily point carries the predicted value
    expect(d.daily.every((p) => typeof p.trend === 'number')).toBe(true);
  });

  it('breaks visits/clicks down by gender & age group — neutral omitted by default, so bars undersum the totals', () => {
    const d = computeDashboard({ events, now, timeZone: 'utc' });

    expect(d.visitorsByGender).toEqual([
      { key: 'male', label: 'Male', count: 1 },
      { key: 'female', label: 'Female', count: 4 },
    ]);
    // 1 + 4 = 5, but totalVisits = 6: the 1 neutral visit is intentionally not a bar.
    expect(sum(d.visitorsByGender.map((b) => b.count))).toBe(5);
    expect(d.totalVisits).toBe(6);

    expect(d.visitorsByAgeGroup).toEqual([
      { key: '18-30', label: '18-30', count: 2 },
      { key: '31-50', label: '31-50', count: 2 },
      { key: '50+', label: '50+', count: 1 },
    ]);
    expect(sum(d.visitorsByAgeGroup.map((b) => b.count))).toBe(5);

    expect(d.clicksByGender).toEqual([
      { key: 'male', label: 'Male', count: 1 },
      { key: 'female', label: 'Female', count: 2 },
    ]);
  });

  it('appends a neutral bar — and the bars sum to the totals — when neutralInBreakdowns is "bucket"', () => {
    const d = computeDashboard({ events, now, timeZone: 'utc', neutralInBreakdowns: 'bucket' });

    expect(d.visitorsByGender).toHaveLength(3);
    expect(d.visitorsByGender[2]).toEqual({ key: 'neutral', label: 'Neutral', count: 1 });
    expect(sum(d.visitorsByGender.map((b) => b.count))).toBe(d.totalVisits);

    expect(d.visitorsByAgeGroup).toHaveLength(4);
    expect(d.visitorsByAgeGroup[3]).toEqual({ key: 'neutral', label: 'Neutral', count: 1 });
    expect(sum(d.visitorsByAgeGroup.map((b) => b.count))).toBe(d.totalVisits);

    expect(d.clicksByGender).toHaveLength(3);
    expect(d.clicksByGender[2]).toEqual({ key: 'neutral', label: 'Neutral', count: 0 });
  });

  it('produces 6 conversion rows in allVisitorVariants()-minus-neutral order, with 100% / 0% / — cases', () => {
    const d = computeDashboard({ events, now, timeZone: 'utc' });
    expect(d.segments.map((s) => `${s.gender}-${s.ageGroup}`)).toEqual([
      'male-18-30',
      'male-31-50',
      'male-50+',
      'female-18-30',
      'female-31-50',
      'female-50+',
    ]);

    const seg = (g: string, a: string) =>
      d.segments.find((s) => s.gender === g && s.ageGroup === a)!;

    expect(seg('male', '18-30')).toMatchObject({ visitors: 1, clicks: 1 });
    expect(seg('male', '18-30').clickRate.value).toBe(1); // 100%

    expect(seg('female', '18-30')).toMatchObject({ visitors: 1, clicks: 0 });
    expect(seg('female', '18-30').clickRate.value).toBe(0); // 0% — visitors > 0, no clicks

    expect(seg('male', '31-50')).toMatchObject({ visitors: 0, clicks: 0 });
    expect(seg('male', '31-50').clickRate.value).toBeNull(); // — — zero denominator

    expect(seg('female', '31-50')).toMatchObject({ visitors: 2, clicks: 1 });
    expect(seg('female', '31-50').clickRate.value).toBe(0.5);
  });
});

describe('computeDashboard — 30-day window edges', () => {
  it('keeps a 30-day window ending today; old events fall out of the daily series but stay in the totals', () => {
    const now = new Date('2026-05-30T12:00:00Z');
    const d = computeDashboard({
      events: [
        ev('visit', 'male-18-30', '2026-05-25T10:00:00Z', 'x'), // 5 days ago — in the window
        ev('visit', 'female-50+', '2026-04-20T10:00:00Z', 'y'), // 40 days ago — out of the window
      ],
      now,
      timeZone: 'utc',
    });

    expect(d.daily).toHaveLength(30);
    expect(d.daily.at(0)?.date).toBe('2026-05-01'); // now − 29 days
    expect(d.daily.at(-1)?.date).toBe('2026-05-30'); // now's day

    expect(d.daily.find((p) => p.date === '2026-05-25')?.visits).toBe(1);
    expect(d.daily.some((p) => p.date === '2026-04-20')).toBe(false);

    expect(d.totalVisits).toBe(2); // the 40-day-old visit still counts here
  });
});

describe('computeDashboard — UTC bucketing', () => {
  it('puts 23:30Z and the next day 00:30Z on consecutive day keys', () => {
    const d = computeDashboard({
      events: [
        ev('visit', 'neutral', '2026-05-10T23:30:00Z', null),
        ev('visit', 'neutral', '2026-05-11T00:30:00Z', null),
      ],
      now: new Date('2026-05-12T00:00:00Z'),
      timeZone: 'utc',
    });

    const i10 = d.daily.findIndex((p) => p.date === '2026-05-10');
    const i11 = d.daily.findIndex((p) => p.date === '2026-05-11');
    expect(i11).toBe(i10 + 1);
    expect(d.daily.find((p) => p.date === '2026-05-10')?.visits).toBe(1);
    expect(d.daily.find((p) => p.date === '2026-05-11')?.visits).toBe(1);
  });
});

describe('computeDashboard — defensive guards', () => {
  it('silently drops events with an unknown type or an unknown visitor type', () => {
    const d = computeDashboard({
      events: [
        ev('visit', 'male-18-30', '2026-05-12T10:00:00Z', 'a'),
        ev('garbage', 'male-18-30', '2026-05-12T10:05:00Z', 'a'),
        ev('visit', 'martian', '2026-05-12T10:10:00Z', 'b'),
      ],
      now: new Date('2026-05-12T12:00:00Z'),
      timeZone: 'utc',
    });

    expect(d.totalVisits).toBe(1);
    expect(d.bookNowClicks).toBe(0);
    expect(d.bookNowHovers).toBe(0);
    expect(d.visitorsByGender).toEqual([
      { key: 'male', label: 'Male', count: 1 },
      { key: 'female', label: 'Female', count: 0 },
    ]);
    expect(d.isEmpty).toBe(false); // 3 raw events — `isEmpty` is `events.length === 0`
  });
});
