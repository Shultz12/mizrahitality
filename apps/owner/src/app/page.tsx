import Link from 'next/link';
import { getCurrentOwner } from '@/lib/auth';
import { buttonVariants } from '@/components/ui/button';

export default async function Home() {
  const owner = await getCurrentOwner();
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Mizrahitality — owner platform</h1>
      <p className="mt-3 text-neutral-600">
        Sign up, then build and publish your venue page. The venue builder, the analytics dashboard,
        and the REST API land in upcoming features.
      </p>
      <div className="mt-6 flex gap-3">
        {owner ? (
          <Link href="/dashboard" className={buttonVariants()}>
            Go to your dashboard
          </Link>
        ) : (
          <>
            <Link href="/sign-up" className={buttonVariants()}>
              Sign up
            </Link>
            <Link href="/sign-in" className={buttonVariants({ variant: 'outline' })}>
              Sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
