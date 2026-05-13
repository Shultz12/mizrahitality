// The pure analytics aggregator for the owner dashboard (feature #7). Takes a venue's recorded
// `Event` rows — narrowed to the columns aggregation needs — and returns a fully-computed
// `DashboardData`: every figure REQ-8 asks for (totals, the last-30-days daily-visitors series + an
// OLS trendline, the gender / age-group breakdowns, "Book Now" clicks-by-gender, the click-through %
// and hover→click funnel %, and the 6-row gender×age conversion table). Zero DB / I-O — the caller
// (`lib/dashboard-data.ts`) does the Prisma query; this is unit-tested directly (mirrors
// `lib/rendered-page.ts` / `lib/slug.ts`).
//
// `DashboardData` and friends are owner-internal — the same call already made for
// `lib/page-variant.ts` / `lib/rendered-page.ts` — so they live here, not in `@mizrahitality/contracts`.
//
// Conventions baked in (all overridable via `ComputeDashboardArgs`):
//   • every figure is all-time over the venue's events except `daily`, which is the last 30 days;
//   • daily buckets are computed in the server process's local timezone (a localhost demo — "the day
//     the owner sees on their machine"); events older than the window still count in the all-time totals;
//   • `neutral` events count in the totals / daily series / click-through %, but get no bar in the
//     gender / age-group / clicks-by-gender charts (so when there are neutral events the bars sum to
//     less than the totals); the conversion table prepends a single "Unknown (Neutral)" row so its
//     visits/clicks sum back to the totals;
//   • "total visitors" == "total visits" == the count of `visit` events (honest given `sessionId` is
//     optional — a distinct-session count would systematically undercount).

import {
  AGE_GROUPS,
  NEUTRAL_VISITOR_TYPE,
  VISITOR_GENDERS,
  isAnalyticsEventType,
  isVisitorType,
  type AgeGroup,
  type VisitorGender,
} from '@mizrahitality/contracts';

/** An `Event` row narrowed to what aggregation needs. */
export interface AnalyticsEventInput {
  /** Expected to be an `AnalyticsEventType`; unrecognised values are defensively ignored. */
  type: string;
  /** Expected to be a `VisitorType`; unrecognised values are defensively ignored. */
  visitorType: string;
  sessionId: string | null;
  createdAt: Date;
}

export interface ComputeDashboardArgs {
  events: AnalyticsEventInput[];
  /** "Today" — the daily window ends on this date's day. Default `new Date()`. */
  now?: Date;
  /** How many calendar days the daily-visitors series spans. Default 30. */
  dailyWindowDays?: number;
  /** Which timezone the daily buckets are computed in. Default `'local'` (the server process's). */
  timeZone?: 'utc' | 'local';
  /** Whether `neutral` events get their own bar in the breakdown charts. Default `'omit'`. */
  neutralInBreakdowns?: 'omit' | 'bucket';
}

/** A counted ratio — `value` is `null` when the denominator is 0 (renders as `—`). */
export interface Ratio {
  numerator: number;
  denominator: number;
  value: number | null;
}

/** One day in the daily-visitors series. */
export interface DailyPoint {
  /** `'YYYY-MM-DD'` in the chosen timezone. */
  date: string;
  /** Short human label, e.g. `'May 3'`. */
  label: string;
  visits: number;
  /** The OLS-predicted visit count for this day, or `null` when there's no trendline. */
  trend: number | null;
}

export interface Trendline {
  slope: number | null;
  intercept: number | null;
  direction: 'rising' | 'falling' | 'flat' | null;
}

/** One bar in a gender / age-group breakdown chart. `key` is a `VisitorGender` | `AgeGroup` | `'neutral'`. */
export interface BreakdownBar {
  key: string;
  label: string;
  count: number;
}

/** One row of the gender×age conversion table — always male/female × the 3 age groups. */
export interface SegmentRow {
  gender: VisitorGender;
  ageGroup: AgeGroup;
  visitors: number;
  clicks: number;
  clickRate: Ratio;
}

/** The conversion table's leading "Unknown (Neutral)" row — visits / clicks from `neutral` events. */
export interface NeutralSegment {
  visitors: number;
  clicks: number;
  clickRate: Ratio;
}

export interface DashboardData {
  totalVisits: number;
  bookNowClicks: number;
  bookNowHovers: number;
  /** `bookNowClicks ÷ totalVisits`. */
  clickThroughRate: Ratio;
  /**
   * Of the sessions that produced ≥1 `book-now-click`, the share that also produced ≥1
   * `book-now-hover` (order ignored). Events with no `sessionId` are excluded from this metric only.
   */
  hoverBeforeClickRate: Ratio;
  /** Exactly `dailyWindowDays` entries, ascending, ending on `now`'s day, zero-filled. */
  daily: DailyPoint[];
  trendline: Trendline;
  /** `visit` events by gender — 2 bars (male, female); +`neutral` iff `neutralInBreakdowns === 'bucket'`. */
  visitorsByGender: BreakdownBar[];
  /** `visit` events by age group — 3 bars; +`neutral` iff `'bucket'`. */
  visitorsByAgeGroup: BreakdownBar[];
  /** `book-now-click` events by gender — 2 bars; +`neutral` iff `'bucket'`. */
  clicksByGender: BreakdownBar[];
  /** Exactly 6 rows, in `VISITOR_GENDERS × AGE_GROUPS` order (= `allVisitorVariants()` minus `neutral`). */
  segments: SegmentRow[];
  /** Aggregated `neutral` visits/clicks — rendered as the conversion table's first "Unknown (Neutral)" row. */
  neutralSegment: NeutralSegment;
  /** `events.length === 0` — drives the "no analytics yet" copy. */
  isEmpty: boolean;
}

// ---------------------------------------------------------------------------
// Small pure helpers.
// ---------------------------------------------------------------------------

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** The `'YYYY-MM-DD'` calendar-day key of `date` in the chosen timezone. */
function dayKey(date: Date, timeZone: 'utc' | 'local'): string {
  if (timeZone === 'utc') return date.toISOString().slice(0, 10);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** `'2026-05-03'` → `{ year: 2026, month: 5, day: 3 }`. Keys here are always our own well-formed output. */
function parseDayKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split('-');
  return { year: Number(y), month: Number(m), day: Number(d) };
}

/** `'2026-05-03'` → `'May 3'`. Built from a fixed month table — no locale / ICU dependency. */
function labelForDayKey(key: string): string {
  const { month, day } = parseDayKey(key);
  return `${MONTH_ABBR[month - 1] ?? ''} ${day}`;
}

/** The `days` consecutive `'YYYY-MM-DD'` keys ending at (and including) `endKey`, ascending. */
function windowDayKeys(endKey: string, days: number): string[] {
  const { year, month, day } = parseDayKey(endKey);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    // Date arithmetic in UTC handles month/year boundaries; `endKey` already carried the tz choice.
    const dt = new Date(Date.UTC(year, month - 1, day - i));
    keys.push(`${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`);
  }
  return keys;
}

function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

function genderLabel(gender: VisitorGender): string {
  return gender === 'male' ? 'Male' : 'Female';
}

/**
 * Split a (valid) visitor type into its gender + age group, or `null` for `neutral`. Matched against
 * `${gender}-${ageGroup}` over `VISITOR_GENDERS`×`AGE_GROUPS` — a plain `split('-')` wouldn't do, the
 * age group itself contains a hyphen (`18-30`, `50+`).
 */
function splitVisitorType(
  visitorType: string,
): { gender: VisitorGender; ageGroup: AgeGroup } | null {
  for (const gender of VISITOR_GENDERS) {
    for (const ageGroup of AGE_GROUPS) {
      if (visitorType === `${gender}-${ageGroup}`) return { gender, ageGroup };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The aggregator.
// ---------------------------------------------------------------------------

/**
 * Compute the full owner-dashboard payload from a venue's events. Always returns a fully-formed
 * object — `computeDashboard({ events: [] })` is every count `0`, every ratio `value: null`, a 30-day
 * all-zero `daily` series, a flat (slope `0`) trendline, zeroed breakdown bars, 6 zeroed segment rows,
 * `isEmpty: true`. Never throws.
 */
export function computeDashboard(args: ComputeDashboardArgs): DashboardData {
  const {
    events,
    now = new Date(),
    dailyWindowDays = 30,
    timeZone = 'local',
    neutralInBreakdowns = 'omit',
  } = args;

  // Belt-and-braces: the #6 POST route already validates strictly, but silently drop anything that
  // isn't a known event type with one of the 7 visitor types so a bad row can never skew a figure.
  const valid = events.filter((e) => isAnalyticsEventType(e.type) && isVisitorType(e.visitorType));

  const visitEvents = valid.filter((e) => e.type === 'visit');
  const clickEvents = valid.filter((e) => e.type === 'book-now-click');
  const hoverEvents = valid.filter((e) => e.type === 'book-now-hover');

  const totalVisits = visitEvents.length;
  const bookNowClicks = clickEvents.length;
  const bookNowHovers = hoverEvents.length;
  const clickThroughRate = ratio(bookNowClicks, totalVisits);

  // --- hover → click funnel: per (non-null) session, did it click? did it also hover? -------------
  const sessions = new Map<string, { hover: boolean; click: boolean }>();
  for (const e of valid) {
    if (e.sessionId === null) continue; // null-session events excluded from this metric only
    const s = sessions.get(e.sessionId) ?? { hover: false, click: false };
    if (e.type === 'book-now-hover') s.hover = true;
    if (e.type === 'book-now-click') s.click = true;
    sessions.set(e.sessionId, s);
  }
  let clickerSessions = 0;
  let hoveredClickerSessions = 0;
  for (const s of sessions.values()) {
    if (!s.click) continue;
    clickerSessions += 1;
    if (s.hover) hoveredClickerSessions += 1;
  }
  const hoverBeforeClickRate = ratio(hoveredClickerSessions, clickerSessions);

  // --- daily-visitors series + OLS trendline -----------------------------------------------------
  const visitsByDay = new Map<string, number>();
  for (const e of visitEvents) {
    const key = dayKey(e.createdAt, timeZone);
    visitsByDay.set(key, (visitsByDay.get(key) ?? 0) + 1);
  }
  const keys = windowDayKeys(dayKey(now, timeZone), dailyWindowDays);
  const dailyVisits = keys.map((key) => visitsByDay.get(key) ?? 0);

  const trendValues = olsPredictions(dailyVisits);
  const trendline = olsTrendline(dailyVisits);
  const daily: DailyPoint[] = keys.map((key, i) => ({
    date: key,
    label: labelForDayKey(key),
    visits: dailyVisits[i] ?? 0,
    trend: trendValues[i] ?? null,
  }));

  // --- breakdown bars (visit events by gender / age group; click events by gender) ---------------
  const visitsByGender = new Map<VisitorGender, number>(VISITOR_GENDERS.map((g) => [g, 0]));
  const visitsByAge = new Map<AgeGroup, number>(AGE_GROUPS.map((a) => [a, 0]));
  let neutralVisits = 0;
  for (const e of visitEvents) {
    const split = splitVisitorType(e.visitorType);
    if (!split) {
      neutralVisits += 1;
      continue;
    }
    visitsByGender.set(split.gender, (visitsByGender.get(split.gender) ?? 0) + 1);
    visitsByAge.set(split.ageGroup, (visitsByAge.get(split.ageGroup) ?? 0) + 1);
  }
  const clicksByGenderMap = new Map<VisitorGender, number>(VISITOR_GENDERS.map((g) => [g, 0]));
  let neutralClicks = 0;
  for (const e of clickEvents) {
    const split = splitVisitorType(e.visitorType);
    if (!split) {
      neutralClicks += 1;
      continue;
    }
    clicksByGenderMap.set(split.gender, (clicksByGenderMap.get(split.gender) ?? 0) + 1);
  }

  const neutralBar = (count: number): BreakdownBar => ({
    key: NEUTRAL_VISITOR_TYPE,
    label: 'Neutral',
    count,
  });
  const withNeutral = (bars: BreakdownBar[], count: number): BreakdownBar[] =>
    neutralInBreakdowns === 'bucket' ? [...bars, neutralBar(count)] : bars;

  const visitorsByGender = withNeutral(
    VISITOR_GENDERS.map((g) => ({
      key: g,
      label: genderLabel(g),
      count: visitsByGender.get(g) ?? 0,
    })),
    neutralVisits,
  );
  const visitorsByAgeGroup = withNeutral(
    AGE_GROUPS.map((a) => ({ key: a, label: a, count: visitsByAge.get(a) ?? 0 })),
    neutralVisits,
  );
  const clicksByGender = withNeutral(
    VISITOR_GENDERS.map((g) => ({
      key: g,
      label: genderLabel(g),
      count: clicksByGenderMap.get(g) ?? 0,
    })),
    neutralClicks,
  );

  // --- the 6-row gender×age conversion table + the leading neutral row --------------------------
  const segments: SegmentRow[] = [];
  for (const gender of VISITOR_GENDERS) {
    for (const ageGroup of AGE_GROUPS) {
      const vt = `${gender}-${ageGroup}`;
      const visitors = visitEvents.filter((e) => e.visitorType === vt).length;
      const clicks = clickEvents.filter((e) => e.visitorType === vt).length;
      segments.push({ gender, ageGroup, visitors, clicks, clickRate: ratio(clicks, visitors) });
    }
  }
  const neutralSegment: NeutralSegment = {
    visitors: neutralVisits,
    clicks: neutralClicks,
    clickRate: ratio(neutralClicks, neutralVisits),
  };

  return {
    totalVisits,
    bookNowClicks,
    bookNowHovers,
    clickThroughRate,
    hoverBeforeClickRate,
    daily,
    trendline,
    visitorsByGender,
    visitorsByAgeGroup,
    clicksByGender,
    segments,
    neutralSegment,
    isEmpty: events.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Ordinary-least-squares linear regression over `y[i]` indexed `x = 0..n-1`.
// ---------------------------------------------------------------------------

interface OlsFit {
  slope: number;
  intercept: number;
}

/** OLS fit, or `null` when there's nothing to fit (< 2 points, or a degenerate x-spread). */
function olsFit(y: number[]): OlsFit | null {
  const n = y.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let x = 0; x < n; x++) {
    const yx = y[x] ?? 0;
    sx += x;
    sy += yx;
    sxy += x * yx;
    sxx += x * x;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null; // can't happen for x = 0..n-1 with n ≥ 2, but be safe
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function olsTrendline(y: number[]): Trendline {
  const fit = olsFit(y);
  if (!fit) return { slope: null, intercept: null, direction: null };
  const direction = fit.slope > 1e-9 ? 'rising' : fit.slope < -1e-9 ? 'falling' : 'flat';
  return { slope: fit.slope, intercept: fit.intercept, direction };
}

/** The predicted value at each index `0..n-1` (`null` everywhere when there's no fit). */
function olsPredictions(y: number[]): (number | null)[] {
  const fit = olsFit(y);
  if (!fit) return y.map(() => null);
  return y.map((_, x) => fit.slope * x + fit.intercept);
}
