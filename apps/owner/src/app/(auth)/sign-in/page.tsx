import { redirect } from 'next/navigation';
import { getCurrentOwner } from '@/lib/auth';
import { SignInForm } from '@/components/auth/sign-in-form';

export default async function SignInPage() {
  if (await getCurrentOwner()) redirect('/dashboard');
  return <SignInForm />;
}
