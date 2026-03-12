import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { CreateWorkspaceForm } from './create-workspace-form';
import { ensureOnboardingBackfill } from '@/lib/onboarding';

export const metadata = { title: 'Create your workspace — Chippi' };

export default async function SetupPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();

  // IMPORTANT: Do NOT use .catch(() => null) here. If the DB query fails,
  // we must NOT show the "create workspace" form to a user who already has one.
  const dbUser = await db.user.findUnique({
    where: { clerkId: userId },
    include: { space: true },
  });

  // Best-effort backfill (bookkeeping only)
  try {
    await ensureOnboardingBackfill(dbUser, db);
  } catch {
    // non-fatal
  }

  // Already has a workspace — go straight to it.
  if (dbUser?.space?.slug) {
    redirect(`/s/${dbUser.space.slug}`);
  }

  // Create user record if missing.
  // IMPORTANT: redirect() must NEVER be inside try/catch — Next.js redirect()
  // throws a special NEXT_REDIRECT error that catch blocks would swallow.
  let resolvedUser = dbUser;
  if (!resolvedUser) {
    resolvedUser = await db.user.upsert({
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
  }

  // Check again after upsert — user may already have a space
  if (resolvedUser?.space?.slug) {
    redirect(`/s/${resolvedUser.space.slug}`);
  }

  return (
    <CreateWorkspaceForm
      defaultName={resolvedUser?.name ?? clerkUser?.fullName ?? clerkUser?.firstName ?? ''}
    />
  );
}
