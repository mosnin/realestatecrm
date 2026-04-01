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
import { LiveNotifications } from '@/components/dashboard/live-notifications';


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
    redirect('/login/realtor');
  }

  // Gate: user must exist in our DB. On DB error, render error UI
  // (NOT .catch(() => null) which caused redirect loops, NOT throw which
  // shows the generic "Application error" page).
  let dbUser;
  try {
    const { data: row, error } = await supabase
      .from('User')
      .select('id, onboard, platformRole')
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
        isPlatformAdmin: row.platformRole === 'admin',
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

  // ── Subscription gate — redirect to standalone pages ────────────────
  if (!dbUser.isPlatformAdmin) {
    try {
      const { data: subData } = await supabase
        .from('Space')
        .select('stripeSubscriptionStatus, stripeSubscriptionId')
        .eq('id', space.id)
        .maybeSingle();
      const status = subData?.stripeSubscriptionStatus ?? 'inactive';
      if (status !== 'active' && status !== 'trialing') {
        // Had a subscription that failed/canceled → billing-required page
        if (subData?.stripeSubscriptionId && (status === 'past_due' || status === 'canceled' || status === 'unpaid')) {
          redirect(`/billing-required?slug=${slug}&reason=${status}`);
        }
        // Never subscribed → subscribe/trial page
        redirect(`/subscribe?slug=${slug}`);
      }
    } catch {
      // If stripe columns don't exist yet, don't gate
    }
  }

  let unreadLeadCount = 0;
  let overdueFollowUpCount = 0;
  try {
    const [leadResult, followUpResult] = await Promise.all([
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('spaceId', space.id)
        .contains('tags', ['new-lead']),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('spaceId', space.id)
        .not('followUpAt', 'is', null)
        .lte('followUpAt', new Date().toISOString()),
    ]);
    if (leadResult.error) throw leadResult.error;
    unreadLeadCount = leadResult.count ?? 0;
    overdueFollowUpCount = followUpResult.count ?? 0;
  } catch {
    unreadLeadCount = 0;
    overdueFollowUpCount = 0;
  }

  // Check broker context and brokerage memberships for sidebar
  let isBroker = false;
  let brokerageName: string | null = null;
  let brokerageRole: string | null = null;
  let brokerageMemberships: { id: string; name: string; role: string }[] = [];
  try {
    const { data: memberships } = await supabase
      .from('BrokerageMembership')
      .select('brokerageId, role, Brokerage(id, name)')
      .eq('userId', dbUser.id);

    brokerageMemberships = (memberships ?? []).map((m: any) => ({
      id: Array.isArray(m.Brokerage) ? m.Brokerage[0]?.id : m.Brokerage?.id,
      name: Array.isArray(m.Brokerage) ? m.Brokerage[0]?.name : m.Brokerage?.name,
      role: m.role,
    })).filter(m => m.id && m.name);

    if (brokerageMemberships.length > 0) {
      isBroker = brokerageMemberships.some(m => m.role === 'broker_owner' || m.role === 'broker_admin');
      brokerageName = brokerageMemberships[0].name;
      brokerageRole = brokerageMemberships[0].role;
    }
  } catch {
    isBroker = false;
  }

  return (
    <div className="app-theme flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar slug={slug} spaceName={space.name} unreadLeadCount={unreadLeadCount} overdueFollowUpCount={overdueFollowUpCount} isBroker={isBroker} brokerageName={brokerageName} brokerageRole={brokerageRole} brokerageMemberships={brokerageMemberships} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header slug={slug} spaceName={space.name} title={space.name} isBroker={isBroker} brokerageName={brokerageName} />
        <main className="flex-1 overflow-y-auto flex flex-col px-4 py-5 md:px-8 md:py-7 pb-24 md:pb-7 bg-background text-foreground">
          <LiveNotifications spaceId={space.id} slug={slug} />
          {children}
          <DashboardFooter />
        </main>
      </div>
      <MobileNav slug={slug} isBroker={isBroker} />
    </div>
  );
}
