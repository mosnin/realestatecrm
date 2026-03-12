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

  // On DB error: render error UI. NEVER .catch(() => null) (shows create-workspace
  // form to users who already have one). NEVER throw (generic "Application error").
  let dbUser;
  try {
    dbUser = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: true },
    });
  } catch (err) {
    console.error('[setup] DB query failed', { clerkId: userId, error: err });
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load your account. This is usually temporary.
          </p>
          <a
            href="/setup"
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

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
    try {
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
    } catch (err) {
      console.error('[setup] user upsert failed', { clerkId: userId, error: err });
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center space-y-4 p-8">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t create your account. This is usually temporary.
            </p>
            <a
              href="/setup"
              className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </a>
          </div>
        </div>
      );
    }
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
