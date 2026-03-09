import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { OnboardingWizard } from './wizard-client';

export const metadata = { title: 'Set up Chippi' };

type DbUser = {
  id: string;
  name: string | null;
  email: string;
  space: {
    id: string;
    subdomain: string;
    name: string;
    settings: Record<string, unknown> | null;
  } | null;
  onboardingCurrentStep?: number;
  onboarded?: boolean;
  onboardingStartedAt?: Date | null;
  onboardingCompletedAt?: Date | null;
};

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();
  const safeEmail =
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ||
    `${userId}@no-email.local`;

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

  // If user already has a workspace, never show onboarding again.
  // This avoids loops when onboarding flags are unavailable/out-of-sync.
  if (dbUser?.space) {
    redirect(`/s/${dbUser.space.subdomain}`);
  }

  // Bootstrap user record if this is their first load
  if (!dbUser) {
    try {
      dbUser = await db.user.create({
        data: {
          clerkId: userId,
          email: safeEmail,
          name: clerkUser?.fullName ?? clerkUser?.firstName ?? null
        },
        include: { space: { include: { settings: true } } }
      }) as unknown as DbUser;
    } catch {
      // Still failing (migration pending) — wizard renders with Clerk data only
    }
  } else if (!(dbUser as any).onboardingStartedAt) {
    try {
      await db.user
        .update({
          where: { id: dbUser.id },
          data: { onboardingStartedAt: new Date() }
        } as any)
        .catch(() => null);
    } catch {
      // Non-fatal
    }
  }

  const initialState = {
    step: (dbUser as any)?.onboardingCurrentStep ?? 1,
    completed: !!((dbUser as any)?.onboarded || (dbUser as any)?.onboardingCompletedAt),
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
                businessName: (dbUser.space.settings as any).businessName,
                phoneNumber: (dbUser.space.settings as any).phoneNumber,
                intakePageTitle: (dbUser.space.settings as any).intakePageTitle,
                intakePageIntro: (dbUser.space.settings as any).intakePageIntro,
                notifications: (dbUser.space.settings as any).notifications
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
