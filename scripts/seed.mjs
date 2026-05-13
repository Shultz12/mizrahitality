// Demo seed for Mizrahitality — `pnpm seed` (feature #9, demo-seed).
//
// Creates a one-command demo dataset:
//   • Owner #1 (owner@mizrahitality.test / "mizrahitality") with a published venue,
//     "Hotel Mizrahi" (slug "hotelmizrahi"), all 7 audience-tailored page variants, and
//     ~30 days of realistic historical analytics events so every dashboard figure is non-trivial.
//   • Owner #2 (owner2@mizrahitality.test / "mizrahitality") with a published venue,
//     "The Levant House" (slug "thelevanthouse"), all 7 variants, and ZERO events — so its
//     dashboard shows the zeroed "No data yet" state and a reviewer can watch it fill by
//     visiting :5112/thelevanthouse.
//
// Re-running `pnpm seed` is a clean demo reset: it deletes those two demo owners by email
// (cascading their venue → variants + events + sessions) and recreates everything fresh. It
// never touches any other owner. The reviewer signs in normally — no Session rows are seeded.
//
// Variant copy is committed canned JSON under scripts/seed-data/ — so this script needs NO
// GOOGLE_API_KEY, is offline, and is deterministic (the analytics use a fixed-seed PRNG).
// The only env it reads is DATABASE_URL from apps/owner/.env (run `cp apps/owner/.env.example
// apps/owner/.env` and `pnpm db:migrate` first). It resolves @prisma/client and bcryptjs from
// the workspace's hoisted node_modules (.npmrc `node-linker=hoisted`).

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- locate the repo + load apps/owner/.env --------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SEED_DATA_DIR = join(SCRIPT_DIR, 'seed-data');
const OWNER_ENV_PATH = join(REPO_ROOT, 'apps', 'owner', '.env');

if (!existsSync(OWNER_ENV_PATH)) {
  console.error(`✗ ${OWNER_ENV_PATH} is missing.`);
  console.error(
    '  Run `cp apps/owner/.env.example apps/owner/.env` first, then re-run `pnpm seed`.',
  );
  process.exit(1);
}
try {
  process.loadEnvFile(OWNER_ENV_PATH);
} catch (err) {
  console.error(`✗ Could not read ${OWNER_ENV_PATH}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const RAW_DATABASE_URL = process.env.DATABASE_URL;
if (!RAW_DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set in apps/owner/.env (copy it from .env.example).');
  process.exit(1);
}

// Prisma resolves a relative `file:` SQLite path relative to apps/owner/prisma/schema.prisma; this
// root script's cwd is the repo root, so rewrite a relative URL to an absolute one (forward slashes,
// portable on Windows) to be sure we write the same database the owner app reads.
function resolveDatabaseUrl(url) {
  if (!url.startsWith('file:')) return url;
  const filePath = url.slice('file:'.length);
  if (isAbsolute(filePath)) return url;
  const abs = resolve(REPO_ROOT, 'apps', 'owner', 'prisma', filePath).split('\\').join('/');
  return `file:${abs}`;
}
const DATABASE_URL = resolveDatabaseUrl(RAW_DATABASE_URL);

// --- demo data definitions -------------------------------------------------------------------

const BCRYPT_COST = 10; // matches apps/owner/src/lib/auth.ts BCRYPT_COST
const SLOT_SCHEMA_VERSION = 1; // matches @mizrahitality/contracts copy.ts SLOT_SCHEMA_VERSION

// The 7 visitor variants, in the same deterministic order as @mizrahitality/contracts'
// allVisitorVariants() — restated here because this plain-Node .mjs script can't import the TS
// package. The canned JSON files are validated against the real contract by
// apps/owner/src/__tests__/seed-data.test.ts.
const VISITOR_VARIANTS = [
  'male-18-30',
  'male-31-50',
  'male-50+',
  'female-18-30',
  'female-31-50',
  'female-50+',
  'neutral',
];

const OWNER_1 = {
  email: 'owner@mizrahitality.test',
  password: 'mizrahitality',
  venue: {
    name: 'Hotel Mizrahi',
    slug: 'hotelmizrahi',
    description:
      'Hotel Mizrahi is a grand seaside resort with cool marble halls, palm-lined pools, and suites that open straight onto the Mediterranean. Guests have a private beach, a full spa, and unhurried fine dining a short walk from their room, plus fast Wi-Fi throughout, valet parking, and a 24-hour concierge who handles every detail.',
    imageKind: 'stock',
    imageValue: 'mardan-palace',
    bundlesFile: 'hotel-mizrahi.json',
    withAnalytics: true,
  },
};

const OWNER_2 = {
  email: 'owner2@mizrahitality.test',
  password: 'mizrahitality',
  venue: {
    name: 'The Levant House',
    slug: 'thelevanthouse',
    description:
      'The Levant House is a modern waterfront hotel of glass and natural light, with rooms that look out over the harbor, a rooftop restaurant, and a quiet spa. It offers a heated indoor pool, high-speed Wi-Fi throughout, secure on-site parking, and a calm, attentive team available around the clock.',
    imageKind: 'stock',
    imageValue: 'burj-al-arab',
    bundlesFile: 'the-levant-house.json',
    withAnalytics: false,
  },
};

const DEMO_OWNER_EMAILS = [OWNER_1.email, OWNER_2.email];

// --- historical-analytics parameters (Owner #1's venue only) ---------------------------------

const ANALYTICS_DAYS = 30; // calendar days ending today, bucketed in the server's local timezone
const PRNG_SEED = 0x5eed1234; // fixed → the analytics dataset is reproducible across runs

// Per-day visit count ≈ VISIT_BASE + VISIT_GROWTH·dayIndex, ± VISIT_NOISE; day 0 ≈ 10 → day 29 ≈ 68
// → ~1,100–1,200 `visit` events total with a clearly upward OLS trendline on the daily chart.
const VISIT_BASE = 10;
const VISIT_GROWTH = 2;
const VISIT_NOISE = 0.2; // ±20%

// Visitor-type mix for a visit session.
const NEUTRAL_SHARE = 0.08;
const FEMALE_SHARE = 0.55; // share of the non-neutral sessions that are female
const AGE_18_30_SHARE = 0.3;
const AGE_31_50_SHARE = 0.45; // remaining 0.25 → '50+'

// Per-segment "Book Now" click probability — distinct per segment so the conversion table varies
// (female-31-50 highest, male-50+ lowest); overall click-through ends up ≈ 8–12%.
const CLICK_PROBABILITY = {
  'female-31-50': 0.16,
  'female-18-30': 0.13,
  'female-50+': 0.11,
  'male-18-30': 0.1,
  'male-31-50': 0.08,
  'male-50+': 0.05,
  neutral: 0.09,
};
// A clicking session almost always also fired a hover (feeds the hover→click funnel %); a
// non-clicking session fired one sometimes (so hovers > clicks overall).
const HOVER_GIVEN_CLICK = 0.8;
const HOVER_GIVEN_NO_CLICK = 0.3;

const EVENT_INSERT_CHUNK = 1000; // keep createMany statements well within SQLite's parameter limit

// Venue/owner timestamps: the venue "predates" its analytics history.
const VENUE_PUBLISHED_DAYS_AGO = 31;
const VENUE_CREATED_DAYS_AGO = 32;
const OWNER_CREATED_DAYS_AGO = 32;

// --- small deterministic PRNG (mulberry32) ---------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(PRNG_SEED);

function pickVisitorType() {
  if (rand() < NEUTRAL_SHARE) return 'neutral';
  const gender = rand() < FEMALE_SHARE ? 'female' : 'male';
  const r = rand();
  const age =
    r < AGE_18_30_SHARE ? '18-30' : r < AGE_18_30_SHARE + AGE_31_50_SHARE ? '31-50' : '50+';
  return `${gender}-${age}`;
}

/** A `Date` `daysAgo` days before local midnight today. */
function daysAgoMidnight(daysAgo) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - daysAgo);
  return d;
}

/** Generate the simulated `visit` / `book-now-hover` / `book-now-click` rows for a venue. */
function buildHistoricalEvents(venueId) {
  const events = [];
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let dayIndex = 0; dayIndex < ANALYTICS_DAYS; dayIndex++) {
    const daysAgo = ANALYTICS_DAYS - 1 - dayIndex; // dayIndex 0 → 29 days ago … last → today
    const dayStart = new Date(todayMidnight.getTime());
    dayStart.setDate(dayStart.getDate() - daysAgo);
    const nextDayStart = new Date(dayStart.getTime());
    nextDayStart.setDate(nextDayStart.getDate() + 1);
    const isToday = daysAgo === 0;
    // Cap today's window before "now" (with a little headroom in case the clock ticks mid-run).
    const windowMs = isToday
      ? Math.max(60_000, now.getTime() - dayStart.getTime() - 1_000)
      : nextDayStart.getTime() - dayStart.getTime();

    const expected = VISIT_BASE + VISIT_GROWTH * dayIndex;
    const noiseFactor = 1 - VISIT_NOISE + 2 * VISIT_NOISE * rand(); // [0.8, 1.2)
    const visitCount = Math.max(1, Math.round(expected * noiseFactor));

    for (let i = 0; i < visitCount; i++) {
      const visitorType = pickVisitorType();
      const sessionId = randomUUID();
      const clicked = rand() < (CLICK_PROBABILITY[visitorType] ?? 0.09);
      const hovered = clicked ? rand() < HOVER_GIVEN_CLICK : rand() < HOVER_GIVEN_NO_CLICK;

      // Ordered timestamps within the day: visit ≤ hover ≤ click.
      const count = 1 + (hovered ? 1 : 0) + (clicked ? 1 : 0);
      const offsets = [];
      for (let k = 0; k < count; k++) offsets.push(Math.floor(rand() * windowMs));
      offsets.sort((a, b) => a - b);
      let oi = 0;
      const nextAt = () => new Date(dayStart.getTime() + offsets[oi++]);

      events.push({ venueId, type: 'visit', visitorType, sessionId, createdAt: nextAt() });
      if (hovered) {
        events.push({
          venueId,
          type: 'book-now-hover',
          visitorType,
          sessionId,
          createdAt: nextAt(),
        });
      }
      if (clicked) {
        events.push({
          venueId,
          type: 'book-now-click',
          visitorType,
          sessionId,
          createdAt: nextAt(),
        });
      }
    }
  }
  return events;
}

// --- canned variant copy ---------------------------------------------------------------------

/** Read scripts/seed-data/<file> → `{ "<visitorType>": <CopyBundle>, … }` (7 entries). */
function loadVariantBundles(fileName) {
  const path = join(SEED_DATA_DIR, fileName);
  const byVariant = JSON.parse(readFileSync(path, 'utf8'));
  return VISITOR_VARIANTS.map((visitorType) => {
    const copy = byVariant[visitorType];
    if (!copy) {
      throw new Error(`${fileName} is missing the "${visitorType}" copy bundle`);
    }
    return { visitorType, content: { schemaVersion: SLOT_SCHEMA_VERSION, copy } };
  });
}

// --- the seed ---------------------------------------------------------------------------------

function isMissingTableError(err) {
  if (!err) return false;
  if (err.code === 'P2021') return true; // Prisma: "The table does not exist in the current database"
  const message = String(err.message ?? err);
  return /no such table/i.test(message) || /does not exist in the current database/i.test(message);
}

async function seedOwner(prisma, bcrypt, def, log) {
  const v = def.venue;
  const variants = loadVariantBundles(v.bundlesFile);
  const passwordHash = await bcrypt.hash(def.password, BCRYPT_COST);

  const owner = await prisma.owner.create({
    data: {
      email: def.email,
      passwordHash,
      createdAt: daysAgoMidnight(OWNER_CREATED_DAYS_AGO),
      venue: {
        create: {
          name: v.name,
          slug: v.slug,
          description: v.description,
          imageKind: v.imageKind,
          imageValue: v.imageValue,
          publishState: 'published',
          publishedAt: daysAgoMidnight(VENUE_PUBLISHED_DAYS_AGO),
          slugLockedAt: daysAgoMidnight(VENUE_PUBLISHED_DAYS_AGO),
          createdAt: daysAgoMidnight(VENUE_CREATED_DAYS_AGO),
          variants: { create: variants },
        },
      },
    },
    include: { venue: true },
  });
  const venueId = owner.venue.id;
  log(`  • ${def.email} → venue "${v.name}" (slug "${v.slug}"), ${variants.length} page variants`);

  let eventCount = 0;
  if (v.withAnalytics) {
    const events = buildHistoricalEvents(venueId);
    for (let i = 0; i < events.length; i += EVENT_INSERT_CHUNK) {
      await prisma.event.createMany({ data: events.slice(i, i + EVENT_INSERT_CHUNK) });
    }
    eventCount = events.length;
    log(`    ↳ ${eventCount} historical analytics events over the last ${ANALYTICS_DAYS} days`);
  } else {
    log(`    ↳ 0 events (dashboard starts in the "No data yet" state)`);
  }
  return { email: def.email, slug: v.slug, eventCount };
}

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const bcrypt = await import('bcryptjs');

  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    console.log('Seeding demo data…');

    // Reset: drop the two demo owners (cascades venue → variants + events + sessions). Never
    // touches any other account.
    const removed = await prisma.owner.deleteMany({ where: { email: { in: DEMO_OWNER_EMAILS } } });
    if (removed.count > 0) {
      console.log(`  • Reset: removed ${removed.count} existing demo owner(s)`);
    }

    const r1 = await seedOwner(prisma, bcrypt, OWNER_1, console.log);
    const r2 = await seedOwner(prisma, bcrypt, OWNER_2, console.log);

    console.log('');
    console.log('Done. Demo accounts (sign in at http://localhost:5111):');
    console.log(
      `  1. ${r1.email} / ${OWNER_1.password}  →  "${OWNER_1.venue.name}"  ·  :5112/${r1.slug}  ·  ${r1.eventCount} events`,
    );
    console.log(
      `  2. ${r2.email} / ${OWNER_2.password}  →  "${OWNER_2.venue.name}"  ·  :5112/${r2.slug}  ·  ${r2.eventCount} events`,
    );
    console.log('Re-run `pnpm seed` (with the dev servers stopped) to reset the demo data.');
  } catch (err) {
    if (isMissingTableError(err)) {
      console.error(
        '✗ The database has no tables yet. Run `pnpm db:migrate` first, then re-run `pnpm seed`.',
      );
    } else {
      console.error('✗ Seed failed:', err instanceof Error ? (err.stack ?? err.message) : err);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
