import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { redirect } from 'next/navigation';
import {
  ChevronRight,
  ArrowRight,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';
import { formatCompact, formatCurrency } from '@/lib/formatting';
import { CHIPPI_PILL, SECTION_LABEL, TITLE_FONT, META, STAT_NUMBER_COMPACT } from '@/lib/typography';
import {
  AccentBarLabel,
  AddRow,
  CARD_TITLE,
  InsightStrip,
  StatusPill,
} from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';
import { dealHealth } from '@/lib/deals/health';
import { TeamActivityFeed } from '@/components/broker/team-activity-feed';
import { BrokerMorningStory } from '@/components/broker/broker-morning-story';
import { DraftImpactCard } from '@/components/broker/draft-impact-card';
import { BriefKpiTile } from '@/components/broker/brief-kpi-tile';
import { BriefReveal } from '@/components/broker/brief-section';
import {
  aggregateDraftStats,
  draftStatsWindowStart,
  type DraftStatsRow,
} from '@/lib/draft-stats';
import { MemberDashboard } from '../member-dashboard';
import { AsciiField } from '@/components/marketing/fortitudo/ascii-field';
import {
  BROKER_DIVIDED_LIST,
  BROKER_EMPTY,
  BROKER_HERO,
  BROKER_INSET,
  BROKER_PAGE_WIDE,
  BROKER_PANEL,
  BROKER_ROW,
} from '@/components/broker/premium';

// ── Revenue forecast helpers (mirrors app/broker/forecast/page.tsx) ──────────
//
// Closing probability table:
//   closeDate this month + on-track → 0.65 | at-risk → 0.40 | stuck → 0.15
//   closeDate past (overdue)         → 0.10 (stuck → 0.05)
//   no close date / future month    → on-track 0.20 | at-risk 0.10 | stuck 0.05

function closingProbability(
  closeDate: Date | null,
  health: 'on-track' | 'at-risk' | 'stuck',
  monthStart: Date,
  monthEnd: Date,
): number {
  const now = new Date();
  if (closeDate) {
    if (closeDate < now) return health === 'stuck' ? 0.05 : 0.10;
    if (closeDate >= monthStart && closeDate <= monthEnd) {
      if (health === 'on-track') return 0.65;
      if (health === 'at-risk') return 0.40;
      return 0.15;
    }
  }
  if (health === 'on-track') return 0.20;
  if (health === 'at-risk') return 0.10;
  return 0.05;
}

type ActiveDealRow = {
  id: string;
  spaceId: string;
  title: string;
  value: number | null;
  commissionRate: number | null;
  closeDate: string | null;
  stageId: string | null;
  status: string;
  updatedAt: string;
  stageChangedAt: string | null;
  followUpAt: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
};

// ── End revenue forecast helpers ─────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function BrokerBriefPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');

  // realtor_member sees their own work surface, not the swarm.
  if (ctx.membership.role === 'realtor_member') {
    return <MemberDashboard ctx={ctx} />;
  }

  const { brokerage } = ctx;
  const members = await getBrokerageMembers(ctx.brokerage.id, {
    includeOnboard: true,
    includeSpaceName: true,
  });

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Make sure the broker owner's space is included — brokerage leads land
  // there before being routed.
  const { data: ownerSpaceRow } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', ctx.brokerage.ownerId)
    .maybeSingle();
  if (ownerSpaceRow?.id && !spaceIds.includes(ownerSpaceRow.id)) {
    spaceIds.push(ownerSpaceRow.id);
  }

  // Aggregate the swarm in one parallel volley. Each query is scoped to the
  // brokerage's set of spaces.
  const [
    applicationCountRes,
    leadCountRes,
    dealRows,
    wonDealRows,
    invitationsRes,
    draftRows,
    draftStatsRows,
  ] = await Promise.all([
      spaceIds.length > 0
        ? supabase
            .from('Contact')
            .select('*', { count: 'exact', head: true })
            .in('spaceId', spaceIds)
            .contains('tags', ['application-link'])
        : Promise.resolve({ count: 0 }),
      spaceIds.length > 0
        ? supabase
            .from('Contact')
            .select('*', { count: 'exact', head: true })
            .in('spaceId', spaceIds)
            .contains('tags', ['new-lead'])
        : Promise.resolve({ count: 0 }),
      spaceIds.length > 0
        ? supabase
            .from('Deal')
            .select('spaceId, value')
            .in('spaceId', spaceIds)
            .eq('status', 'active')
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      spaceIds.length > 0
        ? supabase
            .from('Deal')
            .select('spaceId, value')
            .in('spaceId', spaceIds)
            .eq('status', 'won')
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      supabase
        .from('Invitation')
        .select('id, email, roleToAssign, createdAt')
        .eq('brokerageId', brokerage.id)
        .eq('status', 'pending')
        .order('createdAt', { ascending: false })
        .limit(6),
      spaceIds.length > 0
        ? supabase
            .from('AgentDraft')
            .select('spaceId')
            .in('spaceId', spaceIds)
            .eq('status', 'pending')
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      // Decided drafts in the 30-day window — feeds the Draft impact card.
      // Same shape `aggregateDraftStats` expects; brokerage-wide rollup.
      spaceIds.length > 0
        ? supabase
            .from('AgentDraft')
            .select('feedback_action, edit_distance, decision_ms, outcome_signal')
            .in('spaceId', spaceIds)
            .not('feedback_action', 'is', null)
            .gte('createdAt', draftStatsWindowStart())
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
    ]);

  const draftStats = aggregateDraftStats((draftStatsRows ?? []) as DraftStatsRow[]);

  // Commission KPI — GCI = value * commissionRate / 100 on won deals whose
  // updatedAt falls in the window. Mirrors `agent/tools/broker/revenue.py`
  // (the documented closedAt proxy is updatedAt on status='won' rows).
  const nowDate = new Date();
  const mtdStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1));
  const ytdStart = new Date(Date.UTC(nowDate.getUTCFullYear(), 0, 1));

  const wonYtdRowsRes =
    spaceIds.length > 0
      ? await supabase
          .from('Deal')
          .select('spaceId, value, commissionRate, updatedAt')
          .in('spaceId', spaceIds)
          .eq('status', 'won')
          .gte('updatedAt', ytdStart.toISOString())
          .limit(10000)
      : { data: [] as Array<{ spaceId: string; value: number | null; commissionRate: number | null; updatedAt: string }> };

  const wonYtdRows = (wonYtdRowsRes.data ?? []) as Array<{
    spaceId: string;
    value: number | null;
    commissionRate: number | null;
    updatedAt: string;
  }>;

  let mtdCommission = 0;
  let ytdCommission = 0;
  let mtdDealsClosed = 0;
  const mtdBySpace: Record<string, number> = {};
  const mtdStartMs = mtdStart.getTime();
  for (const d of wonYtdRows) {
    const gci =
      d.value != null && d.commissionRate != null ? (d.value * d.commissionRate) / 100 : 0;
    ytdCommission += gci;
    const updatedMs = new Date(d.updatedAt).getTime();
    if (updatedMs >= mtdStartMs) {
      mtdCommission += gci;
      mtdDealsClosed += 1;
      if (gci > 0) {
        mtdBySpace[d.spaceId] = (mtdBySpace[d.spaceId] ?? 0) + gci;
      }
    }
  }

  // Top realtor MTD — owner name keyed off the spaceId → space.ownerId map
  // from the `members` rows we already fetched. We only label the cell when
  // someone actually earned non-zero GCI this month.
  let topRealtorMtd: { name: string; amount: number } | null = null;
  let topSpaceId: string | null = null;
  let topAmount = 0;
  for (const [sId, amt] of Object.entries(mtdBySpace)) {
    if (amt > topAmount) {
      topAmount = amt;
      topSpaceId = sId;
    }
  }
  if (topSpaceId) {
    const owner = members.find((m) => m.Space?.id === topSpaceId);
    const name = owner?.User?.name?.split(' ')[0] ?? owner?.User?.name ?? 'Real estate agent';
    topRealtorMtd = { name, amount: topAmount };
  }

  // ── Revenue forecast (brief read) ─────────────────────────────────────────
  // Reuses the forecast model from app/broker/forecast/page.tsx.
  // Won GCI: same MTD window + defaultBrokerRate fallback already computed above.
  // Active GCI: weighted by closingProbability × dealHealth — one extra query.

  const b = brokerage as unknown as { defaultBrokerRate?: number | null };
  const defaultBrokerRate =
    typeof b.defaultBrokerRate === 'number' ? b.defaultBrokerRate : 0.02;

  // Won GCI this month from the already-fetched wonYtdRows (filtered to MTD)
  let revWonGci = 0;
  for (const d of wonYtdRows) {
    const updatedMs = new Date(d.updatedAt).getTime();
    if (updatedMs >= mtdStartMs) {
      const rate = d.commissionRate != null ? d.commissionRate / 100 : defaultBrokerRate;
      revWonGci += (d.value ?? 0) * rate;
    }
  }

  // Active deals with full fields needed for health + probability
  const { data: revActiveRaw } = spaceIds.length > 0
    ? await supabase
        .from('Deal')
        .select(
          'id, spaceId, title, value, commissionRate, closeDate, stageId, status, updatedAt, stageChangedAt, followUpAt, nextAction, nextActionDueAt',
        )
        .in('spaceId', spaceIds)
        .eq('status', 'active')
        .order('value', { ascending: false })
        .limit(2000)
    : { data: [] as ActiveDealRow[] };

  const monthStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const monthName = nowDate.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

  let revInFlightGci = 0;
  let revTopDealTitle = '';
  let revTopDealGci = 0;
  let revTopDealId = '';
  let revTopDealProb = 0;

  for (const d of (revActiveRaw ?? []) as ActiveDealRow[]) {
    const closeDate = d.closeDate ? new Date(d.closeDate) : null;
    const healthResult = dealHealth({
      status: d.status as 'active' | 'won' | 'lost' | 'on_hold',
      stageChangedAt: d.stageChangedAt ? new Date(d.stageChangedAt) : null,
      updatedAt: new Date(d.updatedAt),
      closeDate,
      followUpAt: d.followUpAt ? new Date(d.followUpAt) : null,
      nextAction: d.nextAction,
      nextActionDueAt: d.nextActionDueAt ? new Date(d.nextActionDueAt) : null,
    });
    const rate = d.commissionRate != null ? d.commissionRate / 100 : defaultBrokerRate;
    const gci = (d.value ?? 0) * rate;
    const prob = closingProbability(closeDate, healthResult.state, monthStart, monthEnd);
    const projectedGci = gci * prob;
    revInFlightGci += projectedGci;
    if (projectedGci > revTopDealGci) {
      revTopDealGci = projectedGci;
      revTopDealTitle = d.title;
      revTopDealId = d.id;
      revTopDealProb = prob;
    }
  }

  const revTotalForecast = revWonGci + revInFlightGci;
  const revActiveCount = (revActiveRaw ?? []).length;
  const revHasPipeline = revActiveCount > 0 || revWonGci > 0;

  const revPaceSentence = revTotalForecast === 0
    ? null
    : `On pace for ${formatCurrency(revTotalForecast)}. ${formatCompact(revWonGci)} won, ${formatCompact(revInFlightGci)} in flight.`;

  // ── End revenue forecast ────────────────────────────────────────────────────

  // Speed-to-lead SLA counts — only queried when slaEnabled is on.
  // Two numbers: leads currently breaching (needs action) + leads Chippi
  // escalated to the broker today (proof of work).
  let slaEnabled = false;
  let needsResponse = 0;
  let escalatedToday = 0;
  if (brokerage.slaEnabled && spaceIds.length > 0) {
    slaEnabled = true;
    const todayStart = new Date(
      Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()),
    ).toISOString();
    const firstThreshold = new Date(
      Date.now() - brokerage.slaFirstResponseMinutes * 60000,
    ).toISOString();

    const [needsRes, escalatedRes] = await Promise.all([
      // Currently-breaching: routed, never contacted, older than slaFirstResponseMinutes.
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .in('spaceId', spaceIds)
        .contains('tags', ['assigned-by-broker'])
        .is('lastContactedAt', null)
        .lte('createdAt', firstThreshold),
      // Escalated today: BrokerNotification rows Chippi created today for this brokerage.
      supabase
        .from('BrokerNotification')
        .select('*', { count: 'exact', head: true })
        .eq('brokerageId', brokerage.id)
        .eq('type', 'review_requested')
        .gte('createdAt', todayStart)
        .filter('metadata->>kind', 'eq', 'lead_sla_breach'),
    ]);

    needsResponse = needsRes.count ?? 0;
    escalatedToday = escalatedRes.count ?? 0;
  }

  const [applicationRows, leadRows] = await Promise.all([
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .contains('tags', ['application-link'])
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .contains('tags', ['new-lead'])
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const appsBySpace = (applicationRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const leadsBySpace = (leadRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const dealsBySpace = (dealRows as { spaceId: string; value: number | null }[]).reduce<
    Record<string, { count: number; value: number }>
  >((acc, r) => {
    if (!acc[r.spaceId]) acc[r.spaceId] = { count: 0, value: 0 };
    acc[r.spaceId].count += 1;
    acc[r.spaceId].value += r.value ?? 0;
    return acc;
  }, {});
  const draftsBySpace = (draftRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const pendingInvitations = (invitationsRes.data ?? []) as Array<{
    id: string;
    email: string;
    roleToAssign: string;
    createdAt: string;
  }>;

  const activeMembers = members.filter((m) => m.User?.onboard).length;
  const totalApplications = applicationCountRes.count ?? 0;
  const totalLeads = leadCountRes.count ?? 0;
  const totalDeals = Object.values(dealsBySpace).reduce((a, b) => a + b.count, 0);
  const totalPipeline = Object.values(dealsBySpace).reduce((a, b) => a + b.value, 0);
  const totalWonValue = (wonDealRows as { spaceId: string; value: number | null }[]).reduce(
    (sum, d) => sum + (d.value ?? 0),
    0,
  );
  const totalPendingDrafts = Object.values(draftsBySpace).reduce((a, b) => a + b, 0);

  const hasSettings = !!(brokerage.name && (brokerage.logoUrl || brokerage.websiteUrl));

  // Sort members by current activity load (active drafts + new leads + active deals)
  // so the broker scans the busiest realtors first. Owner row stays pinned to top.
  const memberRows = members
    .map((m) => {
      const sId = m.Space?.id;
      const apps = sId ? appsBySpace[sId] ?? 0 : 0;
      const leads = sId ? leadsBySpace[sId] ?? 0 : 0;
      const deals = sId ? dealsBySpace[sId] ?? { count: 0, value: 0 } : { count: 0, value: 0 };
      const drafts = sId ? draftsBySpace[sId] ?? 0 : 0;
      return { member: m, apps, leads, deals, drafts };
    })
    .sort((a, b) => {
      // Owner first, then by drafts pending desc, then by deals desc
      if (a.member.role === 'broker_owner' && b.member.role !== 'broker_owner') return -1;
      if (b.member.role === 'broker_owner' && a.member.role !== 'broker_owner') return 1;
      if (a.drafts !== b.drafts) return b.drafts - a.drafts;
      return b.deals.count - a.deals.count;
    });

  return (
    <div className={BROKER_PAGE_WIDE} data-broker-premium-page="today">
      {/* Header — canonical three-line pattern. Muted greeting (with the
          team name as the calm anchor), serif Times h1 from BrokerMorningStory
          carrying Chippi's chief-of-staff sentence, and the small hairline
          stats row inside the story handles the context numbers. No second
          muted line — two stat surfaces stacked read as noise. */}
      <BriefReveal delay={0.01} className={cn(BROKER_HERO, 'min-h-[30rem] sm:min-h-[34rem]')}>
        <div
          aria-hidden="true"
          data-chippi-atmosphere="ascii-field"
          className="chippi-dashboard-atmosphere pointer-events-none absolute inset-0"
        >
          <AsciiField className="h-full w-full" cell={13} speed={0.035} />
        </div>
        <header className="relative z-10 min-h-[24rem] sm:min-h-[27rem]">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground/70">
                CHIPPI // TODAY
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <p className="mt-10 text-sm text-muted-foreground">
              {getGreeting()}. {brokerage.name}.
            </p>
            <div className="mt-3">
              <BrokerMorningStory />
            </div>
          </div>
        </header>
      </BriefReveal>

      {/* Chippi — the focal entry, and the view's ONE solid accent card.
          The broker's chief of staff is the home of this page, not its
          fourth section: serif name and one line of what it does in white
          ink on the agent-orange surface, with a translucent white pill
          into /broker/chippi. */}
      <BriefReveal delay={0.02} className={cn(BROKER_PANEL, 'flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between')}>
        <div className="min-w-0 max-w-2xl space-y-1.5">
          <p className={SECTION_LABEL}>Chippi</p>
          <h2 className="text-[1.65rem] leading-tight tracking-tight text-foreground" style={TITLE_FONT}>
            Talk to Chippi
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ask about team health, reassign a lead, flag a deal, send an announcement.
          </p>
        </div>
        <Link href="/broker/chippi" className={cn(CHIPPI_PILL, 'shrink-0')}>
          Open
          <ArrowUpRight size={14} aria-hidden />
        </Link>
      </BriefReveal>

      {/* First-run nudge — only when the team hasn't been set up yet.
          Neutral icon: this is a settings affordance, not Chippi speaking,
          so orange would be unearned. */}
      {!hasSettings && (
        <section className={cn(BROKER_INSET, 'flex items-start gap-3')}>
          <div className="flex-1 space-y-0.5">
            <p className="text-sm font-medium">Finish setting up your team</p>
            <p className="text-[13px] text-muted-foreground">
              Add a logo, website, and intake form details so leads see a polished surface.
            </p>
          </div>
          <Link
            href="/broker/settings"
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
          >
            Open settings
            <ArrowRight size={12} />
          </Link>
        </section>
      )}

      {/* Snapshot — three numbers the broker actually cares about.
          Uses TITLE_FONT + SECTION_LABEL so the snapshot vocabulary
          matches the Commission grid below; one numeric vocabulary
          on the whole page. The focal numerals count up on entry
          (BriefKpiTile → AnimatedNumber, reduced-motion aware). The
          $-prefix is kept inside the formatter so the displayed string
          is byte-identical to the prior server render. */}
      <BriefReveal
        delay={0.04}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <BriefKpiTile
          label="Pipeline"
          display={`$${formatCompact(totalPipeline)}`}
          sub={`${totalDeals} active deal${totalDeals === 1 ? '' : 's'}`}
        />
        <BriefKpiTile
          label="Won"
          display={`$${formatCompact(totalWonValue)}`}
          sub="closed this period"
        />
        <BriefKpiTile
          label="Funnel"
          display={
            <>
              {totalLeads}&nbsp;→&nbsp;{totalApplications}
            </>
          }
          sub="leads → applications"
        />
      </BriefReveal>

      {/* Commission — money is the loudest signal. Hairline-divider grid
          mirrors deal-quick-panel.tsx's snapshot vocabulary. Section header
          drills into /broker/commissions for the per-deal breakdown. Focal
          figures count up on entry (BriefKpiTile, reduced-motion aware). */}
      <BriefReveal delay={0.08}>
        <div className="flex items-center justify-between gap-3 pb-3">
          <h2 className={CARD_TITLE}>Commission</h2>
          <Link
            href="/broker/commissions"
            className="group/commission inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View
            <ArrowRight
              size={11}
              className="transition-transform duration-200 group-hover/commission:translate-x-0.5"
            />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BriefKpiTile label="MTD commission" display={formatCompact(mtdCommission)} />
          <BriefKpiTile label="YTD commission" display={formatCompact(ytdCommission)} />
          <BriefKpiTile
            label="Top real estate agent (MTD)"
            display={
              topRealtorMtd ? (
                <span className="block truncate">{topRealtorMtd.name}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
            sub={topRealtorMtd ? formatCompact(topRealtorMtd.amount) : undefined}
          />
          <BriefKpiTile label="Deals closed MTD" value={mtdDealsClosed} />
        </div>
        {mtdCommission === 0 && (
          <p className="text-[13px] text-muted-foreground mt-3">
            Quiet — no deals closed this month yet.
          </p>
        )}
      </BriefReveal>

      {/* Revenue — projected GCI for the month at a glance.
          Focal number in serif Times + one-line pace read + the single biggest
          deal to watch. Computation mirrors app/broker/forecast/page.tsx.
          The projected figure and the won/in-flight strip count up on entry
          (AnimatedNumber, reduced-motion aware) — the loudest money beat. */}
      <BriefReveal delay={0.12} className={BROKER_PANEL}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={CARD_TITLE}>Revenue</h2>
          <Link
            href="/broker/forecast"
            className="group/revenue inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Full forecast
            <ArrowUpRight
              size={11}
              className="transition-transform duration-200 group-hover/revenue:translate-x-0.5 group-hover/revenue:-translate-y-0.5"
            />
          </Link>
        </div>

        {!revHasPipeline ? (
          <p className="text-[13px] text-muted-foreground mt-3">
            No active pipeline yet.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Focal projected number */}
            <div>
              <AccentBarLabel>Projected this month</AccentBarLabel>
              <p
                className={cn(STAT_NUMBER_COMPACT, 'tabular-nums mt-1.5')}
                style={TITLE_FONT}
              >
                {formatCurrency(revTotalForecast)}
              </p>
            </div>

            {/* Won + in flight — quiet inner tiles on the card */}
            <div className="grid grid-cols-2 gap-3">
              <div className={BROKER_INSET}>
                <p className={SECTION_LABEL}>Won so far</p>
                <p
                  className="text-[17px] leading-snug tracking-tight tabular-nums text-foreground mt-1"
                  style={TITLE_FONT}
                >
                  {formatCompact(revWonGci)}
                </p>
              </div>
              <div className={BROKER_INSET}>
                <p className={SECTION_LABEL}>In flight (weighted)</p>
                <p
                  className="text-[17px] leading-snug tracking-tight tabular-nums text-foreground mt-1"
                  style={TITLE_FONT}
                >
                  {formatCompact(revInFlightGci)}
                </p>
              </div>
            </div>

            {/* Biggest deal to watch */}
            {revTopDealTitle && (
              <div className="min-w-0">
                <p className={SECTION_LABEL}>Biggest deal to watch</p>
                <p className="text-sm text-foreground mt-0.5 truncate">{revTopDealTitle}</p>
                <p className={cn(META, 'mt-0.5')}>
                  {formatCompact(revTopDealGci)} projected &middot; {Math.round(revTopDealProb * 100)}% likely
                </p>
              </div>
            )}

            {/* Insight strip — the pace read, straight from the forecast math */}
            {revPaceSentence && (
              <InsightStrip
                href="/broker/forecast"
                className="mt-1"
              >
                {revPaceSentence}
              </InsightStrip>
            )}
          </div>
        )}
      </BriefReveal>

      {/* Speed to lead — only when slaEnabled is on */}
      {slaEnabled && (
        <BriefReveal delay={0.14} className={BROKER_PANEL}>
          <div className="flex items-center gap-3">
            <h2 className={CARD_TITLE}>Speed to lead</h2>
          </div>
          <p className="text-sm text-foreground mt-3">
            {needsResponse > 0 ? (
              <>
                <span className="font-medium">
                  {needsResponse} {needsResponse === 1 ? 'lead needs' : 'leads need'} a first response.
                </span>
                {escalatedToday > 0 && (
                  <span className="text-muted-foreground">
                    {' '}Chippi escalated {escalatedToday} {escalatedToday === 1 ? 'lead' : 'leads'} to you today.
                  </span>
                )}
              </>
            ) : escalatedToday > 0 ? (
              <span className="text-muted-foreground">
                Every lead has been answered. Chippi escalated {escalatedToday} {escalatedToday === 1 ? 'lead' : 'leads'} to you today.
              </span>
            ) : (
              <span className="text-muted-foreground">Every lead has been answered.</span>
            )}
          </p>
        </BriefReveal>
      )}

      {/* Pending invitations — only when there are some */}
      {pendingInvitations.length > 0 && (
        <BriefReveal delay={0.16} className={BROKER_PANEL}>
          <div className="flex items-center gap-3 pb-1">
            <h2 className={CARD_TITLE}>Pending invitations</h2>
            <StatusPill className="tabular-nums">{pendingInvitations.length}</StatusPill>
            <Link
              href="/broker/invitations"
              className="group/inv ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Manage
              <ArrowRight
                size={11}
                className="transition-transform duration-200 group-hover/inv:translate-x-0.5"
              />
            </Link>
          </div>
          <ul className={BROKER_DIVIDED_LIST}>
            {pendingInvitations.map((inv) => {
              const role =
                inv.roleToAssign === 'broker_owner'
                  ? 'Owner'
                  : inv.roleToAssign === 'broker_admin'
                    ? 'Admin'
                    : 'Real estate agent';
              return (
                <li key={inv.id} className={cn(BROKER_ROW, 'items-center text-sm')}>
                  <span className="font-medium text-foreground truncate">{inv.email}</span>
                  <StatusPill>{role}</StatusPill>
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    sent {new Date(inv.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </li>
              );
            })}
          </ul>
        </BriefReveal>
      )}

      {/* The swarm — your team today */}
      <BriefReveal delay={0.18} className={BROKER_PANEL}>
        <div className="flex items-center gap-3 pb-1">
          <h2 className={CARD_TITLE}>Your team</h2>
          {activeMembers > 0 && (
            <StatusPill className="tabular-nums">{activeMembers}</StatusPill>
          )}
          <Link
            href="/broker/members"
            className="group/mng ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Manage
            <ArrowRight
              size={11}
              className="transition-transform duration-200 group-hover/mng:translate-x-0.5"
            />
          </Link>
        </div>

        {memberRows.length === 0 ? (
          <div className={cn(BROKER_EMPTY, 'mt-4')}>
            <p className="text-sm text-foreground">Your team, in here.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Invite your first real estate agent and their work will land in this view.
            </p>
          </div>
        ) : (
          <ul className={BROKER_DIVIDED_LIST}>
            {memberRows.map(({ member, leads, deals, drafts, apps }) => {
              const name = member.User?.name ?? 'Unnamed real estate agent';
              const initial = name.charAt(0).toUpperCase();
              // A teammate row opens the broker-scoped realtor detail page.
              // /s/<slug>/* requires owning that space, so a broker can't open a
              // teammate's own dashboard — it 404s. /broker/realtors/<userId> is
              // the broker's view of that realtor (the same link the Realtors
              // list uses). The broker's own chief of staff lives at /broker/chippi.
              const href = member.userId ? `/broker/realtors/${member.userId}` : '#';
              const role =
                member.role === 'broker_owner'
                  ? 'Owner'
                  : member.role === 'broker_admin'
                    ? 'Admin'
                    : 'Real estate agent';
              const onboard = !!member.User?.onboard;
              return (
                <li key={member.id}>
                  <Link
                    href={href}
                    className={cn(BROKER_ROW, 'items-center')}
                  >
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-sm font-semibold text-muted-foreground transition-colors group-hover/row:bg-foreground/[0.07] group-hover/row:text-foreground">
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground truncate">{name}</span>
                        <StatusPill className="whitespace-nowrap">{role}</StatusPill>
                        {!onboard && (
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            invited — not joined
                          </span>
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                        {deals.count > 0 && (
                          <span className="tabular-nums whitespace-nowrap">
                            {deals.count} deal{deals.count === 1 ? '' : 's'} · ${formatCompact(deals.value)}
                          </span>
                        )}
                        {apps > 0 && (
                          <span className="tabular-nums whitespace-nowrap">
                            {apps} application{apps === 1 ? '' : 's'}
                          </span>
                        )}
                        {leads > 0 && (
                          <span className="tabular-nums whitespace-nowrap">
                            {leads} new lead{leads === 1 ? '' : 's'}
                          </span>
                        )}
                        {drafts > 0 && (
                          <span className="text-foreground tabular-nums font-medium whitespace-nowrap">
                            {drafts} draft{drafts === 1 ? '' : 's'} pending
                          </span>
                        )}
                        {deals.count === 0 && apps === 0 && leads === 0 && drafts === 0 && onboard && (
                          <span>quiet — nothing in flight</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      size={13}
                      className="flex-shrink-0 text-muted-foreground/0 -translate-x-0.5 group-hover/row:text-muted-foreground/60 group-hover/row:translate-x-0 transition-all duration-200"
                    />
                  </Link>
                </li>
              );
            })}
            {/* Ghost add-row — the list card's quiet last action. */}
            <li>
              <AddRow href="/broker/members" className="-mx-2">
                Invite a real estate agent
              </AddRow>
            </li>
          </ul>
        )}
      </BriefReveal>

      {/* Draft impact — how Chippi's drafts have actually been landing across
          the team over the last 30 days. Sits below the team list so the
          realtor row remains the focal element of the page. */}
      <BriefReveal delay={0.2} as="div">
        <DraftImpactCard stats={draftStats} />
      </BriefReveal>

      {/* What the team did — proof of work across the swarm */}
      <BriefReveal delay={0.22} className={BROKER_PANEL}>
        <div className="flex items-center gap-3">
          <h2 className={CARD_TITLE}>What the team did</h2>
        </div>
        <div className="pt-4">
          <TeamActivityFeed />
        </div>
      </BriefReveal>
    </div>
  );
}
