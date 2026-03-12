import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { ensureOnboardingBackfill } from '@/lib/onboarding';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // Wrap in try-catch for build resilience, but on DB error throw a real
  // error (shows error page) — NEVER convert to null/redirect to /setup.
  let user;
  try {
    user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: true },
    });
  } catch (err) {
    console.error('[dashboard] DB query failed', { clerkId: userId, error: err });
    throw new Error('Unable to load your account. Please refresh the page.');
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
