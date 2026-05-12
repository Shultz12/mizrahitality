import { requireOwner } from '@/lib/auth';
import { publishAction } from '@/lib/builder-actions';
import { BuilderForm } from '@/components/builder/builder-form';
import { VenuePreview } from '@/components/builder/venue-preview';
import { Button } from '@/components/ui/button';

// The venue builder — the owner's entire input surface (name → derived slug, description, image)
// plus a publish stub. Server Component: loads the owner's single venue (or `null`), renders the
// form + a saved-content preview side by side, and the publish form below.
export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string }>;
}) {
  const owner = await requireOwner();
  const { published } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your venue</h1>
        <p className="text-muted-foreground">
          A name, a description, and one photo — that&apos;s the whole builder.
        </p>
      </div>

      {published === '1' && (
        <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">
          Published — your audience-tailored pages are generated in feature #4.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <BuilderForm venue={owner.venue} />
        <VenuePreview venue={owner.venue} />
      </div>

      <div className="space-y-2 border-t pt-6">
        <h2 className="text-lg font-semibold tracking-tight">Publish</h2>
        <p className="text-sm text-muted-foreground">
          Publishing freezes your page address. Audience-tailored page generation arrives in feature
          #4 — for now this just marks your venue published.
        </p>
        <form action={publishAction}>
          <Button type="submit" disabled={!owner.venue}>
            {owner.venue?.publishState === 'published' ? 'Re-publish' : 'Publish'}
          </Button>
        </form>
        {!owner.venue && <p className="text-sm text-muted-foreground">Save your venue first.</p>}
      </div>
    </div>
  );
}
