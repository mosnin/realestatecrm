import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getOnboardingStatus, shouldBackfillOnboardingCompletion } from '@/lib/onboarding';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  try {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: true }
    });

    const onboarding = getOnboardingStatus(user);
    console.info('[onboarding-guard] /dashboard read', {
      clerkId: userId,
      onboardingCompleted: onboarding.isOnboarded,
      hasSpace: !!user?.space
    });

    if (user?.space) {
      if (shouldBackfillOnboardingCompletion(user)) {
        await db.user
          .update({
            where: { id: user.id },
            data: { onboardingCompletedAt: new Date(), onboardingCurrentStep: 7 }
          })
          .catch(() => null);
      }
      redirect(`/s/${user.space.slug}`);
    }

    // Missing workspace still recovers via onboarding flow.
    redirect('/onboarding');
  } catch (error) {
    console.error('[onboarding-guard] /dashboard read failed', { clerkId: userId, error });
    redirect('/onboarding');
  }
}
