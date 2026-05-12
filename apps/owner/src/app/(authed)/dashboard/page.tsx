import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isStockImageId, stockImagePath } from '@/lib/stock-images';

function venueThumbSrc(kind: string, value: string): string {
  if (kind === 'upload') return `/uploads/${value}`;
  return isStockImageId(value) ? stockImagePath(value) : `/stock/${value}.jpg`;
}

export default async function DashboardPage() {
  const owner = await requireOwner();
  const venue = owner.venue;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {owner.email}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Your venue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {venue ? (
            <>
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={venueThumbSrc(venue.imageKind, venue.imageValue)}
                  alt={`${venue.name} photo`}
                  className="h-16 w-24 shrink-0 rounded-md object-cover"
                />
                <div className="space-y-0.5">
                  <p className="font-medium">{venue.name}</p>
                  <p className="text-sm text-muted-foreground">/{venue.slug}</p>
                  <p className="text-sm text-muted-foreground">Status: {venue.publishState}</p>
                </div>
              </div>
              <Link href="/builder" className={buttonVariants({ variant: 'outline' })}>
                Edit in the builder
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You haven&apos;t created your venue yet.
              </p>
              <Link href="/builder" className={buttonVariants()}>
                Create your venue
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Your dashboard arrives in feature #7.</p>
        </CardContent>
      </Card>
    </div>
  );
}
