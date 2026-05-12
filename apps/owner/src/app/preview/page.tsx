import type { ReactNode } from 'react';
import Link from 'next/link';
import { parseVisitorType } from '@mizrahitality/contracts';
import { requireOwner } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildRenderedPage } from '@/lib/rendered-page';
import { PublishedPage } from '@/components/published-page/published-page';

// `/preview` — the signed-in owner's own server-rendered published page (no slug in the URL; one
// venue per owner). Owner-scoped: `requireOwner()` redirects to /sign-in when signed out. Defaults
// to the `neutral` variant; `?type=<visitor-type>` previews any of the other 6 (anything
// unrecognised → `neutral`, via `parseVisitorType`). Reading `cookies()` (inside `requireOwner`)
// and `searchParams` already makes this route dynamic — no AI runs here (variants are precomputed
// at publish). The customer-facing visitor site + the hover-out demo tab are feature #8.

/** A centred, link-only notice for the not-published / not-renderable cases (no bare 404). */
function PreviewNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[#2C2824]" style={{ fontFamily: 'var(--font-inter)' }}>
        {children}
      </p>
      <Link
        href="/builder"
        className="rounded bg-[#E85D4A] px-6 py-2 text-[14px] font-semibold uppercase tracking-[0.1em] text-white transition-all hover:scale-[1.03]"
      >
        Go to the builder
      </Link>
    </div>
  );
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const owner = await requireOwner();

  if (!owner.venue || owner.venue.publishState !== 'published') {
    return <PreviewNotice>Publish your venue to see your page.</PreviewNotice>;
  }

  const venue = await prisma.venue.findUnique({
    where: { id: owner.venue.id },
    include: { variants: true },
  });
  if (!venue) {
    // Shouldn't happen — the owner row said there's a published venue.
    return <PreviewNotice>Your page is unavailable right now — try re-publishing.</PreviewNotice>;
  }

  const typeParam = (await searchParams).type;
  const requestedType = parseVisitorType(Array.isArray(typeParam) ? typeParam[0] : typeParam);
  const built = buildRenderedPage({ venue, variants: venue.variants, requestedType });
  if (!built.ok) {
    return <PreviewNotice>Your page is unavailable right now — try re-publishing.</PreviewNotice>;
  }

  return <PublishedPage page={built.value} />;
}
