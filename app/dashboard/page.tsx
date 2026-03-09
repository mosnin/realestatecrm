import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  try {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: true }
    });

    const onboardingCompleted = !!user?.onboardingCompletedAt;
    console.info('[onboarding-guard] /dashboard read', {
      clerkId: userId,
      onboardingCompleted,
      hasSpace: !!user?.space
    });

    if (!onboardingCompleted) {
      redirect('/onboarding');
    }

    if (user?.space) {
      redirect(`/s/${user.space.subdomain}`);
    }

    // Completed onboarding but missing space should recover via onboarding flow.
    redirect('/onboarding');
  } catch (error) {
    console.error('[onboarding-guard] /dashboard read failed', { clerkId: userId, error });
    redirect('/onboarding');
  }
}
