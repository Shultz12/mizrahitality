import { redirect } from 'next/navigation';
import { getCurrentOwner } from '@/lib/auth';
import { SignInForm } from '@/components/auth/sign-in-form';
import { DemoCredentialsPanel } from '@/components/auth/demo-credentials-panel';

export default async function SignInPage() {
  if (await getCurrentOwner()) redirect('/dashboard');
  // The wrapper matches the form's width so the layout centers the sign-in card
  // in the exact same spot as the sign-up card. The demo panel is absolutely
  // positioned flush to the right of the form, so its presence doesn't shift
  // the form off-center.
  return (
    <div className="relative w-[440px]">
      <SignInForm />
      <div className="absolute top-0 left-full ml-6">
        <DemoCredentialsPanel />
      </div>
    </div>
  );
}
