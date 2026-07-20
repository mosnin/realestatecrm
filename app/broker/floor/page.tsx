import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Inbox, MessageSquareHeart, TrendingUp } from 'lucide-react';
import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { rosterForBrokerage } from '@/lib/messaging';
import { FloorRoster, type FloorMember } from '@/components/broker/floor-roster';
import {
  SurfaceCard,
  SurfaceCardHeader,
  AccentBarLabel,
  InsightStrip,
  SURFACE_CARD,
  ACCENT_CARD_PILL,
} from '@/components/ui/surface-card';
import { H1, TITLE_FONT } from '@/lib/typography';
import { timeAgo } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import { SplitReveal } from '@/components/motion';

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
  const coachingAlive = openReviews.length > 0;

  // Honest one-line reads for the insight strips, computed from the same rows
  // rendered above them. Each hides when its list is empty.
  const oldestReviewAgo = openReviews.length ? timeAgo(openReviews[0].createdAt) : null; // asc → oldest first
  const longestStalledAgo = stalledDeals.length ? timeAgo(stalledDeals[0].updatedAt) : null; // asc updatedAt → most stalled first
  const oldestLeadAgo = untouchedLeads.length
    ? timeAgo(untouchedLeads[untouchedLeads.length - 1].createdAt) // desc createdAt → oldest last
    : null;
  const moreSuffix = (total: number, shown: number) => (total > shown ? ` · ${total - shown} more` : '');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{ctx.brokerage.name}.</p>
        <h1 className={H1} style={TITLE_FONT}>
          <SplitReveal as="span" text="The Floor" />
        </h1>
      </header>

      {/* The four standing numbers. Zero is a good number — it renders calm. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className={cn(
              SURFACE_CARD,
              'group block p-5 transition-shadow duration-150 hover:shadow-[0_1px_2px_rgb(17_17_19/0.04),0_16px_36px_-20px_rgb(17_17_19/0.18)]',
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. Who can I reach right now — live. */}
        <FloorRoster
          brokerageId={ctx.brokerage.id}
          meId={ctx.dbUserId}
          members={roster as FloorMember[]}
        />

        <div className="space-y-4">
          {/* 4. The coaching queue — the floor's most alive surface. */}
          <SurfaceCard accent={coachingAlive} className="p-0 sm:p-0 overflow-hidden">
            <div className="p-6 sm:p-7">
              <SurfaceCardHeader
                title="Coaching queue"
                onAccent={coachingAlive}
                action={
                  <Link
                    href="/broker/reviews"
                    className={
                      coachingAlive
                        ? ACCENT_CARD_PILL
                        : 'text-xs text-muted-foreground transition-colors hover:text-foreground'
                    }
                  >
                    All reviews →
                  </Link>
                }
              />
              {openReviews.length === 0 ? (
                <CalmEmpty icon={<MessageSquareHeart size={20} strokeWidth={1.5} />}>
                  No open reviews — nobody is waiting on your judgement.
                </CalmEmpty>
              ) : (
                <>
                  <ul className="mt-4 space-y-1.5">
                    {openReviews.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/broker/reviews/${r.id}`}
                          className="block rounded-2xl bg-white/10 px-4 py-3 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                        >
                          <p className="truncate text-[13px] text-white">{r.reason}</p>
                          <p className="mt-0.5 text-[11px] text-white/75">
                            {agentName(r.requestingUserId)} · waiting {timeAgo(r.createdAt)}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {oldestReviewAgo && (
                    <Link
                      href="/broker/reviews"
                      className="mt-4 flex items-center gap-2.5 rounded-2xl bg-white/20 px-4 py-3 text-sm text-white transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
          </SurfaceCard>

          {/* 3. What's stalled. */}
          <SurfaceCard>
            <SurfaceCardHeader
              title="Stalled deals"
              action={
                <Link
                  href="/broker/deals"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  All deals →
                </Link>
              }
            />
            {stalledDeals.length === 0 ? (
              <CalmEmpty icon={<TrendingUp size={20} strokeWidth={1.5} />}>
                Nothing stalled — every active deal moved in the last {STALLED_AFTER_DAYS} days.
              </CalmEmpty>
            ) : (
              <>
                <ul className="mt-4 divide-y divide-border/50">
                  {stalledDeals.map((d) => (
                    <li key={d.id} className="py-3 first:pt-0">
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
          </SurfaceCard>

          {/* 2. Leads nobody touched. */}
          <SurfaceCard>
            <SurfaceCardHeader
              title="Untouched leads"
              action={
                <Link
                  href="/broker/leads"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  All leads →
                </Link>
              }
            />
            {untouchedLeads.length === 0 ? (
              <CalmEmpty icon={<Inbox size={20} strokeWidth={1.5} />}>
                Every new lead has been contacted. That&rsquo;s the whole job.
              </CalmEmpty>
            ) : (
              <>
                <ul className="mt-4 divide-y divide-border/50">
                  {untouchedLeads.map((l) => (
                    <li key={l.id} className="py-3 first:pt-0">
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
          </SurfaceCard>
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
function CalmEmpty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col items-center py-6 text-center">
      <span
        aria-hidden
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-foreground/[0.04] text-muted-foreground/60"
      >
        {icon}
      </span>
      <p className="max-w-xs text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}
