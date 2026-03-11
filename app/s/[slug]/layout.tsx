import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { Header } from '@/components/dashboard/header';
import { db } from '@/lib/db';

export default async function DashboardLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();

  if (!userId) {
    return null; // Middleware handles redirect
  }

  // Gate dashboard access until onboarding is complete
  let onboardingCompleted = false;
  try {
    const dbUser = await db.user.findUnique({
      where: { clerkId: userId },
      select: { onboardingCompletedAt: true }
    });
    onboardingCompleted = !!dbUser?.onboardingCompletedAt;
    console.info('[onboarding-guard] /s layout read', {
      clerkId: userId,
      slug,
      onboardingCompleted
    });
  } catch (error) {
    console.error('[onboarding-guard] /s layout read failed', {
      clerkId: userId,
      slug,
      error
    });
    // DB schema mismatch (migration pending) — send to onboarding which will self-heal
    redirect('/onboarding');
  }
  if (!onboardingCompleted) {
    redirect('/onboarding');
  }

  const space = await getSpaceFromSlug(slug);
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
        slug={slug}
        spaceName={space.name}
        spaceEmoji={space.emoji}
        unreadLeadCount={unreadLeadCount}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          slug={slug}
          spaceName={space.name}
          title={space.name}
        />
        <main className="flex-1 px-4 py-5 md:px-8 md:py-7 pb-24 md:pb-7">{children}</main>
      </div>
      <MobileNav slug={slug} />
    </div>
  );
}
