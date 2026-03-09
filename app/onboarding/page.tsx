import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { OnboardingWizard } from './wizard-client';

export const metadata = { title: 'Set up Chippi' };

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();

  // Load user + space from DB
  let dbUser = await db.user.findUnique({
    where: { clerkId: userId },
    include: {
      space: {
        include: { settings: true }
      }
    }
  });

  // If user has already completed onboarding, send them to the dashboard
  if (dbUser?.onboardingCompletedAt && dbUser.space) {
    redirect(`/s/${dbUser.space.subdomain}`);
  }

  // Start onboarding record if not yet started
  if (!dbUser) {
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
  } else if (!dbUser.onboardingStartedAt) {
    await db.user.update({
      where: { id: dbUser.id },
      data: { onboardingStartedAt: new Date() }
    });
  }

  const initialState = {
    step: dbUser.onboardingCurrentStep ?? 1,
    completed: !!dbUser.onboardingCompletedAt,
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email
    },
    space: dbUser.space
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
