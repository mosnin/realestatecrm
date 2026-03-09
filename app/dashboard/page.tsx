import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceByOwnerId } from '@/lib/space';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  try {
    const user = await db.user.findUnique({ where: { clerkId: userId } });

    const space = user ? await getSpaceByOwnerId(user.id) : null;

    if (space && user?.onboardingCompletedAt) {
      redirect(`/s/${space.subdomain}`);
    }

    redirect('/onboarding');
  } catch {
    redirect('/onboarding');
  }
}
