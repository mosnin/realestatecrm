import { notFound } from 'next/navigation';
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
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>
      <MobileNav subdomain={subdomain} />
    </div>
  );
}
