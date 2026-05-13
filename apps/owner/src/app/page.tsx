import { redirect } from 'next/navigation';
import { getCurrentOwner } from '@/lib/auth';

export default async function Home() {
  const owner = await getCurrentOwner();
  redirect(owner ? '/dashboard' : '/sign-in');
}
