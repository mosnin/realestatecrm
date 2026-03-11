import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const clerkUser = await currentUser();
  const clerkCompleted = Boolean(
    clerkUser?.publicMetadata?.onboardingCompleted || clerkUser?.publicMetadata?.onboardingCompletedAt
  );
  const clerkSlug =
    typeof clerkUser?.publicMetadata?.spaceSlug === 'string'
      ? clerkUser.publicMetadata.spaceSlug
      : null;

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

    if (!onboardingCompleted && !clerkCompleted) {
      redirect('/onboarding');
    }

    if (user?.space) {
      redirect(`/s/${user.space.slug}`);
    }

    if (clerkCompleted && clerkSlug) {
      redirect(`/s/${clerkSlug}`);
    }

    // Completed onboarding but missing space should recover via onboarding flow.
    redirect('/onboarding');
  } catch (error) {
    console.error('[onboarding-guard] /dashboard read failed', { clerkId: userId, error });
    redirect('/onboarding');
  }
}
