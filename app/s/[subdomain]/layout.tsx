import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSubdomain } from '@/lib/space';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { Header } from '@/components/dashboard/header';
import { db } from '@/lib/db';

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

  // Resolve this user's workspace mapping.
  let userSpaceSubdomain: string | null = null;
  try {
    const dbUser = await db.user.findUnique({
      where: { clerkId: userId },
      select: {
        space: { select: { subdomain: true } }
      }
    });
    userSpaceSubdomain = dbUser?.space?.subdomain ?? null;
  } catch {
    // DB schema mismatch (migration pending)
    redirect('/onboarding');
  }

  // If this user doesn't have a workspace yet, onboarding is required.
  if (!userSpaceSubdomain) {
    redirect('/onboarding');
  }

  // Prevent accessing someone else's workspace path.
  if (userSpaceSubdomain !== subdomain) {
    redirect(`/s/${userSpaceSubdomain}`);
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
