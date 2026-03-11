import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getOnboardingStatus, ensureOnboardingBackfill } from '@/lib/onboarding';
import { resolveDashboardEntry } from '@/lib/onboarding-routing';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  try {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: true }
    });

    try {
      await ensureOnboardingBackfill(user, db);
    } catch (err) {
      console.error('[dashboard] backfill failed', { clerkId: userId, error: err });
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
      // User is onboarded but has no space (e.g. deleted it).
      // Reset to full re-onboarding. Note: we preserve onboardingCompletedAt
      // as an audit timestamp — it is never used for routing decisions.
      await db.user
        .update({
          where: { id: user.id },
          data: { onboard: false, onboardingCurrentStep: 1 }
        })
        .catch(() => null);
    }

    redirect('/onboarding');
  } catch (error) {
    console.error('[onboarding-guard] /dashboard read failed', { clerkId: userId, error });
    redirect('/onboarding');
  }
}
