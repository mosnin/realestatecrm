import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceByOwnerId } from '@/lib/space';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect('/');

  const space = await getSpaceByOwnerId(user.id);
  if (!space) redirect('/');

  redirect(`/s/${space.subdomain}`);
}
