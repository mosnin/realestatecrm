import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

/**
 * GET /api/agent/draft-stats
 *
 * Tells the realtor (and the agent itself) how its drafts have actually been
 * landing. Two layers of signal:
 *
 *   - Input quality (Phase 12): `feedback_action`, `edit_distance`, `decision_ms`
 *     — did the realtor approve / edit / reject the draft. Lives in the
 *     `approved`/`editedAndApproved`/`rejected`/`held` counts and the rates
 *     derived from them.
 *   - Outcome attribution (Phase 13): `outcome_signal`, `outcome_checked_at`
 *     — for sent drafts, did the linked deal advance afterwards. Lives in
 *     `outcomeAdvancedRate` and `outcomeCheckedCount`. The cron at
 *     /api/cron/draft-outcomes labels each sent draft once. Until labelled,
 *     a sent draft contributes to `total` (via feedback_action) but not to
 *     the outcome metrics.
 *
 * `outcomeAdvancedRate` is a correlation, not causation. Read it as "share of
 * sent drafts where the deal moved within a week of sending" — useful as a
 * relative ranking signal across prompt versions, not a hard scoreboard.
 *
 * Window: rolling 30 days, fixed. If a future caller needs 7 or 90 it can pass
 * a query param later — not configurable today, because there's no caller yet
 * who needs the toggle.
 *
 * Read-only. No DB writes. No outbound side effects.
 */

const WINDOW_DAYS = 30;

type FeedbackAction = 'approved' | 'edited_and_approved' | 'rejected' | 'held';
type OutcomeSignal = 'deal_advanced' | 'none';

interface DraftRow {
  feedback_action: FeedbackAction | null;
  edit_distance: number | null;
  decision_ms: number | null;
  outcome_signal: OutcomeSignal | null;
}

/**
 * Median of a numeric list. Sort ascending, pick middle (or average of the
 * two middles for even count). Returns null on empty input — the caller
 * shouldn't have to disambiguate "the median is zero" from "no data."
 */
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Round a 0..1 ratio to two decimal places. Returns 0 on a zero denominator —
 * a UI binding to this number wants a number, not null.
 */
function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('AgentDraft')
    .select('feedback_action, edit_distance, decision_ms, outcome_signal')
    .eq('spaceId', space.id)
    .not('feedback_action', 'is', null)
    .gte('createdAt', since);

  if (error) throw error;

  const rows: DraftRow[] = (data ?? []) as DraftRow[];

  let approved = 0;
  let editedAndApproved = 0;
  let rejected = 0;
  let held = 0;
  const editDistances: number[] = [];
  const decisionMsList: number[] = [];
  let outcomeCheckedCount = 0;
  let outcomeAdvanced = 0;

  for (const row of rows) {
    switch (row.feedback_action) {
      case 'approved':
        approved += 1;
        break;
      case 'edited_and_approved':
        editedAndApproved += 1;
        if (typeof row.edit_distance === 'number' && row.edit_distance > 0) {
          editDistances.push(row.edit_distance);
        }
        break;
      case 'rejected':
        rejected += 1;
        break;
      case 'held':
        held += 1;
        break;
      default:
        // Defensive: shouldn't happen because of the .not('feedback_action', 'is', null)
        // filter, but a malformed row shouldn't poison the totals.
        break;
    }
    if (typeof row.decision_ms === 'number' && row.decision_ms >= 0) {
      decisionMsList.push(row.decision_ms);
    }
    // Outcome attribution lives on a separate axis from feedback_action.
    // A draft that was rejected won't have outcome_signal set (it never sent),
    // so this naturally only counts sent drafts the cron has already labelled.
    if (row.outcome_signal === 'deal_advanced' || row.outcome_signal === 'none') {
      outcomeCheckedCount += 1;
      if (row.outcome_signal === 'deal_advanced') outcomeAdvanced += 1;
    }
  }

  const total = approved + editedAndApproved + rejected + held;
  // "Approval rate" = anything that went out, edited or not. The point of the
  // signal is "did the agent's draft survive the realtor?" — both approved
  // and edited_and_approved survived.
  const approvalRate = rate(approved + editedAndApproved, total);
  const editedRate = rate(editedAndApproved, total);
  // Outcome rate is share of *labelled-as-checked* drafts whose deal moved
  // afterwards. Denominator is outcomeCheckedCount, not total — a draft sent
  // yesterday hasn't had its day-1 delay yet and shouldn't drag the rate down.
  const outcomeAdvancedRate = rate(outcomeAdvanced, outcomeCheckedCount);

  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    total,
    approved,
    editedAndApproved,
    rejected,
    held,
    approvalRate,
    editedRate,
    medianEditDistance: median(editDistances),
    medianDecisionMs: median(decisionMsList),
    outcomeCheckedCount,
    outcomeAdvancedRate,
  });
}
