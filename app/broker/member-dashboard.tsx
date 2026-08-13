import { supabase } from '@/lib/supabase';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { pluralize } from '@/lib/formatting';
import {
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { BODY_MUTED, H1, SECTION_LABEL, TITLE_FONT } from '@/lib/typography';
import { cn } from '@/lib/utils';
import type { Brokerage, BrokerageMembership } from '@/lib/types';
import { BriefKpiTile } from '@/components/broker/brief-kpi-tile';
import { BriefReveal } from '@/components/broker/brief-section';
import { SplitReveal } from '@/components/motion';
import { AsciiField } from '@/components/marketing/fortitudo/ascii-field';
import {
  BROKER_DIVIDED_LIST,
  BROKER_EMPTY,
  BROKER_HERO,
  BROKER_PAGE_READING,
  BROKER_PAGE_WIDE,
  BROKER_PANEL,
  BROKER_ROW,
  BROKER_STATUS,
} from '@/components/broker/premium';

type MemberDashboardProps = {
  ctx: {
    brokerage: Brokerage;
    membership: BrokerageMembership;
    dbUserId: string;
  };
};

export async function MemberDashboard({ ctx }: MemberDashboardProps) {
  const { brokerage, dbUserId } = ctx;

  // Find the member's personal Space
  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name')
    .eq('ownerId', dbUserId)
    .maybeSingle();

  // Find the member's User record for the name
  const { data: userRow } = await supabase
    .from('User')
    .select('name, email')
    .eq('id', dbUserId)
    .maybeSingle();

  const userName = userRow?.name ?? userRow?.email ?? 'Real estate agent';
  const firstName = userName.split(' ')[0] ?? userName;

  if (!space) {
    return (
      <div className={BROKER_PAGE_READING} data-broker-premium-page="member-today-empty">
        <header className="space-y-1.5">
          <p className={cn(BODY_MUTED)}>Today.</p>
          <h1 className={cn(H1)} style={TITLE_FONT}>
            <SplitReveal as="span" text={`Welcome, ${firstName}`} />
          </h1>
          <p className={cn(BODY_MUTED)}>
            {`${brokerage.name} · finish your workspace to start tracking leads.`}
          </p>
        </header>
        <div className={BROKER_EMPTY}>
          <p className="text-sm text-foreground">Set up your workspace.</p>
          <p className={cn('text-xs mt-1', BODY_MUTED)}>
            <Link href="/setup" className="underline-offset-2 hover:underline">
              Complete setup
            </Link>{' '}
            to view your dashboard.
          </p>
        </div>
      </div>
    );
  }

  const spaceId = space.id;
  const spaceSlug = space.slug;

  // Resolve the brokerage's admin/owner spaces FIRST so the announcement
  // query can be scoped server-side. Previously this lookup ran after the
  // Promise.all and the announcement query pulled every [ANN] note in the
  // database, then JS-filtered. That's a tenant-boundary leak AND O(global)
  // rows over the wire.
  const brokerMembers = await getBrokerageMembers(brokerage.id);
  const brokerSpaceIds = Array.from(
    new Set(
      brokerMembers
        .filter((m) => m.role === 'broker_owner' || m.role === 'broker_admin')
        .map((m) => m.Space?.id)
        .filter((id): id is string => Boolean(id))
    )
  );

  // ── Fetch stats in parallel ──
  const now = new Date().toISOString();

  const [
    assignedLeadsRes,
    contactedLeadsRes,
    activeDealsRes,
    wonDealsRes,
    recentLeadsRes,
    overdueFollowUpsRes,
    announcementsRes,
  ] = await Promise.all([
    // Count leads assigned by broker
    spaceId
      ? supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .contains('tags', ['assigned-by-broker'])
      : Promise.resolve({ count: 0 }),
    // Count contacted leads (lastContactedAt set)
    spaceId
      ? supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .contains('tags', ['assigned-by-broker'])
          .not('lastContactedAt', 'is', null)
      : Promise.resolve({ count: 0 }),
    // Active deals
    spaceId
      ? supabase
          .from('Deal')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .eq('status', 'active')
      : Promise.resolve({ count: 0 }),
    // Won deals
    spaceId
      ? supabase
          .from('Deal')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .eq('status', 'won')
      : Promise.resolve({ count: 0 }),
    // Recent assigned leads (last 5)
    spaceId
      ? supabase
          .from('Contact')
          .select('id, name, phone, email, leadScore, scoreLabel, createdAt')
          .eq('spaceId', spaceId)
          .contains('tags', ['assigned-by-broker'])
          .order('createdAt', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    // Overdue follow-ups
    spaceId
      ? supabase
          .from('Contact')
          .select('id, name, phone, email, followUpAt')
          .eq('spaceId', spaceId)
          .not('followUpAt', 'is', null)
          .lte('followUpAt', now)
          .order('followUpAt', { ascending: true })
          .limit(10)
      : Promise.resolve({ data: [] }),
    // Announcements from broker's space (Notes with title starting with [ANN]).
    // Scoped server-side via `.in('spaceId', ...)` — never pull other tenants'
    // notes over the wire just to filter them out here.
    brokerSpaceIds.length > 0
      ? supabase
          .from('Note')
          .select('id, title, content, createdAt, spaceId')
          .ilike('title', '[ANN]%')
          .in('spaceId', brokerSpaceIds)
          .order('createdAt', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
  ]);

  const assignedCount = assignedLeadsRes.count ?? 0;
  const contactedCount = contactedLeadsRes.count ?? 0;
  const activeDealsCount = activeDealsRes.count ?? 0;
  const wonDealsCount = wonDealsRes.count ?? 0;

  const recentLeads = (recentLeadsRes.data ?? []) as Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    leadScore: number | null;
    scoreLabel: string | null;
    createdAt: string;
  }>;

  const overdueFollowUps = (overdueFollowUpsRes.data ?? []) as Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    followUpAt: string;
  }>;

  // Announcements are already server-scoped to brokerSpaceIds and limit(3).
  const announcements = (announcementsRes.data ?? []) as Array<{
    id: string;
    title: string;
    content: string;
    createdAt: string;
    spaceId: string;
  }>;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  function getScoreBadge(scoreLabel: string | null, leadScore: number | null) {
    if (!scoreLabel && leadScore == null) return null;
    const label = scoreLabel ?? `${leadScore}`;
    return (
      <span className={BROKER_STATUS}>
        {label}
      </span>
    );
  }

  // Compose the calm one-sentence status for the header.
  const statusSentence = (() => {
    const parts: string[] = [];
    if (assignedCount > 0) {
      parts.push(`${assignedCount} assigned ${pluralize(assignedCount, 'lead')}`);
    }
    if (activeDealsCount > 0) {
      parts.push(`${activeDealsCount} active ${pluralize(activeDealsCount, 'deal')}`);
    }
    if (overdueFollowUps.length > 0) {
      parts.push(
        `${overdueFollowUps.length} ${pluralize(overdueFollowUps.length, 'follow-up')} due`,
      );
    }
    if (parts.length === 0) {
      return `${brokerage.name} · quiet day — nothing in flight.`;
    }
    return `${brokerage.name} · ${parts.join(' · ')}.`;
  })();

  return (
    <div className={BROKER_PAGE_WIDE} data-broker-premium-page="member-today">
      {/* ── Header — canonical three-line status-sentence pattern.
          Muted greeting → serif H1 → one-sentence status. Same shape
          every other broker page uses. ── */}
      <BriefReveal delay={0.01} className={cn(BROKER_HERO, 'min-h-[24rem] sm:min-h-[28rem]')}>
        <div
          aria-hidden="true"
          data-chippi-atmosphere="ascii-field"
          className="chippi-dashboard-atmosphere pointer-events-none absolute inset-0"
        >
          <AsciiField className="h-full w-full" cell={13} speed={0.035} />
        </div>
        <header className="relative z-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground/70">
            CHIPPI // TODAY
          </p>
          <h1
            className="mt-10 max-w-4xl text-[2.65rem] leading-[0.98] tracking-[-0.035em] text-foreground sm:text-[3.65rem] lg:text-[4.5rem]"
            style={TITLE_FONT}
          >
            <SplitReveal as="span" text={`Welcome back, ${firstName}`} />
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-foreground/80 sm:text-lg">
            {statusSentence}
          </p>
        </header>
      </BriefReveal>

      {/* ── Stats row — hairline-divider snapshot, mirrors deal-quick-panel.
          Foreground for values, muted for labels. Icons stay for scanning
          but render muted; no colored backgrounds. The focal counts tick up
          on entry (BriefKpiTile → AnimatedNumber, reduced-motion aware). ── */}
      <BriefReveal
        delay={0.04}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        {[
          { label: 'Leads assigned', value: assignedCount },
          { label: 'Leads contacted', value: contactedCount },
          { label: 'Active deals', value: activeDealsCount },
          { label: 'Deals closed', value: wonDealsCount },
        ].map(({ label, value }) => (
          <BriefKpiTile key={label} label={label} value={value} dim={value === 0} />
        ))}
      </BriefReveal>

      {/* ── Two-column layout: Recent leads + Overdue follow-ups ── */}
      <BriefReveal delay={0.08} as="div" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent assigned leads */}
        <section className={cn(BROKER_PANEL, 'space-y-3')}>
          <div className="flex items-center justify-between">
            <h2 className={SECTION_LABEL}>Recent assigned leads</h2>
            <Link
              href="/broker/my-leads"
              className="group/all text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              View all{' '}
              <ArrowRight
                size={12}
                className="transition-transform duration-200 group-hover/all:translate-x-0.5"
              />
            </Link>
          </div>

          {recentLeads.length === 0 ? (
            <div className={BROKER_EMPTY}>
              <p className="text-sm text-foreground">No assigned leads yet.</p>
              <p className={cn('text-xs mt-1', BODY_MUTED)}>
                Leads assigned by your team will land here.
              </p>
            </div>
          ) : (
            <ul className={BROKER_DIVIDED_LIST}>
              {recentLeads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={spaceSlug ? `/s/${spaceSlug}/leads/${lead.id}` : '#'}
                    className={cn(BROKER_ROW, 'items-center')}
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 transition-colors group-hover/lead:bg-foreground/[0.07]">
                      <span className="text-xs font-semibold text-muted-foreground transition-colors group-hover/lead:text-foreground">
                        {(lead.name ?? '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{lead.name}</p>
                        {getScoreBadge(lead.scoreLabel, lead.leadScore)}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {[lead.phone, lead.email].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground flex-shrink-0">
                      {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Overdue follow-ups */}
        <section className={cn(BROKER_PANEL, 'space-y-3')}>
          <h2 className={SECTION_LABEL}>Overdue follow-ups</h2>

          {overdueFollowUps.length === 0 ? (
            <div className={BROKER_EMPTY}>
              <p className="text-sm text-foreground">All caught up.</p>
              <p className={cn('text-xs mt-1', BODY_MUTED)}>
                No overdue follow-ups right now.
              </p>
            </div>
          ) : (
            <ul className={BROKER_DIVIDED_LIST}>
              {overdueFollowUps.map((contact) => {
                const followUp = new Date(contact.followUpAt);
                const isOverdue = followUp < todayStart;

                return (
                  <li key={contact.id}>
                    <Link
                      href={spaceSlug ? `/s/${spaceSlug}/leads/${contact.id}` : '#'}
                      className={cn(BROKER_ROW, 'items-center')}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{contact.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[contact.phone, contact.email].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span
                        className={cn(BROKER_STATUS, 'flex-shrink-0')}
                      >
                        {isOverdue
                          ? `Overdue ${followUp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                          : 'Today'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </BriefReveal>

      {/* ── Latest announcements ── */}
      <BriefReveal delay={0.12} as="section" className={cn(BROKER_PANEL, 'space-y-3')}>
        <div className="flex items-center justify-between">
          <h2 className={SECTION_LABEL}>Announcements</h2>
        </div>

        {announcements.length === 0 ? (
          <div className={BROKER_EMPTY}>
            <p className="text-sm text-foreground">No announcements.</p>
            <p className={cn('text-xs mt-1', BODY_MUTED)}>
              Notes from your team will appear here.
            </p>
          </div>
        ) : (
          <ul className={BROKER_DIVIDED_LIST}>
            {announcements.map((note) => (
              <li key={note.id} className={BROKER_ROW}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-foreground">
                    {note.title.replace(/^\[ANN\]\s*/, '')}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex-shrink-0">
                    {new Date(note.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {note.content?.slice(0, 200)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </BriefReveal>
    </div>
  );
}
