// A read-only preview of the venue's *saved* inputs (name, slug, description, chosen image).
// Server Component — no interactivity; the builder form `router.refresh()`es after a save so this
// re-renders with the new content. This is the plain "here's what you typed" preview; the
// AI-generated, audience-tailored page arrives with feature #4.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isStockImageId, stockImagePath } from '@/lib/stock-images';

type PreviewVenue = {
  name: string;
  slug: string;
  description: string;
  imageKind: string;
  imageValue: string;
};

function imageSrc(kind: string, value: string): string {
  if (kind === 'upload') return `/uploads/${value}`;
  return isStockImageId(value) ? stockImagePath(value) : `/stock/${value}.jpg`;
}

export function VenuePreview({ venue }: { venue: PreviewVenue | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {venue ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">{venue.name}</h2>
              <p className="text-sm text-muted-foreground">/{venue.slug}</p>
            </div>
            {/* Plain <img>: the /uploads/* route is dynamic — next/image would need extra config,
                and this is a low-stakes internal preview. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc(venue.imageKind, venue.imageValue)}
              alt={`${venue.name} photo`}
              className="w-full max-h-80 rounded-lg object-cover"
            />
            {venue.description ? (
              <p className="text-sm whitespace-pre-wrap">{venue.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description yet.</p>
            )}
            <p className="text-xs text-muted-foreground">
              This is a plain preview of your inputs — your AI-generated, audience-tailored page
              arrives with feature #4.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing to preview yet — fill in the form and save.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
