import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { CreateWorkspaceForm } from './create-workspace-form';
import { getOnboardingStatus, ensureOnboardingBackfill } from '@/lib/onboarding';

export const metadata = { title: 'Create your workspace — Chippi' };

export default async function SetupPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();

  let dbUser = await db.user
    .findUnique({
      where: { clerkId: userId },
      include: { space: true },
    })
    .catch(() => null);

  try {
    await ensureOnboardingBackfill(dbUser, db);
  } catch {
    // non-fatal
  }

  // Already has a workspace — go straight to it. They can configure from the sidebar.
  if (dbUser?.space?.slug) {
    redirect(`/s/${dbUser.space.slug}`);
  }

  // Create user record if missing
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
          onboard: false,
        },
        include: { space: true },
      });
      if (dbUser?.space?.slug) redirect(`/s/${dbUser.space.slug}`);
    } catch {
      // DB may not be migrated yet
    }
  }

  return (
    <CreateWorkspaceForm
      defaultName={dbUser?.name ?? clerkUser?.fullName ?? clerkUser?.firstName ?? ''}
    />
  );
}
