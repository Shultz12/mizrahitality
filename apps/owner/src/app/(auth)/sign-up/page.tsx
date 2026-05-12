import { redirect } from 'next/navigation';
import { getCurrentOwner } from '@/lib/auth';
import { SignUpForm } from '@/components/auth/sign-up-form';

export default async function SignUpPage() {
  if (await getCurrentOwner()) redirect('/dashboard');
  return <SignUpForm />;
}
