import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { ensureOnboardingBackfill } from '@/lib/onboarding';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { space: true },
  }).catch(() => null);

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
