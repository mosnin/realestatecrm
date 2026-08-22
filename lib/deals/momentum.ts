/**
 * Deal momentum timeline — "which deals are losing steam and why".
 *
 * `computeMomentum(spaceId, dealId)` reconstructs one deal's story from
 * facts we already log:
 *   - DealActivity rows (notes/calls/emails/meetings/follow-ups/stage &
 *     status changes) bucketed by week, for the activity ticks.
 *   - `stage_change` DealActivity rows (metadata.fromStageId/toStageId,
 *     stamped by PATCH /api/deals/[id]) reconstructed into stage segments
 *     with dwell time, for the stage bands.
 *   - A per-stage dwell BASELINE — the median dwell other closed-won deals
 *     in this space spent in the same stage, computed from the same
 *     `stage_change` log over won deals. Never invented: when the space has
 *     no closed-won history yet, `baselineUnavailable` is true and every
 *     segment's `baselineDays` is null instead of guessing.
 *   - A fact-derived `verdict` ('accelerating' | 'steady' | 'stalling') with
 *     a concrete `reason` built only from the numbers above.
 *
 * Reuses `dealHealth`'s stageChangedAt-vs-updatedAt fallback convention
 * (lib/deals/health.ts) rather than duplicating it, but does NOT duplicate
 * its verdict — health is a point-in-time attention flag, momentum is a
 * trend explanation over the deal's own history.
 *
 * Every read is spaceId-scoped — `tenantTable()` IS the
 * tenant boundary (CLAUDE.md).
 */

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Deals sitting idle this many days or more contribute to a 'stalling' verdict. */
const IDLE_STALL_DAYS = 10;
/** Current-stage dwell at or above this multiple of the stage's baseline contributes to 'stalling'. */
const DWELL_STALL_RATIO = 2;
/** Last touch within this many days is a precondition for 'accelerating'. */
const IDLE_ACCELERATE_DAYS = 3;
/** Activity count in the trailing 7 days required (alongside a recent touch) for 'accelerating'. */
const ACCELERATE_MIN_RECENT = 3;
/** Minimum dwell samples for a stage before we trust a baseline median. */
const MIN_BASELINE_SAMPLES = 3;
/** Bound on how many of the space's own closed-won deals feed the baseline —
 *  a median doesn't need more than this to be stable, and it keeps the query
 *  and the computation cheap on spaces with a long closed history. */
const MAX_BASELINE_DEALS = 60;
/** Weekly activity buckets are capped to the trailing ~1 year so a very old
 *  deal doesn't hand the UI an unbounded array. */
const MAX_WEEKS = 52;

export type MomentumVerdict = 'accelerating' | 'steady' | 'stalling';

export interface MomentumActivityBucket {
  /** ISO date (UTC) of the Monday that starts this week. */
  weekStart: string;
  count: number;
}

export interface MomentumStageSegment {
  stageId: string;
  stageName: string;
  startAt: string;
  endAt: string;
  dwellDays: number;
  /** Median dwell (days) other closed-won deals in this space spent in this
   *  stage. Null when the space doesn't have enough closed-won history for
   *  this specific stage — never a guessed number. */
  baselineDays: number | null;
  /** True for the deal's current (still-open) stage segment. */
  current: boolean;
}

export interface DealMomentum {
  dealId: string;
  spaceId: string;
  /** Total DealActivity rows considered (all types) — the basis for the
   *  caller's "don't render a timeline for a near-empty deal" decision. */
  eventCount: number;
  activityByWeek: MomentumActivityBucket[];
  stages: MomentumStageSegment[];
  verdict: MomentumVerdict;
  /** Concrete, fact-derived explanation, e.g. "no activity in 12 days · 2x usual dwell in Inspection". */
  reason: string;
  daysSinceLastActivity: number | null;
  /** True when this space has no closed-won deal history yet, so every
   *  segment's baselineDays is null by necessity rather than by data gap. */
  baselineUnavailable: boolean;
}

interface StageChangeEvent {
  createdAt: string;
  fromStageId: string | null;
  toStageId: string | null;
}

interface StageSegmentMs {
  stageId: string;
  startMs: number;
  endMs: number;
}

function toMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Monday 00:00 UTC of the week containing `ms`. */
function weekStartMs(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday);
  return monday;
}

/**
 * Reconstruct one deal's stage-visit segments from its ascending
 * `stage_change` log. The segment before the first logged change uses that
 * change's `fromStageId` (the stage the deal actually started in); a deal
 * with no logged changes at all is a single segment in its current stage.
 */
function buildStageSegments(
  createdAtMs: number,
  endMs: number,
  currentStageId: string | null,
  changes: StageChangeEvent[],
): StageSegmentMs[] {
  const segments: StageSegmentMs[] = [];
  let cursor = createdAtMs;
  let stageId: string | null =
    changes.length > 0 ? (changes[0].fromStageId ?? changes[0].toStageId ?? currentStageId) : currentStageId;

  for (const change of changes) {
    const changeMs = toMs(change.createdAt);
    if (changeMs == null || changeMs < cursor) continue;
    if (stageId && changeMs > cursor) {
      segments.push({ stageId, startMs: cursor, endMs: changeMs });
    }
    cursor = changeMs;
    stageId = change.toStageId ?? stageId;
  }

  if (stageId && endMs > cursor) {
    segments.push({ stageId, startMs: cursor, endMs });
  }

  return segments;
}

/**
 * Per-stage dwell baseline (median days) across up to MAX_BASELINE_DEALS of
 * the space's own closed-won deals. Returns an empty map (never invents a
 * number) when the space has no usable closed-won history yet.
 */
async function computeStageBaselines(
  spaceId: string,
  excludeDealId: string,
): Promise<Map<string, number>> {
  const { data: wonDeals, error: wonErr } = await tenantTable(supabase, 'Deal', { spaceId })
    .select('id, stageId, createdAt, closedAt')
    .eq('status', 'won')
    .neq('id', excludeDealId)
    .not('closedAt', 'is', null)
    .order('closedAt', { ascending: false })
    .limit(MAX_BASELINE_DEALS);

  if (wonErr) {
    logger.warn('[momentum] baseline deal load failed', { spaceId, err: wonErr.message });
    return new Map();
  }

  const rows = (wonDeals ?? []) as Array<{
    id: string;
    stageId: string | null;
    createdAt: string;
    closedAt: string | null;
  }>;
  if (rows.length === 0) return new Map();

  const dealIds = rows.map((r) => r.id);
  const { data: changeRows, error: changeErr } = await tenantTable(supabase, 'DealActivity', { spaceId })
    .select('dealId, createdAt, metadata')
    .eq('type', 'stage_change')
    .in('dealId', dealIds)
    .order('createdAt', { ascending: true });

  if (changeErr) {
    logger.warn('[momentum] baseline activity load failed', { spaceId, err: changeErr.message });
    return new Map();
  }

  const changesByDeal = new Map<string, StageChangeEvent[]>();
  for (const row of (changeRows ?? []) as Array<{ dealId: string; createdAt: string; metadata: Record<string, unknown> | null }>) {
    const list = changesByDeal.get(row.dealId) ?? [];
    const meta = row.metadata ?? {};
    list.push({
      createdAt: row.createdAt,
      fromStageId: (meta.fromStageId as string | null) ?? null,
      toStageId: (meta.toStageId as string | null) ?? null,
    });
    changesByDeal.set(row.dealId, list);
  }

  const durationsByStage = new Map<string, number[]>();
  for (const deal of rows) {
    const createdMs = toMs(deal.createdAt);
    const closedMs = toMs(deal.closedAt);
    if (createdMs == null || closedMs == null || closedMs <= createdMs) continue;
    const segments = buildStageSegments(
      createdMs,
      closedMs,
      deal.stageId,
      changesByDeal.get(deal.id) ?? [],
    );
    for (const seg of segments) {
      const days = (seg.endMs - seg.startMs) / MS_PER_DAY;
      if (days < 0) continue;
      const list = durationsByStage.get(seg.stageId) ?? [];
      list.push(days);
      durationsByStage.set(seg.stageId, list);
    }
  }

  const baselines = new Map<string, number>();
  for (const [stageId, durations] of durationsByStage) {
    if (durations.length < MIN_BASELINE_SAMPLES) continue;
    const m = median(durations);
    if (m != null) baselines.set(stageId, m);
  }
  return baselines;
}

function pluralDays(n: number): string {
  const rounded = Math.round(n);
  return `${rounded} day${rounded === 1 ? '' : 's'}`;
}

/**
 * Decide the verdict + concrete reason from the numbers already computed.
 * Stalling signals win (most urgent, mirrors lib/deals/health.ts's
 * priority-order convention); accelerating requires both a recent touch AND
 * a busy trailing week; everything else reads as steady.
 */
function deriveVerdict(input: {
  daysSinceLastActivity: number | null;
  recentActivityCount7d: number;
  currentStageDwellDays: number | null;
  currentStageBaselineDays: number | null;
  currentStageName: string | null;
}): { verdict: MomentumVerdict; reason: string } {
  const { daysSinceLastActivity, recentActivityCount7d, currentStageDwellDays, currentStageBaselineDays, currentStageName } = input;

  const stallReasons: string[] = [];
  if (daysSinceLastActivity != null && daysSinceLastActivity >= IDLE_STALL_DAYS) {
    stallReasons.push(`no activity in ${daysSinceLastActivity} days`);
  }
  let dwellRatio: number | null = null;
  if (
    currentStageDwellDays != null &&
    currentStageBaselineDays != null &&
    currentStageBaselineDays >= 1 &&
    currentStageName
  ) {
    dwellRatio = currentStageDwellDays / currentStageBaselineDays;
    if (dwellRatio >= DWELL_STALL_RATIO) {
      stallReasons.push(`${dwellRatio.toFixed(1)}x usual dwell in ${currentStageName}`);
    }
  }
  if (stallReasons.length > 0) {
    return { verdict: 'stalling', reason: stallReasons.join(' · ') };
  }

  if (
    daysSinceLastActivity != null &&
    daysSinceLastActivity <= IDLE_ACCELERATE_DAYS &&
    recentActivityCount7d >= ACCELERATE_MIN_RECENT
  ) {
    return {
      verdict: 'accelerating',
      reason: `${recentActivityCount7d} touches in the last 7 days`,
    };
  }

  const reason =
    daysSinceLastActivity != null
      ? `last touch ${daysSinceLastActivity === 0 ? 'today' : `${pluralDays(daysSinceLastActivity)} ago`}`
      : 'steady pace';
  return { verdict: 'steady', reason };
}

/**
 * Compute the momentum timeline for one deal.
 *
 * Returns null when the deal doesn't exist in this space — tenant scoping,
 * tenantTable() IS the security boundary.
 */
export async function computeMomentum(
  spaceId: string,
  dealId: string,
  opts: { now?: Date } = {},
): Promise<DealMomentum | null> {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();

  const { data: dealRow, error: dealErr } = await tenantTable(supabase, 'Deal', { spaceId })
    .select('id, status, stageId, createdAt, closedAt')
    .eq('id', dealId)
    .maybeSingle();
  if (dealErr) {
    logger.warn('[momentum] deal load failed', { dealId, err: dealErr.message });
    return null;
  }
  if (!dealRow) return null;

  const deal = dealRow as {
    id: string;
    status: 'active' | 'won' | 'lost' | 'on_hold';
    stageId: string | null;
    createdAt: string;
    closedAt: string | null;
  };

  const createdMs = toMs(deal.createdAt) ?? nowMs;
  const endMs = toMs(deal.closedAt) ?? nowMs;

  const [activityResult, stagesResult] = await Promise.all([
    tenantTable(supabase, 'DealActivity', { spaceId })
      .select('type, createdAt, metadata')
      .eq('dealId', dealId)
      .order('createdAt', { ascending: true }),
    tenantTable(supabase, 'DealStage', { spaceId }).select('id, name'),
  ]);

  if (activityResult.error) {
    logger.warn('[momentum] activity load failed', { dealId, err: activityResult.error.message });
    return null;
  }

  const activities = (activityResult.data ?? []) as Array<{
    type: string;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
  const stageNameById = new Map<string, string>(
    ((stagesResult.data ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]),
  );

  const eventCount = activities.length;

  // ── Weekly activity buckets ─────────────────────────────────────────────
  const bucketCounts = new Map<number, number>();
  let lastActivityMs: number | null = null;
  for (const a of activities) {
    const ms = toMs(a.createdAt);
    if (ms == null) continue;
    if (lastActivityMs == null || ms > lastActivityMs) lastActivityMs = ms;
    const wk = weekStartMs(ms);
    bucketCounts.set(wk, (bucketCounts.get(wk) ?? 0) + 1);
  }

  const firstWeek = weekStartMs(createdMs);
  const lastWeek = weekStartMs(nowMs);
  const weeksTotal = Math.max(1, Math.round((lastWeek - firstWeek) / (7 * MS_PER_DAY)) + 1);
  const weeksToRender = Math.min(weeksTotal, MAX_WEEKS);
  const startWeek = lastWeek - (weeksToRender - 1) * 7 * MS_PER_DAY;

  const activityByWeek: MomentumActivityBucket[] = [];
  for (let wk = startWeek; wk <= lastWeek; wk += 7 * MS_PER_DAY) {
    activityByWeek.push({
      weekStart: new Date(wk).toISOString().slice(0, 10),
      count: bucketCounts.get(wk) ?? 0,
    });
  }

  const recentActivityCount7d = activities.filter((a) => {
    const ms = toMs(a.createdAt);
    return ms != null && nowMs - ms <= 7 * MS_PER_DAY;
  }).length;

  const daysSinceLastActivity =
    lastActivityMs != null ? Math.max(0, Math.floor((nowMs - lastActivityMs) / MS_PER_DAY)) : null;

  // ── Stage segments (this deal's own history) ────────────────────────────
  const stageChanges: StageChangeEvent[] = activities
    .filter((a) => a.type === 'stage_change')
    .map((a) => ({
      createdAt: a.createdAt,
      fromStageId: (a.metadata?.fromStageId as string | null) ?? null,
      toStageId: (a.metadata?.toStageId as string | null) ?? null,
    }));

  const rawSegments = buildStageSegments(createdMs, endMs, deal.stageId, stageChanges);

  const baselines = await computeStageBaselines(spaceId, dealId);
  const baselineUnavailable = baselines.size === 0;

  const stages: MomentumStageSegment[] = rawSegments.map((seg, idx) => ({
    stageId: seg.stageId,
    stageName: stageNameById.get(seg.stageId) ?? 'Unknown stage',
    startAt: new Date(seg.startMs).toISOString(),
    endAt: new Date(seg.endMs).toISOString(),
    dwellDays: (seg.endMs - seg.startMs) / MS_PER_DAY,
    baselineDays: baselines.get(seg.stageId) ?? null,
    current: idx === rawSegments.length - 1 && deal.status === 'active',
  }));

  const currentSegment = stages.length > 0 && stages[stages.length - 1].current ? stages[stages.length - 1] : null;

  // ── Verdict ──────────────────────────────────────────────────────────────
  let verdict: MomentumVerdict;
  let reason: string;
  if (deal.status !== 'active') {
    verdict = 'steady';
    reason =
      deal.status === 'won'
        ? 'Deal is closed won'
        : deal.status === 'lost'
          ? 'Deal is closed lost'
          : 'Deal is on hold';
  } else {
    ({ verdict, reason } = deriveVerdict({
      daysSinceLastActivity,
      recentActivityCount7d,
      currentStageDwellDays: currentSegment ? currentSegment.dwellDays : null,
      currentStageBaselineDays: currentSegment ? currentSegment.baselineDays : null,
      currentStageName: currentSegment ? currentSegment.stageName : null,
    }));
  }

  return {
    dealId,
    spaceId,
    eventCount,
    activityByWeek,
    stages,
    verdict,
    reason,
    daysSinceLastActivity,
    baselineUnavailable,
  };
}
