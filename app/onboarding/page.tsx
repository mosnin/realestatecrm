import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { OnboardingWizard } from './wizard-client';
import type { User, Space, SpaceSetting } from '@prisma/client';

export const metadata = { title: 'Set up Chippi' };

type DbUser = User & {
  space: (Space & { settings: SpaceSetting | null }) | null;
};

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();

  // Load user + space from DB.
  // Wrapped in try/catch to handle the period between deployment and migration
  // completion — wizard renders in a fresh state and the API endpoints will
  // also fail gracefully until the DB is up to date.
  let dbUser: DbUser | null = null;

  try {
    dbUser = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        space: {
          include: { settings: true }
        }
      }
    });
  } catch {
    // Migration likely pending — fall through, wizard renders empty
  }

  // Onboarding visibility depends only on onboarding completion.
  // Workspace navigation is handled separately once completion is confirmed.
  const onboardingCompleted = !!dbUser?.onboardingCompletedAt || !!dbUser?.space;
  console.info('[onboarding-page] state read', {
    clerkId: userId,
    onboardingCompleted,
    hasSpace: !!dbUser?.space
  });

  if (onboardingCompleted && dbUser?.space) {
    if (!dbUser.onboardingCompletedAt) {
      await db.user
        .update({
          where: { id: dbUser.id },
          data: { onboardingCompletedAt: new Date(), onboardingCurrentStep: 7 }
        })
        .catch(() => null);
    }
    redirect(`/s/${dbUser.space.subdomain}`);
  }

  // Bootstrap user record if this is their first load
  if (!dbUser) {
    try {
      dbUser = await db.user.create({
        data: {
          clerkId: userId,
          email: clerkUser?.emailAddresses?.[0]?.emailAddress ?? '',
          name: clerkUser?.fullName ?? clerkUser?.firstName ?? null,
          onboardingStartedAt: new Date(),
          onboardingCurrentStep: 1
        },
        include: { space: { include: { settings: true } } }
      });
    } catch {
      // Still failing (migration pending) — wizard renders with Clerk data only
    }
  } else if (!dbUser.onboardingStartedAt) {
    try {
      await db.user.update({
        where: { id: dbUser.id },
        data: { onboardingStartedAt: new Date() }
      });
    } catch {
      // Non-fatal
    }
  }

  const initialState = {
    step: dbUser?.onboardingCurrentStep ?? 1,
    completed: onboardingCompleted,
    user: {
      id: dbUser?.id ?? '',
      name: dbUser?.name ?? null,
      email: dbUser?.email ?? (clerkUser?.emailAddresses?.[0]?.emailAddress ?? '')
    },
    space: dbUser?.space
      ? {
          id: dbUser.space.id,
          subdomain: dbUser.space.subdomain,
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
