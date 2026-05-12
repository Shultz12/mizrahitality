import { requireOwner } from '@/lib/auth';
import { signOutAction } from '@/lib/auth-actions';
import { Button } from '@/components/ui/button';

export default async function DashboardPage() {
  const owner = await requireOwner();
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {owner.email}</h1>
        <p className="text-muted-foreground">
          The venue builder arrives in feature #3 and the analytics dashboard in #7.
        </p>
        {!owner.venue && (
          <p className="text-muted-foreground">You haven&apos;t created a venue yet.</p>
        )}
      </div>
      <form action={signOutAction}>
        <Button variant="outline">Sign out</Button>
      </form>
    </div>
  );
}
