import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { Header } from '@/components/dashboard/header';
import { db } from '@/lib/db';
import { ensureOnboardingBackfill } from '@/lib/onboarding';

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
    return null;
  }

  // Gate: user must exist in our DB. On DB error, render error UI
  // (NOT .catch(() => null) which caused redirect loops, NOT throw which
  // shows the generic "Application error" page).
  let dbUser;
  try {
    dbUser = await db.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, onboard: true, space: { select: { id: true } } }
    });
  } catch (err) {
    console.error('[layout] DB query failed', { clerkId: userId, slug, error: err });
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load your workspace. This is usually temporary.
          </p>
          <a
            href={`/s/${slug}`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  if (!dbUser) {
    redirect('/setup');
  }

  // Best-effort backfill: set onboard=true if user has a space but flag is false.
  try {
    await ensureOnboardingBackfill(dbUser, db);
  } catch (err) {
    console.error('[layout] backfill failed (non-blocking)', { clerkId: userId, slug, error: err });
  }

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const unreadLeadCount = await db.contact.count({
    where: { spaceId: space.id, tags: { has: 'new-lead' } }
  }).catch(() => 0);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar slug={slug} spaceName={space.name} spaceEmoji={space.emoji} unreadLeadCount={unreadLeadCount} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header slug={slug} spaceName={space.name} title={space.name} />
        <main className="flex-1 px-4 py-5 md:px-8 md:py-7 pb-24 md:pb-7">{children}</main>
      </div>
      <MobileNav slug={slug} />
    </div>
  );
}
