import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { Header } from '@/components/dashboard/header';
import { DashboardFooter } from '@/components/dashboard/footer';
import { supabase } from '@/lib/supabase';
import { ensureOnboardingBackfill } from '@/lib/onboarding';
import { getBrokerContext } from '@/lib/permissions';

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
    const { data: row, error } = await supabase
      .from('User')
      .select('id, onboard')
      .eq('clerkId', userId)
      .maybeSingle();
    if (error) throw error;
    if (row) {
      const { data: spaceRow } = await supabase
        .from('Space')
        .select('id')
        .eq('ownerId', row.id)
        .maybeSingle();
      dbUser = {
        id: row.id as string,
        onboard: row.onboard as boolean,
        space: spaceRow ? { id: spaceRow.id as string } : null,
      };
    } else {
      dbUser = null;
    }
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
    await ensureOnboardingBackfill(dbUser);
  } catch (err) {
    console.error('[layout] backfill failed (non-blocking)', { clerkId: userId, slug, error: err });
  }

  let space;
  try {
    space = await getSpaceFromSlug(slug);
  } catch (err) {
    console.error('[layout] getSpaceFromSlug failed', { slug, error: err });
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
  if (!space) notFound();

  // Security: ensure the authenticated user actually owns this workspace.
  // Without this check any logged-in user could visit /s/<other-user-slug>.
  if (!dbUser.space || dbUser.space.id !== space.id) notFound();

  let unreadLeadCount = 0;
  try {
    const { count, error: countError } = await supabase
      .from('Contact')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .contains('tags', ['new-lead']);
    if (countError) throw countError;
    unreadLeadCount = count ?? 0;
  } catch {
    unreadLeadCount = 0;
  }

  // Check broker context and brokerage membership for sidebar
  let isBroker = false;
  let brokerageName: string | null = null;
  let brokerageRole: string | null = null;
  try {
    const ctx = await getBrokerContext();
    if (ctx) {
      isBroker = true;
      brokerageName = ctx.brokerage.name;
      brokerageRole = ctx.membership.role;
    } else {
      // Not a broker — check if they're a realtor_member of a brokerage
      const { data: membership } = await supabase
        .from('BrokerageMembership')
        .select('role, brokerageId')
        .eq('userId', dbUser.id)
        .eq('role', 'realtor_member')
        .maybeSingle();
      if (membership) {
        const { data: brokerage } = await supabase
          .from('Brokerage')
          .select('name')
          .eq('id', membership.brokerageId)
          .maybeSingle();
        brokerageName = brokerage?.name ?? null;
        brokerageRole = 'realtor_member';
      }
    }
  } catch {
    isBroker = false;
  }

  return (
    <div className="app-theme flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar slug={slug} spaceName={space.name} unreadLeadCount={unreadLeadCount} isBroker={isBroker} brokerageName={brokerageName} brokerageRole={brokerageRole} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header slug={slug} spaceName={space.name} title={space.name} isBroker={isBroker} brokerageName={brokerageName} />
        <main className="flex-1 overflow-y-auto flex flex-col px-4 py-5 md:px-8 md:py-7 pb-24 md:pb-7 bg-background text-foreground">
          {children}
          <DashboardFooter />
        </main>
      </div>
      <MobileNav slug={slug} isBroker={isBroker} />
    </div>
  );
}
