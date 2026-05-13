import { requireOwner } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isAiConfigured } from '@/lib/ai';
import { env } from '@/lib/env';
import { BuilderShell } from '@/components/builder/builder-shell';
import { BuilderForm } from '@/components/builder/builder-form';
import { VenuePreview } from '@/components/builder/venue-preview';
import { PublishSection } from '@/components/builder/publish-section';
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
  const aiConfigured = isAiConfigured();
  const published = venue?.publishState === 'published';
  const customerSiteUrl = venue
    ? `${env.CUSTOMER_BASE_URL}/${encodeURIComponent(venue.slug)}`
    : null;

  return (
    <BuilderShell
      hasVenue={!!venue}
      aiConfigured={aiConfigured}
      published={published}
      hasDescription={!!venue && venue.description.trim().length > 0}
      isNewVenue={!venue}
    >
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your venue</h1>
          <p className="text-muted-foreground">
            A name, a description, and one photo — that&apos;s the whole builder.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <BuilderForm venue={venue} aiConfigured={aiConfigured} />
          <VenuePreview venue={venue} />
        </div>

        <PublishSection published={published} />

        <GeneratedPages
          variants={venue?.variants ?? []}
          published={published}
          customerSiteUrl={customerSiteUrl}
        />
      </div>
    </BuilderShell>
  );
}
