import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { Sidebar } from '@/components/dashboard/sidebar';
import { SidebarCollapseProvider } from '@/components/dashboard/sidebar-collapse';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { Header } from '@/components/dashboard/header';
import { AccountSwitchSwipe } from '@/components/dashboard/account-switch';
import { BrokerMain } from '@/components/broker/broker-main';
import { supabase } from '@/lib/supabase';
import { isAccountComped } from '@/lib/billing/comp';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { ChippiSplash } from '@/components/dashboard/chippi-splash';
import { pickGreeting } from '@/lib/greetings';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Teams — Chippi' };

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const ctx = await getBrokerMemberContext();

  // Not a broker — redirect to the setup page
  if (!ctx) {
    redirect('/setup');
  }

  // Look up their realtor workspace (may not exist for broker-only accounts)
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id, slug, name')
    .eq('ownerId', ctx.dbUserId)
    .maybeSingle();

  // Check if this is a broker-only account (no personal workspace)
  const { data: userRow } = await supabase
    .from('User')
    .select('accountType, platformRole')
    .eq('id', ctx.dbUserId)
    .maybeSingle();

  const isBrokerOnly = userRow?.accountType === 'broker_only';
  const isPlatformAdmin = userRow?.platformRole === 'admin';

  // If they have no space and are NOT broker-only, send to setup
  if (!spaceRow && !isBrokerOnly) {
    redirect('/setup');
  }

  const slug = spaceRow?.slug as string ?? '';
  const spaceName = (spaceRow?.name as string) ?? ctx.brokerage.name;

  // Subscription gate — the BROKERAGE is the billing entity (a brokerage-scoped
  // Stripe subscription on the Brokerage row), so the owner subscribes/manages
  // at /broker/billing — NOT /subscribe (which checks out the owner's personal
  // Space, the wrong entity for a team plan).
  const brokerHeaders = await headers();
  const brokerPath = brokerHeaders.get('x-pathname')
    || brokerHeaders.get('x-invoke-path')
    || brokerHeaders.get('x-matched-path')
    || brokerHeaders.get('next-url')
    || '';
  // Always let the owner reach billing/settings so they can subscribe or fix a
  // payment problem — otherwise the gate would bounce them away from the very
  // page that resolves it.
  const isBillingOrSettings =
    brokerPath.includes('/billing') ||
    brokerPath.includes('/settings');

  const isOwnerOfBrokerage = ctx.brokerage.ownerId === ctx.dbUserId;

  // Complimentary (admin-granted) access skips the brokerage subscription gate —
  // internal/demo brokerages get in without a Stripe subscription. Resilient.
  const brokerageComped = await isAccountComped('Brokerage', ctx.brokerage.id);

  if (!isPlatformAdmin && isOwnerOfBrokerage && !isBillingOrSettings && !brokerageComped) {
    // Only the brokerage OWNER is gated by subscription. Invited admins and
    // members access the broker dashboard for free — billing is the owner's
    // responsibility (handled by the !isOwnerOfBrokerage skip).
    try {
      // 1) The brokerage's OWN subscription — the current, correct billing entity.
      const { data: brokerageSub, error: brokerageSubError } = await supabase
        .from('Brokerage')
        .select('stripeSubscriptionStatus')
        .eq('id', ctx.brokerage.id)
        .maybeSingle();
      if (brokerageSubError) throw brokerageSubError;
      const brokerageStatus = brokerageSub?.stripeSubscriptionStatus ?? 'inactive';
      const brokerageSubscribed = brokerageStatus === 'active' || brokerageStatus === 'trialing';

      // 2) Legacy fallback: brokerages that subscribed through the OLD Space flow
      //    (on the owner's personal Space) before brokerage billing existed. An
      //    active/trialing Space sub keeps those owners working — we must NOT
      //    lock them out just because the Brokerage row has no sub yet.
      let legacySpaceSubscribed = false;
      if (!brokerageSubscribed) {
        const { data: legacySpace } = await supabase
          .from('Space')
          .select('stripeSubscriptionStatus')
          .eq('ownerId', ctx.brokerage.ownerId)
          .maybeSingle();
        const legacyStatus = legacySpace?.stripeSubscriptionStatus ?? 'inactive';
        legacySpaceSubscribed = legacyStatus === 'active' || legacyStatus === 'trialing';
      }

      // Not subscribed on EITHER entity → send to the brokerage billing surface
      // (self-serve Team / Team Plus checkout + payment management live there).
      if (!brokerageSubscribed && !legacySpaceSubscribed) {
        redirect('/broker/billing');
      }
    } catch (err: any) {
      // Next.js redirect() throws a special error — re-throw it.
      if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err;
      // On a real query error, fail closed to the (exempt) billing page rather
      // than leave an unsubscribed owner inside the dashboard. /broker/billing
      // re-checks ownership and is always reachable (exempt above).
      console.error('[broker-layout] Subscription gate error:', err);
      redirect('/broker/billing');
    }
  }

  // ── Broker's first name (for greeting) ────────────────────────────────────
  let brokerFirstName = '';
  try {
    const { data: brokerUserRow } = await supabase
      .from('User')
      .select('name')
      .eq('id', ctx.dbUserId)
      .maybeSingle();
    brokerFirstName = (brokerUserRow?.name ?? '').trim().split(/\s+/)[0] ?? '';
  } catch {
    brokerFirstName = '';
  }

  // ── Brokerage-wide snapshot counts ────────────────────────────────────────
  // Aggregate across all member spaces (including the owner's own space).
  let unreadLeadCount = 0;
  let brokerFollowUpsDue = 0;
  let brokerDraftsReady = 0;
  try {
    const allMembers = await getBrokerageMembers(ctx.brokerage.id, { includeSpaceName: true });
    const memberSpaceIds = allMembers
      .map((m) => m.Space?.id)
      .filter((id): id is string => Boolean(id));

    // Also include the owner's own space if not already captured.
    if (spaceRow && !memberSpaceIds.includes(spaceRow.id as string)) {
      memberSpaceIds.push(spaceRow.id as string);
    }

    if (memberSpaceIds.length > 0) {
      const now = new Date().toISOString();
      const [leadResult, followUpResult, draftResult] = await Promise.all([
        // new-lead contacts across all member spaces
        supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .in('spaceId', memberSpaceIds)
          .contains('tags', ['new-lead']),
        // overdue follow-ups on Deal across all member spaces
        supabase
          .from('Deal')
          .select('id', { count: 'exact', head: true })
          .in('spaceId', memberSpaceIds)
          .not('followUpAt', 'is', null)
          .lte('followUpAt', now),
        // pending AgentDrafts across all member spaces
        supabase
          .from('AgentDraft')
          .select('id', { count: 'exact', head: true })
          .in('spaceId', memberSpaceIds)
          .eq('status', 'pending'),
      ]);
      unreadLeadCount = leadResult.count ?? 0;
      brokerFollowUpsDue = followUpResult.count ?? 0;
      brokerDraftsReady = draftResult.count ?? 0;
    } else if (spaceRow) {
      // Fallback: single owner space when member list is empty
      const now = new Date().toISOString();
      const [leadResult, followUpResult, draftResult] = await Promise.all([
        supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceRow.id)
          .contains('tags', ['new-lead']),
        supabase
          .from('Deal')
          .select('id', { count: 'exact', head: true })
          .eq('spaceId', spaceRow.id)
          .not('followUpAt', 'is', null)
          .lte('followUpAt', now),
        supabase
          .from('AgentDraft')
          .select('id', { count: 'exact', head: true })
          .eq('spaceId', spaceRow.id)
          .eq('status', 'pending'),
      ]);
      unreadLeadCount = leadResult.count ?? 0;
      brokerFollowUpsDue = followUpResult.count ?? 0;
      brokerDraftsReady = draftResult.count ?? 0;
    }
  } catch {
    unreadLeadCount = 0;
    brokerFollowUpsDue = 0;
    brokerDraftsReady = 0;
  }

  return (
    <div className="app-theme flex h-screen overflow-hidden bg-background text-foreground">
      {/* First-paint splash — greets the broker by name, shows a brokerage-wide
          snapshot of what's happening across member spaces, then dissolves. */}
      <ChippiSplash
        greeting={pickGreeting(brokerFirstName)}
        snapshot={{
          newLeads: unreadLeadCount,
          followUpsDue: brokerFollowUpsDue,
          draftsReady: brokerDraftsReady,
        }}
      />
      <AccountSwitchSwipe />
      <SidebarCollapseProvider>
        <Sidebar
          slug={slug}
          spaceName={spaceName}
          unreadLeadCount={unreadLeadCount}
          isBroker={true}
          isBrokerOnly={isBrokerOnly}
          brokerageName={ctx.brokerage.name}
          brokerageRole={ctx.membership.role}
          brokerageMemberships={[{ id: ctx.brokerage.id, name: ctx.brokerage.name, role: ctx.membership.role }]}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header slug={slug} spaceName={spaceName} title={spaceName} isBroker={true} isBrokerOnly={isBrokerOnly} brokerageName={ctx.brokerage.name} />
          {/* Chat-vs-dashboard padding is decided client-side by usePathname()
              inside BrokerMain — NOT by the fragile x-pathname header — so the
              container is always correct and nothing touches the screen edge. */}
          <BrokerMain>{children}</BrokerMain>
        </div>
      </SidebarCollapseProvider>
      <MobileNav slug={slug} isBroker={true} isBrokerOnly={isBrokerOnly} />
    </div>
  );
}
