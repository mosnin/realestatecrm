import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { OnboardingWizard } from './wizard-client';
import type { User, Space, SpaceSetting } from '@prisma/client';
import { getOnboardingStatus, shouldBackfillOnboardFromSpace } from '@/lib/onboarding';
import { resolveOnboardingPageAccess } from '@/lib/onboarding-routing';

export const metadata = { title: 'Set up Chippi' };

type DbUser = User & {
  space: (Space & { settings: SpaceSetting | null }) | null;
};

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();

  let dbUser: DbUser | null = null;

  try {
    dbUser = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: { include: { settings: true } } }
    });
  } catch (err) {
    console.error('[onboarding-page] DB read failed', { clerkId: userId, error: err });
  }

  if (shouldBackfillOnboardFromSpace(dbUser)) {
    await db.user
      .update({
        where: { id: dbUser!.id },
        data: { onboard: true, onboardingCompletedAt: new Date(), onboardingCurrentStep: 7 }
      })
      .catch(() => null);
    dbUser = dbUser ? { ...dbUser, onboard: true, onboardingCurrentStep: 7 } : dbUser;
  }

  const onboarding = getOnboardingStatus(dbUser);
  if (resolveOnboardingPageAccess({ isOnboarded: onboarding.isOnboarded, hasSpace: onboarding.hasSpace }) === 'redirect_dashboard') {
    redirect('/dashboard');
  }

  if (!dbUser) {
    try {
      dbUser = await db.user.upsert({
        where: { clerkId: userId },
        update: {},
        create: {
          clerkId: userId,
          email: clerkUser?.emailAddresses?.[0]?.emailAddress ?? '',
          name: clerkUser?.fullName ?? clerkUser?.firstName ?? null,
          onboardingStartedAt: new Date(),
          onboardingCurrentStep: 1,
          onboard: false
        },
        include: { space: { include: { settings: true } } }
      });

      if (getOnboardingStatus(dbUser).isOnboarded && dbUser.space) {
        redirect(`/s/${dbUser.space.slug}`);
      }
    } catch {
      // migration pending fallback
    }
  } else if (!dbUser.onboardingStartedAt) {
    await db.user
      .update({ where: { id: dbUser.id }, data: { onboardingStartedAt: new Date() } })
      .catch(() => null);
  }

  const initialState = {
    step: dbUser?.onboardingCurrentStep ?? 1,
    completed: getOnboardingStatus(dbUser).isOnboarded,
    user: {
      id: dbUser?.id ?? '',
      name: dbUser?.name ?? null,
      email: dbUser?.email ?? (clerkUser?.emailAddresses?.[0]?.emailAddress ?? '')
    },
    space: dbUser?.space
      ? {
          id: dbUser.space.id,
          slug: dbUser.space.slug,
          name: dbUser.space.name,
          settings: dbUser.space.settings
            ? {
                businessName: dbUser.space.settings.businessName,
                phoneNumber: dbUser.space.settings.phoneNumber,
                intakePageTitle: dbUser.space.settings.intakePageTitle,
                intakePageIntro: dbUser.space.settings.intakePageIntro,
                notifications: dbUser.space.settings.notifications
              }
            : null
        }
      : null
  };

  return (
    <OnboardingWizard
      initialState={initialState}
      clerkName={clerkUser?.fullName ?? clerkUser?.firstName ?? null}
      clerkEmail={clerkUser?.emailAddresses?.[0]?.emailAddress ?? ''}
    />
  );
}
