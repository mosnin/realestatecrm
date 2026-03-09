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

    const onboardingCompleted = !!user?.onboardingCompletedAt || !!user?.space;
    console.info('[onboarding-guard] /dashboard read', {
      clerkId: userId,
      onboardingCompleted,
      hasSpace: !!user?.space
    });

    if (user?.space) {
      // Legacy accounts may have a workspace but missing onboardingCompletedAt.
      // Treat workspace existence as completed to avoid onboarding loops.
      if (!user.onboardingCompletedAt) {
        await db.user
          .update({
            where: { id: user.id },
            data: { onboardingCompletedAt: new Date(), onboardingCurrentStep: 7 }
          })
          .catch(() => null);
      }
      redirect(`/s/${user.space.subdomain}`);
    }

    // Missing workspace still recovers via onboarding flow.
    redirect('/onboarding');
  } catch (error) {
    console.error('[onboarding-guard] /dashboard read failed', { clerkId: userId, error });
    redirect('/onboarding');
  }
}
