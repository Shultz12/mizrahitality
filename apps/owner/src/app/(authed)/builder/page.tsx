import { requireOwner } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isAiConfigured } from '@/lib/ai';
import { env } from '@/lib/env';
import { BuilderShell } from '@/components/builder/builder-shell';
import { BuilderForm } from '@/components/builder/builder-form';
import { VenuePreview } from '@/components/builder/venue-preview';
import { GeneratedPages } from '@/components/builder/generated-pages';

// The venue builder — the owner's entire input surface (name → derived slug, description, image)
// plus Publish (generates the 7 AI-tailored copy bundles) and a read-only "Generated pages" list.
// Server Component: loads the owner's single venue (with its variant rows, after publish) and
// hands it to <BuilderShell>, the client wrapper that owns both forms' useActionState hooks and
// renders the sticky top-right action bar (Save Changes / Re-publish). The forms themselves stay
// where they were; only the buttons + status messages moved to the bar.
export default async function BuilderPage() {
  const owner = await requireOwner();
  // The form & preview only need the scalar columns; the variants list needs the rows — one extra
  // scoped query rather than widening the hot `requireOwner()` to load 7 JSON blobs every render.
  const venue = owner.venue
    ? await prisma.venue.findUnique({ where: { id: owner.venue.id }, include: { variants: true } })
    : null;

  // Auto-heal a venue stuck in `'publishing'` from a crashed pipeline. The pipeline normally
  // reverts publishState in its catch block, but a dev-server reload or `ECONNRESET` during a
  // back-off can kill it mid-flight, leaving the in-flight marker on disk. If the venue still
  // has all 7 variant rows AND a `publishedAt`, it was published successfully before the crashed
  // run — the live data hasn't actually changed (the all-or-nothing transaction guarantees it),
  // so flip it back to `'published'` so the Generated-pages list shows its Visit live + Regenerate
  // buttons again.
  if (
    venue &&
    venue.publishState === 'publishing' &&
    venue.publishedAt &&
    venue.variants.length === 7
  ) {
    await prisma.venue.update({
      where: { id: venue.id },
      data: { publishState: 'published' },
    });
    venue.publishState = 'published';
  }

  const aiConfigured = isAiConfigured();
  // Derive `published` from the actual data driving the UI (7 stored variants + a publishedAt
  // timestamp) rather than the publishState column alone — that way the per-variant Visit live +
  // Regenerate buttons survive any transient state-machine hiccup even if the auto-heal above
  // somehow misses a case.
  const published = !!venue && venue.publishedAt !== null && venue.variants.length === 7;
  const customerSiteUrl = venue
    ? `${env.CUSTOMER_BASE_URL}/${encodeURIComponent(venue.slug)}`
    : null;

  return (
    <BuilderShell
      hasVenue={!!venue}
      aiConfigured={aiConfigured}
      published={published}
      hasDescription={!!venue && venue.description.trim().length > 0}
      initialDescription={venue?.description ?? ''}
      initialEnhancedDescription={venue?.enhancedDescription ?? null}
    >
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
            Your venue
          </h1>
          <p className="text-muted-foreground">
            A name, a description, and one photo — that&apos;s the whole builder.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <BuilderForm
            venue={
              venue
                ? {
                    name: venue.name,
                    slug: venue.slug,
                    description: venue.description,
                    imageKind: venue.imageKind,
                    imageValue: venue.imageValue,
                    slugLockedAt: venue.slugLockedAt,
                  }
                : null
            }
            aiConfigured={aiConfigured}
          />
          <VenuePreview venue={venue} />
        </div>

        <GeneratedPages
          variants={venue?.variants ?? []}
          published={published}
          customerSiteUrl={customerSiteUrl}
        />
      </div>
    </BuilderShell>
  );
}
