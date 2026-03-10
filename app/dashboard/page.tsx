import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getOnboardingStatus, shouldBackfillOnboardFromSpace } from '@/lib/onboarding';
import { resolveDashboardEntry } from '@/lib/onboarding-routing';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  try {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: true }
    });

    if (shouldBackfillOnboardFromSpace(user)) {
      await db.user
        .update({
          where: { id: user!.id },
          data: { onboard: true, onboardingCompletedAt: new Date(), onboardingCurrentStep: 7 }
        })
        .catch(() => null);
    }

    const onboarding = getOnboardingStatus(user);

    const dashboardResolution = resolveDashboardEntry({
      isOnboarded: onboarding.isOnboarded,
      hasSpace: onboarding.hasSpace
    });

    if (dashboardResolution === 'redirect_workspace' && user?.space) {
      redirect(`/s/${user.space.slug}`);
    }

    if (dashboardResolution === 'repair_and_redirect_onboarding' && user) {
      await db.user
        .update({
          where: { id: user.id },
          data: { onboard: false, onboardingCompletedAt: null, onboardingCurrentStep: 1 }
        })
        .catch(() => null);
    }

    redirect('/onboarding');
  } catch (error) {
    console.error('[onboarding-guard] /dashboard read failed', { clerkId: userId, error });
    redirect('/onboarding');
  }
}
