import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { ensureOnboardingBackfill } from '@/lib/onboarding';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // On DB error: render an error UI instead of throwing (avoids generic
  // "Application error" page) and instead of .catch(() => null) (avoids
  // redirect loop by treating DB errors as "user not found").
  let user;
  try {
    user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: true },
    });
  } catch (err) {
    console.error('[dashboard] DB query failed', { clerkId: userId, error: err });
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load your account. This is usually temporary.
          </p>
          <a
            href="/dashboard"
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
    await ensureOnboardingBackfill(user, db);
  } catch {
    // non-blocking
  }

  // Simple routing: has workspace → go there. No workspace → setup.
  if (user?.space?.slug) {
    redirect(`/s/${user.space.slug}`);
  }

  redirect('/setup');
}
