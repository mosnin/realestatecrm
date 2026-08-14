import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { rosterForBrokerage } from '@/lib/messaging';
import { FloorRoster, type FloorMember } from '@/components/broker/floor-roster';
import {
  SurfaceCardHeader,
  AccentBarLabel,
  InsightStrip,
} from '@/components/ui/surface-card';
import { TITLE_FONT, PRIMARY_PILL } from '@/lib/typography';
import { timeAgo } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import { SplitReveal } from '@/components/motion';
import {
  BROKER_CONTROL_QUIET,
  BROKER_DIVIDED_LIST,
  BROKER_EMPTY,
  BROKER_ORIENTATION,
  BROKER_PAGE_WIDE,
  BROKER_PANEL,
  BROKER_PANEL_DENSE,
  BROKER_ROW,
} from '@/components/broker/premium';

/**
 * /broker/floor — The Floor: the brokerage's single command view.
 *
 * One screen answers the floor manager's four standing questions:
 *   1. Who can I reach right now?      → live roster (presence + last seen)
 *   2. What's waiting with no owner?   → untouched new leads
 *   3. What's stalled?                 → active deals with no movement
 *   4. Who's asking for my judgement?  → open deal reviews (the coaching queue)
 *
 * Everything on it links into the deeper surface that owns the work (Leads,
 * Deals, Reviews, Messages) — the Floor is for SEEING; the surfaces below it
 * are for doing. Admins/owners only; realtor members get their own day view.
 */

const STALLED_AFTER_DAYS = 10;

export default async function BrokerFloorPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/broker');

  const roster = await rosterForBrokerage(ctx.brokerage.id);
  const userIds = roster.map((r) => r.userId);

  // The brokerage's spaces: every member's own workspace (+ the owner's,
  // where unrouted brokerage leads land first).
  const { data: spaceRows } = userIds.length
    ? await supabase.from('Space').select('id, ownerId, name').in('ownerId', userIds)
    : { data: [] as { id: string; ownerId: string; name: string }[] };
  const spaces = (spaceRows ?? []) as { id: string; ownerId: string; name: string }[];
  const spaceIds = spaces.map((s) => s.id);
  const agentBySpace = new Map(
    spaces.map((s) => {
      const owner = roster.find((r) => r.userId === s.ownerId);
      return [s.id, owner?.name || owner?.email || s.name] as const;
    }),
  );

  const stalledBefore = new Date(Date.now() - STALLED_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [untouchedLeadsRes, stalledDealsRes, reviewsRes, pendingDraftsRes] = await Promise.all([
    // 2. New leads nobody has touched yet.
    spaceIds.length
      ? supabase
          .from('Contact')
          .select('id, name, createdAt, spaceId', { count: 'exact' })
          .in('spaceId', spaceIds)
          .contains('tags', ['new-lead'])
          .is('lastContactedAt', null)
          .order('createdAt', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], count: 0 }),
    // 3. Active deals with no movement in STALLED_AFTER_DAYS.
    spaceIds.length
      ? supabase
          .from('Deal')
          .select('id, title, value, updatedAt, spaceId', { count: 'exact' })
          .in('spaceId', spaceIds)
          .eq('status', 'active')
          .lt('updatedAt', stalledBefore)
          .order('updatedAt', { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [], count: 0 }),
    // 4. Open review requests — agents explicitly asking for broker judgement.
    supabase
      .from('DealReviewRequest')
      .select('id, reason, createdAt, requestingUserId', { count: 'exact' })
      .eq('brokerageId', ctx.brokerage.id)
      .eq('status', 'open')
      .order('createdAt', { ascending: true })
      .limit(5),
    // Chippi drafts awaiting a human across the floor.
    spaceIds.length
      ? supabase
          .from('AgentDraft')
          .select('*', { count: 'exact', head: true })
          .in('spaceId', spaceIds)
          .eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
  ]);

  const untouchedLeads = (untouchedLeadsRes.data ?? []) as {
    id: string; name: string; createdAt: string; spaceId: string;
  }[];
  const stalledDeals = (stalledDealsRes.data ?? []) as {
    id: string; title: string | null; value: number | null; updatedAt: string; spaceId: string;
  }[];
  const openReviews = (reviewsRes.data ?? []) as {
    id: string; reason: string; createdAt: string; requestingUserId: string;
  }[];

  const counts = {
    leads: untouchedLeadsRes.count ?? 0,
    stalled: stalledDealsRes.count ?? 0,
    reviews: reviewsRes.count ?? 0,
    drafts: pendingDraftsRes.count ?? 0,
  };

  const agentName = (userId: string) => {
    const m = roster.find((r) => r.userId === userId);
    return m?.name || m?.email || 'Unknown agent';
  };

  const kpis: { label: string; value: number; href: string; tone: 'loud' | 'calm' }[] = [
    { label: 'Untouched leads', value: counts.leads, href: '/broker/leads', tone: 'loud' },
    { label: 'Stalled deals', value: counts.stalled, href: '/broker/deals', tone: 'loud' },
    { label: 'Reviews waiting', value: counts.reviews, href: '/broker/reviews', tone: 'calm' },
    { label: 'Drafts pending', value: counts.drafts, href: '/broker/reviews', tone: 'calm' },
  ];

  // The coaching queue is the floor's most "alive" surface — people explicitly
  // asking for judgement. It becomes the view's ONE solid accent card whenever
  // someone is actually waiting; empty, it recedes to a calm surface card.
  // Honest one-line reads for the insight strips, computed from the same rows
  // rendered above them. Each hides when its list is empty.
  const oldestReviewAgo = openReviews.length ? timeAgo(openReviews[0].createdAt) : null; // asc → oldest first
  const longestStalledAgo = stalledDeals.length ? timeAgo(stalledDeals[0].updatedAt) : null; // asc updatedAt → most stalled first
  const oldestLeadAgo = untouchedLeads.length
    ? timeAgo(untouchedLeads[untouchedLeads.length - 1].createdAt) // desc createdAt → oldest last
    : null;
  const moreSuffix = (total: number, shown: number) => (total > shown ? ` · ${total - shown} more` : '');

  return (
    <div className={cn(BROKER_PAGE_WIDE, 'max-w-7xl')} data-broker-premium-page="floor" data-broker-family="operations-floor">
      <header className="grid gap-7 border-b chippi-dashboard-divider pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end" data-route-orientation="live-operations">
        <div className="max-w-3xl space-y-3">
          <p className={BROKER_ORIENTATION}>{ctx.brokerage.name} · live operations</p>
          <h1 className="text-4xl tracking-[-0.04em] text-foreground sm:text-5xl" style={TITLE_FONT}>
          <SplitReveal as="span" text="The Floor" />
          </h1>
          <p className="text-base text-muted-foreground">See who is reachable, what is sitting untouched, and where the team needs your judgement right now.</p>
        </div>
        <Link
          href={`/broker/chippi?prompt=${encodeURIComponent('Review the floor and handle the most urgent lead, deal, or coaching issue first.')}`}
          className={PRIMARY_PILL}
        >
          Put Chippi to work
        </Link>
      </header>

      {/* The four standing numbers. Zero is a good number — it renders calm. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className={cn(
              BROKER_PANEL_DENSE,
              'group block transition-colors duration-150 hover:bg-dashboard-paper-muted',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            )}
          >
            <AccentBarLabel>{k.label}</AccentBarLabel>
            <p
              className={cn(
                'mt-2 text-[25px] leading-tight tracking-tight tabular-nums',
                k.value > 0 && k.tone === 'loud' ? 'text-foreground' : 'text-muted-foreground/70',
              )}
              style={TITLE_FONT}
            >
              {k.value}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]" data-primary-work-geometry="live-floor-grid">
        {/* 1. Who can I reach right now — live. */}
        <FloorRoster
          brokerageId={ctx.brokerage.id}
          meId={ctx.dbUserId}
          members={roster as FloorMember[]}
        />

        <div className="space-y-4">
          {/* 4. The coaching queue — the floor's most alive surface. */}
          <section className={cn(BROKER_PANEL, 'overflow-hidden')}>
            <div className="p-6 sm:p-7">
              <SurfaceCardHeader
                title="Coaching queue"
                action={
                  <Link
                    href="/broker/reviews"
                    className={BROKER_CONTROL_QUIET}
                  >
                    All reviews →
                  </Link>
                }
              />
              {openReviews.length === 0 ? (
                <CalmEmpty>
                  No open reviews — nobody is waiting on your judgement.
                </CalmEmpty>
              ) : (
                <>
                  <ul className={cn(BROKER_DIVIDED_LIST, 'mt-4')}>
                    {openReviews.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/broker/reviews/${r.id}`}
                          className={cn(BROKER_ROW, 'block')}
                        >
                          <p className="truncate text-[13px] text-foreground">{r.reason}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {agentName(r.requestingUserId)} · waiting {timeAgo(r.createdAt)}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {oldestReviewAgo && (
                    <Link
                      href="/broker/reviews"
                      className={cn(BROKER_ROW, 'mt-4 items-center text-sm')}
                    >
                      <span className="flex-1 min-w-0 truncate">
                        Oldest waiting {oldestReviewAgo}
                        {moreSuffix(counts.reviews, openReviews.length)}
                      </span>
                      <span aria-hidden className="shrink-0">→</span>
                    </Link>
                  )}
                </>
              )}
            </div>
          </section>

          {/* 3. What's stalled. */}
          <section className={BROKER_PANEL}>
            <SurfaceCardHeader
              title="Stalled deals"
              action={
                <Link
                  href="/broker/deals"
                  className={BROKER_CONTROL_QUIET}
                >
                  All deals →
                </Link>
              }
            />
            {stalledDeals.length === 0 ? (
              <CalmEmpty>
                Nothing stalled — every active deal moved in the last {STALLED_AFTER_DAYS} days.
              </CalmEmpty>
            ) : (
              <>
                <ul className={cn(BROKER_DIVIDED_LIST, 'mt-4')}>
                  {stalledDeals.map((d) => (
                    <li key={d.id} className={BROKER_ROW}>
                      <p className="truncate text-[13px] text-foreground">
                        {d.title || 'Untitled deal'}
                        {d.value != null && (
                          <span className="ml-2 text-[12px] tabular-nums text-muted-foreground">
                            ${Math.round(d.value).toLocaleString()}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {agentBySpace.get(d.spaceId) ?? 'Unknown agent'} · no movement since {timeAgo(d.updatedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
                {longestStalledAgo && (
                  <InsightStrip href="/broker/deals">
                    Longest idle {longestStalledAgo}
                    {moreSuffix(counts.stalled, stalledDeals.length)}
                  </InsightStrip>
                )}
              </>
            )}
          </section>

          {/* 2. Leads nobody touched. */}
          <section className={BROKER_PANEL}>
            <SurfaceCardHeader
              title="Untouched leads"
              action={
                <Link
                  href="/broker/leads"
                  className={BROKER_CONTROL_QUIET}
                >
                  All leads →
                </Link>
              }
            />
            {untouchedLeads.length === 0 ? (
              <CalmEmpty>
                Every new lead has been contacted. That&rsquo;s the whole job.
              </CalmEmpty>
            ) : (
              <>
                <ul className={cn(BROKER_DIVIDED_LIST, 'mt-4')}>
                  {untouchedLeads.map((l) => (
                    <li key={l.id} className={BROKER_ROW}>
                      <p className="truncate text-[13px] text-foreground">{l.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {agentBySpace.get(l.spaceId) ?? 'Unrouted'} · arrived {timeAgo(l.createdAt)}, never contacted
                      </p>
                    </li>
                  ))}
                </ul>
                {oldestLeadAgo && (
                  <InsightStrip href="/broker/leads">
                    Oldest arrived {oldestLeadAgo}
                    {moreSuffix(counts.leads, untouchedLeads.length)}
                  </InsightStrip>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Designed calm empty state — a soft-circle icon over the section's existing
 * copy. Used when a list card has nothing waiting (all of which are good news
 * on the Floor), so the surface reads settled rather than broken.
 */
function CalmEmpty({ children }: { children: ReactNode }) {
  return (
    <div className={cn(BROKER_EMPTY, 'mt-4')}>
      <p className="max-w-xs text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}
