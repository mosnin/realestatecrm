import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { rosterForBrokerage } from '@/lib/messaging';
import { FloorRoster, type FloorMember } from '@/components/broker/floor-roster';
import { H1, TITLE_FONT } from '@/lib/typography';
import { timeAgo } from '@/lib/formatting';

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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{ctx.brokerage.name}.</p>
        <h1 className={H1} style={TITLE_FONT}>
          The Floor
        </h1>
      </header>

      {/* The four standing numbers. Zero is a good number — it renders calm. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="group rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-accent/40"
          >
            <p
              className={
                k.value > 0 && k.tone === 'loud'
                  ? 'text-2xl font-semibold tabular-nums text-foreground'
                  : 'text-2xl font-semibold tabular-nums text-muted-foreground'
              }
            >
              {k.value}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground group-hover:text-foreground">
              {k.label}
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
          {/* 4. The coaching queue. */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-foreground">Coaching queue</h2>
              <Link href="/broker/reviews" className="text-xs text-muted-foreground hover:text-foreground">
                All reviews →
              </Link>
            </div>
            {openReviews.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted-foreground">
                No open reviews — nobody is waiting on your judgement.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {openReviews.map((r) => (
                  <li key={r.id}>
                    <Link href={`/broker/reviews/${r.id}`} className="block px-5 py-3 transition-colors hover:bg-accent/40">
                      <p className="truncate text-[13px] text-foreground">{r.reason}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {agentName(r.requestingUserId)} · waiting {timeAgo(r.createdAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3. What's stalled. */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-foreground">Stalled deals</h2>
              <Link href="/broker/deals" className="text-xs text-muted-foreground hover:text-foreground">
                All deals →
              </Link>
            </div>
            {stalledDeals.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted-foreground">
                Nothing stalled — every active deal moved in the last {STALLED_AFTER_DAYS} days.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {stalledDeals.map((d) => (
                  <li key={d.id} className="px-5 py-3">
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
            )}
          </section>

          {/* 2. Leads nobody touched. */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-foreground">Untouched leads</h2>
              <Link href="/broker/leads" className="text-xs text-muted-foreground hover:text-foreground">
                All leads →
              </Link>
            </div>
            {untouchedLeads.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted-foreground">
                Every new lead has been contacted. That&rsquo;s the whole job.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {untouchedLeads.map((l) => (
                  <li key={l.id} className="px-5 py-3">
                    <p className="truncate text-[13px] text-foreground">{l.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {agentBySpace.get(l.spaceId) ?? 'Unrouted'} · arrived {timeAgo(l.createdAt)}, never contacted
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
