'use client';

// A read-only preview of the venue's saved chrome (name, slug, chosen image) with a *live*
// description: while the owner is typing, the textarea text appears here in real time; after
// they click Enhance, the polished version takes its place — both driven by `<BuilderShell>`'s
// live `typedDescription` / `polishedPreview` state, not by saved props. Name/slug/image still
// come from the saved venue prop because their changes flow through Save (a router refresh),
// not through live input — the textarea is the only field that benefits from live preview.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isStockImageId, stockImagePath } from '@/lib/stock-images';
import { useBuilderShell } from './builder-shell';

type PreviewVenue = {
  name: string;
  slug: string;
  imageKind: string;
  imageValue: string;
};

function imageSrc(kind: string, value: string): string {
  if (kind === 'upload') return `/uploads/${value}`;
  return isStockImageId(value) ? stockImagePath(value) : `/stock/${value}.jpg`;
}

export function VenuePreview({ venue }: { venue: PreviewVenue | null }) {
  const { typedDescription, polishedPreview } = useBuilderShell();
  const displayDescription = polishedPreview ?? typedDescription;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {venue ? (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-xl font-semibold leading-tight tracking-tight">
                {venue.name}
              </h2>
              <p className="font-mono text-xs text-muted-foreground">/{venue.slug}</p>
            </div>
            {/* Plain <img>: the /uploads/* route is dynamic — next/image would need extra config,
                and this is a low-stakes internal preview. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc(venue.imageKind, venue.imageValue)}
              alt={`${venue.name} photo`}
              className="w-full max-h-80 rounded-lg object-cover"
            />
            {displayDescription.trim().length > 0 ? (
              <p className="text-sm whitespace-pre-wrap">{displayDescription}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description yet.</p>
            )}
            <p className="text-xs text-muted-foreground">
              This is a plain preview of your inputs. When you Publish, AI writes a tailored version
              of this copy for each audience; the public page (feature #5) renders the full design.
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
