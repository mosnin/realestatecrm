import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceByOwnerId } from '@/lib/space';
import { SubdomainForm } from '@/app/subdomain-form';
import { BrandLogo } from '@/components/brand-logo';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  let targetSubdomain: string | null = null;

  try {
    const user = await db.user.findUnique({ where: { clerkId: userId } });

    if (user) {
      const space = await getSpaceByOwnerId(user.id);
      if (space) {
        targetSubdomain = space.subdomain;
      }
    }
  } catch {
    // If DB is temporarily unavailable, keep the user on setup UI instead of crashing.
  }

  if (targetSubdomain) {
    redirect(`/s/${targetSubdomain}`);
  }

  return (
    <div className="min-h-screen bg-background p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 space-y-6">
        <div className="flex justify-center">
          <BrandLogo className="h-8" alt="Chippi" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Create your workspace</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            You&apos;re signed in. Set up your workspace to continue to your dashboard.
          </p>
        </div>
        <SubdomainForm />
      </div>
    </div>
  );
}
