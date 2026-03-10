import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSubdomain } from '@/lib/space';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { Header } from '@/components/dashboard/header';
import { db } from '@/lib/db';
import { getOnboardingStatus, shouldBackfillOnboardingCompletion } from '@/lib/onboarding';

export default async function DashboardLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { userId } = await auth();

  if (!userId) {
    return null; // Middleware handles redirect
  }

  // Gate dashboard access until onboarding is complete using canonical onboarding contract.
  let onboardingCompleted = false;
  try {
    const dbUser = await db.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, onboardingCompletedAt: true, space: { select: { id: true } } }
    });
    onboardingCompleted = getOnboardingStatus(dbUser).isOnboarded;

    if (shouldBackfillOnboardingCompletion(dbUser)) {
      await db.user
        .update({
          where: { id: dbUser.id },
          data: { onboardingCompletedAt: new Date(), onboardingCurrentStep: 7 }
        })
        .catch(() => null);
    }
  } catch (error) {
    console.error('[onboarding-guard] /s layout read failed', {
      clerkId: userId,
      subdomain,
      error
    });
    // On transient DB errors, allow the request through rather than
    // bouncing completed users to onboarding. The space lookup below
    // will 404 if the subdomain is truly invalid.
    onboardingCompleted = true;
  }
  if (!onboardingCompleted) {
    redirect('/onboarding');
  }

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) notFound();

  const unreadLeadCount = await db.contact.count({
    where: {
      spaceId: space.id,
      tags: { has: 'new-lead' }
    }
  });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar
        subdomain={subdomain}
        spaceName={space.name}
        spaceEmoji={space.emoji}
        unreadLeadCount={unreadLeadCount}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          subdomain={subdomain}
          spaceName={space.name}
          title={space.name}
        />
        <main className="flex-1 px-4 py-5 md:px-8 md:py-7 pb-24 md:pb-7">{children}</main>
      </div>
      <MobileNav subdomain={subdomain} />
    </div>
  );
}
