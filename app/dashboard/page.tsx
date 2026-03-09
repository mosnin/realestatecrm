import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  try {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: true }
    });

    // If a workspace exists, send user to it. This avoids onboarding loops
    // in environments where onboarding fields are missing in Prisma runtime.
    if (user?.space) {
      redirect(`/s/${user.space.subdomain}`);
    }
  } catch {
    // DB temporarily unavailable — fall through to onboarding
  }

  // Default: send to onboarding wizard
  redirect('/onboarding');
}
