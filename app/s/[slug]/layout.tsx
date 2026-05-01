import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
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
import { PlatformBanner } from '@/components/platform-banner';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { AgentStatusBar } from '@/components/agent/agent-status-bar';
import { ChippiBar } from '@/components/chippi/chippi-bar';
import { PageTransition } from '@/components/motion/page-transition';


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
  let dbUser: {
    id: string;
    onboard: boolean;
    isPlatformAdmin: boolean;
    space: { id: string } | null;
  } | null | undefined;
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
  // Exempt billing and settings pages so users can manage their subscription.
  // Use x-pathname from middleware; fall back to checking if the request
  // is for a known-exempt sub-path via the referer or just allow through
  // (the billing/settings pages themselves are safe to render).
  const headersList = await headers();
  // x-pathname is set by our middleware; x-invoke-path is set by Next.js internally
  const currentPath = headersList.get('x-pathname')
    || headersList.get('x-invoke-path')
    || headersList.get('x-matched-path')
    || headersList.get('next-url')
    || '';
  const isExemptPath =
    currentPath.includes('/billing') ||
    currentPath.includes('/settings');

  if (!dbUser.isPlatformAdmin) {
    try {
      const { data: subData, error: subError } = await supabase
        .from('Space')
        .select('stripeSubscriptionStatus, stripeSubscriptionId, trialUsedAt')
        .eq('id', space.id)
        .maybeSingle();

      if (subError) {
        console.error('[layout] Subscription check query failed:', subError);
        // Fail secure — redirect to subscribe rather than granting access
        redirect(`/subscribe?slug=${slug}`);
      }

      const status = subData?.stripeSubscriptionStatus ?? 'inactive';
      const hasSubscriptionHistory = !!(subData?.stripeSubscriptionId || subData?.trialUsedAt);

      if (status !== 'active' && status !== 'trialing') {
        // If on an exempt path (billing/settings) AND user has subscription history,
        // allow access so they can manage their billing/resubscribe.
        // Users with NO subscription history must NOT access exempt paths.
        if (isExemptPath && hasSubscriptionHistory) {
          // Allow through — user had a subscription before and needs billing access
        } else if (hasSubscriptionHistory) {
          redirect(`/billing-required?slug=${slug}&reason=${status}`);
        } else {
          // Never subscribed → show trial signup (even for billing/settings paths)
          redirect(`/subscribe?slug=${slug}`);
        }
      }
    } catch (err: any) {
      // Next.js redirect() throws a special error — re-throw it
      if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err;
      // Fail secure: if anything goes wrong checking subscription, block access
      console.error('[layout] Subscription gate error:', err);
      redirect(`/subscribe?slug=${slug}`);
    }
  }

  let unreadLeadCount = 0;
  let overdueFollowUpCount = 0;
  let pendingDraftCount = 0;
  try {
    const [leadResult, followUpResult, draftResult] = await Promise.all([
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('spaceId', space.id)
        .is('brokerageId', null)
        .contains('tags', ['new-lead']),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('spaceId', space.id)
        .is('brokerageId', null)
        .not('followUpAt', 'is', null)
        .lte('followUpAt', new Date().toISOString()),
      supabase
        .from('AgentDraft')
        .select('id', { count: 'exact', head: true })
        .eq('spaceId', space.id)
        .eq('status', 'pending'),
    ]);
    if (leadResult.error) throw leadResult.error;
    unreadLeadCount = leadResult.count ?? 0;
    overdueFollowUpCount = followUpResult.count ?? 0;
    pendingDraftCount = draftResult.count ?? 0;
  } catch {
    unreadLeadCount = 0;
    overdueFollowUpCount = 0;
    pendingDraftCount = 0;
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

  // Route-aware shell: the Chippi chat surface gets a different chrome
  // treatment than the dashboard pages — full-height main, no padded
  // wrapper, no footer, mobile bottom-clearance for MobileNav. Read the
  // pathname from the request headers (Next.js doesn't surface it on
  // server layouts directly). Fallback chain matches the broker layout.
  const headerStore = await headers();
  const requestPath =
    headerStore.get('x-pathname') ||
    headerStore.get('x-invoke-path') ||
    headerStore.get('x-matched-path') ||
    headerStore.get('next-url') ||
    '';
  const isChippiRoute = /\/s\/[^/]+\/chippi(?:\/|$|\?)/.test(requestPath);

  return (
    <div className="app-theme flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar slug={slug} spaceName={space.name} unreadLeadCount={unreadLeadCount} pendingDraftCount={pendingDraftCount ?? 0} overdueFollowUpCount={overdueFollowUpCount} isBroker={isBroker} brokerageName={brokerageName} brokerageRole={brokerageRole} brokerageMemberships={brokerageMemberships} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <PlatformBanner />
        <Header slug={slug} spaceName={space.name} title={space.name} isBroker={isBroker} brokerageName={brokerageName} />
        <AgentStatusBar slug={slug} />
        {isChippiRoute ? (
          // Chippi is the chat surface — fills the available height, no
          // dashboard padding wrapper, no footer. The MobileNav is hidden
          // below (a "Chippi" tab on the page you're already on is redundant
          // chrome that eats composer space). Only the iOS safe-area inset
          // is reserved at the bottom.
          <main className="flex-1 min-h-0 flex flex-col bg-background text-foreground pb-[env(safe-area-inset-bottom)] md:pb-0">
            <LiveNotifications spaceId={space.id} slug={slug} />
            {/* PageTransition gets `flex-1 min-h-0 flex flex-col` so the
                Chippi page's `h-full` actually has a filled height to
                resolve against. Without this, the chat workspace collapses
                to content height and the composer ends up mid-screen
                instead of pinned to the viewport bottom. */}
            <PageTransition className="flex-1 min-h-0 flex flex-col">{children}</PageTransition>
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto flex flex-col bg-background text-foreground">
            {/* Page content grows; footer always pins to the visible bottom of
                <main> regardless of how short the page is. */}
            <div className="w-full max-w-[1500px] mx-auto flex-1 min-w-0 px-4 sm:px-6 md:px-10 lg:px-12 py-5 md:py-7 pb-40 md:pb-24">
              <LiveNotifications spaceId={space.id} slug={slug} />
              <PageTransition>{children}</PageTransition>
            </div>
            <div className="w-full max-w-[1500px] mx-auto px-4 sm:px-6 md:px-10 lg:px-12 pb-4">
              <DashboardFooter />
            </div>
          </main>
        )}
      </div>
      {/* MobileNav — hidden on the chat surface so the composer can use the
          full bottom edge. Realtor returns to the rest of the app via the
          left-edge sidebar trigger or any link in the chat itself. */}
      {!isChippiRoute && <MobileNav slug={slug} isBroker={isBroker} />}
      {/* Persistent agent presence on every workspace page (hides itself on /chippi). */}
      <ChippiBar slug={slug} />
      {/* ⌘K palette — listens globally, renders a modal when open. */}
      <CommandPalette slug={slug} />
    </div>
  );
}
