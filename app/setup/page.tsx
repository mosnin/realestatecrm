import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { ConfigureForm } from './configure-form';
import type { User, Space, SpaceSetting } from '@prisma/client';
import { getOnboardingStatus, ensureOnboardingBackfill } from '@/lib/onboarding';

export const metadata = { title: 'Configure your account — Chippi' };

type DbUser = User & {
  space: (Space & { settings: SpaceSetting | null }) | null;
};

export default async function SetupPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();

  let dbUser: DbUser | null = null;

  try {
    dbUser = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: { include: { settings: true } } },
    });
  } catch (err) {
    console.error('[setup-page] DB read failed', { clerkId: userId, error: err });
  }

  try {
    await ensureOnboardingBackfill(dbUser, db);
  } catch (err) {
    console.error('[setup-page] backfill failed', { clerkId: userId, error: err });
  }

  const onboarding = getOnboardingStatus(dbUser);

  // Already fully set up — send them to their workspace
  if (onboarding.isOnboarded && dbUser?.space?.slug) {
    redirect(`/s/${dbUser.space.slug}`);
  }

  // Create the user record if it doesn't exist yet
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
          onboard: false,
        },
        include: { space: { include: { settings: true } } },
      });

      if (getOnboardingStatus(dbUser).isOnboarded && dbUser.space) {
        redirect(`/s/${dbUser.space.slug}`);
      }
    } catch {
      // DB may not be migrated yet — render form anyway
    }
  } else if (!dbUser.onboardingStartedAt) {
    await db.user
      .update({ where: { id: dbUser.id }, data: { onboardingStartedAt: new Date() } })
      .catch(() => null);
  }

  const initialData = {
    userId: dbUser?.id ?? '',
    name: dbUser?.name ?? clerkUser?.fullName ?? clerkUser?.firstName ?? '',
    email: dbUser?.email ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? '',
    phone: dbUser?.space?.settings?.phoneNumber ?? '',
    businessName: dbUser?.space?.settings?.businessName ?? '',
    slug: dbUser?.space?.slug ?? '',
    intakePageTitle: dbUser?.space?.settings?.intakePageTitle ?? '',
    intakePageIntro: dbUser?.space?.settings?.intakePageIntro ?? '',
    notifications: dbUser?.space?.settings?.notifications ?? true,
    spaceExists: !!dbUser?.space,
  };

  return <ConfigureForm initialData={initialData} />;
}
