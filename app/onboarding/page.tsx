import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { OnboardingWizard } from './wizard-client';
import type { User, Space, SpaceSetting } from '@prisma/client';
import {
  getOnboardingStatus,
  shouldBackfillOnboardingCompletion,
  shouldResetOrphanedCompletion
} from '@/lib/onboarding';

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
  } catch (err) {
    console.error('[onboarding-page] DB read failed', { clerkId: userId, error: err });
    // Migration likely pending — fall through, wizard renders empty
  }

  const onboarding = getOnboardingStatus(dbUser);

  // Canonical completion signal is workspace existence.
  if (onboarding.isOnboarded && dbUser?.space) {
    if (shouldBackfillOnboardingCompletion(dbUser)) {
      await db.user
        .update({
          where: { id: dbUser.id },
          data: { onboardingCompletedAt: new Date(), onboardingCurrentStep: 7 }
        })
        .catch(() => null);
    }
    redirect(`/s/${dbUser.space.subdomain}`);
  }

  // Timestamp without workspace is treated as incomplete and reset.
  if (shouldResetOrphanedCompletion(dbUser)) {
    console.warn('[onboarding-page] completed but no space — resetting', { clerkId: userId });
    await db.user
      .update({
        where: { id: dbUser.id },
        data: { onboardingCompletedAt: null, onboardingCurrentStep: 1 }
      })
      .catch(() => null);
    dbUser = { ...dbUser, onboardingCompletedAt: null, onboardingCurrentStep: 1 };
  }

  // Bootstrap user record if this is their first load.
  // Use upsert to avoid unique-constraint errors when the initial findUnique
  // failed for a transient reason but the user row already exists.
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
          onboardingCurrentStep: 1
        },
        include: { space: { include: { settings: true } } }
      });
      // Re-check: if the upsert found an existing user WITH a space, redirect now.
      if (dbUser.space) {
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
    completed: !!dbUser?.space,
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
