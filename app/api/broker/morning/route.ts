/**
 * GET /api/broker/morning
 *
 * The broker's morning narration — ONE prioritized action the broker should
 * do RIGHT NOW. Not a dashboard, not a snapshot, not a list. A chief of
 * staff's opening line: the loudest signal on the team, framed as a calm
 * question the broker can answer with a tap.
 *
 * Priority ladder (descending urgency):
 *   1. stuck-deals      — highest (days × value) score across the team.
 *   2. unassigned-leads — fresh intake sitting in the queue.
 *   3. overloaded       — a realtor noticeably above the team median.
 *   4. underused        — a realtor noticeably quiet vs the team median.
 *   5. milestone        — GCI MTD crossed a round threshold; celebrate the
 *                         top performer in the same breath.
 *   6. fallback         — quiet morning, team healthy.
 *
 * Response shape:
 *   { headline: string,
 *     suggestedPrompt: string | null,
 *     stats: { realtors, activeDeals, gciMtd } }
 *
 * `suggestedPrompt` is non-null on branches 1-4 (the "want me to ..."
 * affordance); the component routes the broker into /broker/chippi with the
 * prompt pre-filled. Branches 5 and 6 have no action, so the headline
 * renders non-interactive.
 *
 * Auth: broker_owner or broker_admin. Realtor-only members get 403 — they
 * have their own /chippi morning story.
 */
import { NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { dealHealth } from '@/lib/deals/health';

export interface BrokerMorningResponse {
  /**
   * The single sentence the broker reads first thing. Formed as
   * "<fact> — <call-to-action>." so the component can render the
   * call-to-action in slightly stronger weight without parsing HTML.
   */
  headline: string;
  /**
   * Text to prefill into /broker/chippi when the broker taps the headline.
   * Null on the milestone + fallback branches, where there's nothing to do.
   */
  suggestedPrompt: string | null;
  /**
   * The hairline-divider stats row below the headline. Context, not focal.
   */
  stats: {
    realtors: number;
    activeDeals: number;
    gciMtd: number;
  };
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const STUCK_MIN_DAYS = 7;
const STUCK_MIN_FOR_HEADLINE = 1;

// "Overloaded" / "underused" thresholds are relative to the team median so
// the headline is a fact ("vs team median 6"), not a judgment. We only
// surface a realtor at the extreme — half-again the median to be loud
// enough to warrant the broker's attention.
const OVERLOADED_RATIO = 1.5;
const UNDERUSED_LEAD_DAYS = 7;
const UNDERUSED_MAX_NEW_LEADS = 2;

// GCI milestones the broker actually wants to hear about. Crossed-this-month
// only — we don't re-celebrate hitting $50K every day.
const GCI_MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

/** First name only — broker speaks about realtors the way they call them. */
function firstName(full: string): string {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return 'They';
  return trimmed.split(/\s+/)[0];
}

/** Round half-up to one decimal for the GCI display, e.g. 18432.7 → 18.4. */
function thousandsK(n: number): string {
  return `$${(n / 1_000).toFixed(1)}K`;
}

interface MemberRow {
  userId: string;
  name: string;
  spaceId: string;
}

interface RealtorLoad {
  userId: string;
  name: string;
  activeDeals: number;
  newLeads7d: number;
  /** Sum of active deals + new leads over 7d — the simple overall load proxy. */
  load: number;
}

interface StuckDealRow {
  id: string;
  spaceId: string;
  value: number;
  daysStuck: number;
}

/**
 * Median of a list of numbers. Returns 0 for an empty list. Used as the
 * benchmark in the "vs team median X" framing — facts, not judgments.
 */
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The largest milestone strictly less than `gciMtd` that's also at least
 * 80% of the current value — i.e. "we just crossed this." Returns null when
 * GCI hasn't crossed anything meaningful yet.
 */
function recentlyCrossedMilestone(gciMtd: number): number | null {
  const crossed = GCI_MILESTONES.filter((m) => gciMtd >= m);
  if (crossed.length === 0) return null;
  const highest = crossed[crossed.length - 1];
  // Don't keep celebrating $50K when we're at $200K — only celebrate if the
  // milestone is within the recent past (current value < 2x milestone).
  if (gciMtd >= highest * 2) return null;
  return highest;
}

export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { brokerage } = ctx;

  // ── Resolve the team ─────────────────────────────────────────────────────
  const members = await getBrokerageMembers(brokerage.id, {
    includeOnboard: true,
  });
  const memberRows: MemberRow[] = members
    .map((m) => ({
      userId: m.userId,
      name: m.User?.name ?? m.User?.email ?? 'Realtor',
      spaceId: m.Space?.id ?? '',
    }))
    .filter((m): m is MemberRow => Boolean(m.spaceId));

  const spaceIds = memberRows.map((m) => m.spaceId);
  const spaceToMember = new Map(
    memberRows.map((m) => [m.spaceId, { userId: m.userId, name: m.name }]),
  );

  const sevenDaysAgoIso = new Date(Date.now() - 7 * MS_PER_DAY).toISOString();
  const monthStartIso = (() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  })();

  // ── Aggregate the swarm in one parallel volley ──────────────────────────
  const [activeDealRowsRes, unassignedLeadsRes, newLeads7dRes, wonMtdRes] =
    await Promise.all([
      // Active deals across the team — needed for stuck classification +
      // per-realtor load + the snapshot count.
      spaceIds.length > 0
        ? supabase
            .from('Deal')
            .select(
              'id, spaceId, value, updatedAt, closeDate, followUpAt, nextAction, nextActionDueAt',
            )
            .in('spaceId', spaceIds)
            .eq('status', 'active')
            .limit(5000)
        : Promise.resolve({ data: [] }),

      // Unassigned brokerage leads.
      supabase
        .from('Contact')
        .select('id, tags, createdAt')
        .eq('brokerageId', brokerage.id)
        .contains('tags', ['brokerage-lead'])
        .limit(2000),

      // New leads per space over the last 7 days — for the underused signal.
      spaceIds.length > 0
        ? supabase
            .from('Contact')
            .select('spaceId, createdAt')
            .in('spaceId', spaceIds)
            .gte('createdAt', sevenDaysAgoIso)
            .limit(5000)
        : Promise.resolve({ data: [] as Array<{ spaceId: string; createdAt: string }> }),

      // Won deals MTD — for GCI milestone + the top performer.
      spaceIds.length > 0
        ? supabase
            .from('Deal')
            .select('spaceId, value, commissionRate, updatedAt')
            .in('spaceId', spaceIds)
            .eq('status', 'won')
            .gte('updatedAt', monthStartIso)
            .limit(5000)
        : Promise.resolve({ data: [] as Array<{ spaceId: string; value: number | null; commissionRate: number | null }> }),
    ]);

  const nowTs = Date.now();

  // ── Stuck deals (and the single biggest) ─────────────────────────────────
  const activeDeals = (activeDealRowsRes.data ?? []) as Array<{
    id: string;
    spaceId: string;
    value: number | null;
    updatedAt: string | null;
    closeDate: string | null;
    followUpAt: string | null;
    nextAction: string | null;
    nextActionDueAt: string | null;
  }>;

  const stuckBySpace = new Map<string, StuckDealRow[]>();
  for (const d of activeDeals) {
    const updated = d.updatedAt ? new Date(d.updatedAt) : new Date();
    const health = dealHealth({
      status: 'active',
      updatedAt: updated as unknown as Date,
      closeDate: d.closeDate as unknown as Date | null,
      followUpAt: d.followUpAt as unknown as Date | null,
      nextAction: d.nextAction,
      nextActionDueAt: d.nextActionDueAt as unknown as Date | null,
    });
    if (health.state !== 'stuck') continue;
    const daysStuck = Math.max(
      0,
      Math.floor((nowTs - updated.getTime()) / MS_PER_DAY),
    );
    if (daysStuck < STUCK_MIN_DAYS) continue;
    const arr = stuckBySpace.get(d.spaceId) ?? [];
    arr.push({
      id: d.id,
      spaceId: d.spaceId,
      value: Number(d.value ?? 0),
      daysStuck,
    });
    stuckBySpace.set(d.spaceId, arr);
  }

  // Rank realtors by the (days × value) score of their stuck book. The
  // single realtor with the biggest stalled portfolio surfaces.
  let topStuckSpaceId: string | null = null;
  let topStuckScore = 0;
  let topStuckCount = 0;
  let topStuckOldest = 0;
  for (const [spaceId, rows] of stuckBySpace) {
    if (rows.length === 0) continue;
    const score = rows.reduce(
      (acc, r) => acc + r.daysStuck * Math.max(1, r.value),
      0,
    );
    const oldest = rows.reduce((acc, r) => Math.max(acc, r.daysStuck), 0);
    if (score > topStuckScore) {
      topStuckScore = score;
      topStuckSpaceId = spaceId;
      topStuckCount = rows.length;
      topStuckOldest = oldest;
    }
  }

  // ── Unassigned leads — count + freshness ─────────────────────────────────
  const unassignedAll = (
    (unassignedLeadsRes.data ?? []) as Array<{
      tags: string[] | null;
      createdAt: string | null;
    }>
  ).filter((c) => !(c.tags ?? []).includes('assigned'));
  const unassignedCount = unassignedAll.length;
  // "Overnight" = arrived since midnight local. Used to choose between
  // "landed overnight" and the plainer "sitting unassigned" copy.
  const midnightTs = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const overnightCount = unassignedAll.filter((c) => {
    if (!c.createdAt) return false;
    const t = new Date(c.createdAt).getTime();
    return !isNaN(t) && t >= midnightTs;
  }).length;

  // ── Per-realtor load (active deals + new 7d leads) ───────────────────────
  const activeBySpace = new Map<string, number>();
  for (const d of activeDeals) {
    activeBySpace.set(d.spaceId, (activeBySpace.get(d.spaceId) ?? 0) + 1);
  }
  const newLeadsBySpace = new Map<string, number>();
  for (const r of (newLeads7dRes.data ?? []) as Array<{ spaceId: string }>) {
    newLeadsBySpace.set(r.spaceId, (newLeadsBySpace.get(r.spaceId) ?? 0) + 1);
  }
  const loads: RealtorLoad[] = memberRows.map((m) => {
    const activeDealsCount = activeBySpace.get(m.spaceId) ?? 0;
    const newLeads7d = newLeadsBySpace.get(m.spaceId) ?? 0;
    return {
      userId: m.userId,
      name: m.name,
      activeDeals: activeDealsCount,
      newLeads7d,
      load: activeDealsCount + newLeads7d,
    };
  });
  const teamMedianLoad = median(loads.map((r) => r.load));
  // Highest-load realtor; flagged "overloaded" when they're loudly above the
  // median. Single-realtor teams never trip this.
  let overloaded: RealtorLoad | null = null;
  if (loads.length >= 2) {
    const sorted = [...loads].sort((a, b) => b.load - a.load);
    const topLoad = sorted[0];
    if (
      teamMedianLoad > 0 &&
      topLoad.load >= teamMedianLoad * OVERLOADED_RATIO &&
      topLoad.activeDeals >= 5
    ) {
      overloaded = topLoad;
    }
  }
  // Lowest-load realtor with too few new leads recently. Same single-team
  // guard.
  let underused: RealtorLoad | null = null;
  if (loads.length >= 2) {
    const candidates = loads
      .filter((r) => r.newLeads7d <= UNDERUSED_MAX_NEW_LEADS)
      .sort((a, b) => a.load - b.load);
    if (candidates.length > 0) {
      const candidate = candidates[0];
      if (candidate.load < teamMedianLoad) {
        underused = candidate;
      }
    }
  }

  // ── GCI MTD + top performer ──────────────────────────────────────────────
  const wonDeals = (wonMtdRes.data ?? []) as Array<{
    spaceId: string;
    value: number | null;
    commissionRate: number | null;
  }>;
  const gciBySpace = new Map<string, number>();
  let gciTotal = 0;
  for (const d of wonDeals) {
    const v = Number(d.value ?? 0);
    const r = Number(d.commissionRate ?? 0);
    const gci = v * r / 100;
    if (!isFinite(gci) || gci <= 0) continue;
    gciBySpace.set(d.spaceId, (gciBySpace.get(d.spaceId) ?? 0) + gci);
    gciTotal += gci;
  }
  let topPerformer: { name: string; gci: number } | null = null;
  for (const [spaceId, gci] of gciBySpace) {
    const m = spaceToMember.get(spaceId);
    if (!m) continue;
    if (!topPerformer || gci > topPerformer.gci) {
      topPerformer = { name: m.name, gci };
    }
  }

  // ── Compose the headline + suggested prompt ──────────────────────────────
  let headline = "Quiet morning. Team's healthy.";
  let suggestedPrompt: string | null = null;

  // 1. Stuck deals — highest priority.
  if (topStuckSpaceId && topStuckCount >= STUCK_MIN_FOR_HEADLINE) {
    const member = spaceToMember.get(topStuckSpaceId);
    if (member) {
      const fn = firstName(member.name);
      const dealWord = topStuckCount === 1 ? 'stuck deal' : 'stuck deals';
      const dayWord = topStuckOldest === 1 ? 'day' : 'days';
      // Gender-neutral pronoun — broker may use any name, we don't guess.
      headline =
        topStuckCount === 1
          ? `${fn} has a deal stuck ${topStuckOldest} ${dayWord} — want me to ping ${fn}?`
          : `${fn} has ${topStuckCount} ${dealWord} over ${topStuckOldest} ${dayWord} — want me to ping ${fn}?`;
      suggestedPrompt = `Help me check in with ${fn} on ${topStuckCount === 1 ? 'a stuck deal' : `${topStuckCount} stuck deals`}.`;
    }
  }
  // 2. Unassigned leads.
  else if (unassignedCount > 0) {
    const n = unassignedCount;
    const leadWord = n === 1 ? 'lead' : 'leads';
    const arrival = overnightCount === n && n > 0 ? 'landed overnight' : 'sitting unassigned';
    headline = `${n} ${leadWord} ${arrival} — want me to route ${n === 1 ? 'it' : 'them'} to your fewest-loaded realtor?`;
    suggestedPrompt =
      n === 1
        ? 'Route the unassigned lead to the realtor with the lightest load.'
        : `Route the ${n} unassigned leads to the realtor with the lightest load.`;
  }
  // 3. Overloaded realtor.
  else if (overloaded) {
    const fn = firstName(overloaded.name);
    headline = `${fn}'s at ${overloaded.activeDeals} active deals vs team median ${teamMedianLoad} — want to redistribute?`;
    suggestedPrompt = `Help me redistribute some of ${fn}'s deals — ${fn} is at ${overloaded.activeDeals} active.`;
  }
  // 4. Underused realtor.
  else if (underused) {
    const fn = firstName(underused.name);
    const n = underused.newLeads7d;
    const leadWord = n === 1 ? 'lead' : 'leads';
    headline =
      n === 0
        ? `${fn}'s quiet, no new leads in 7 days — want me to send ${fn} the next 3?`
        : `${fn}'s quiet, only ${n} ${leadWord} in 7 days — want me to send ${fn} the next 3?`;
    suggestedPrompt = `Send ${fn} the next 3 incoming leads.`;
  }
  // 5. Commission milestone.
  else {
    const milestone = recentlyCrossedMilestone(gciTotal);
    if (milestone && topPerformer && topPerformer.gci > 0) {
      const fn = firstName(topPerformer.name);
      headline = `You crossed ${thousandsK(milestone)} GCI this month — top performer: ${fn} with ${thousandsK(topPerformer.gci)}.`;
      suggestedPrompt = null;
    } else if (milestone) {
      headline = `You crossed ${thousandsK(milestone)} GCI this month — keep the momentum.`;
      suggestedPrompt = null;
    }
    // 6. Fallback — already initialised above.
  }

  // ── Stats row (context, not focal) ───────────────────────────────────────
  const totalActiveDeals = activeDeals.length;
  const response: BrokerMorningResponse = {
    headline,
    suggestedPrompt,
    stats: {
      realtors: memberRows.length,
      activeDeals: totalActiveDeals,
      gciMtd: Math.round(gciTotal),
    },
  };
  return NextResponse.json(response);
}
