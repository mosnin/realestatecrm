import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

/**
 * GET /api/agent/draft-stats
 *
 * Tells the realtor (and the agent itself) how its drafts have actually been
 * landing. Phase 12 added `feedback_action`, `edit_distance`, and `decision_ms`
 * columns on AgentDraft, but until something reads them they're just bytes
 * accumulating. This endpoint is the consumer.
 *
 * Window: rolling 30 days, fixed. If a future caller needs 7 or 90 it can pass
 * a query param later — not configurable today, because there's no caller yet
 * who needs the toggle.
 *
 * Read-only. No DB writes. No outbound side effects.
 */

const WINDOW_DAYS = 30;

type FeedbackAction = 'approved' | 'edited_and_approved' | 'rejected' | 'held';

interface DraftRow {
  feedback_action: FeedbackAction | null;
  edit_distance: number | null;
  decision_ms: number | null;
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
    .select('feedback_action, edit_distance, decision_ms')
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
  }

  const total = approved + editedAndApproved + rejected + held;
  // "Approval rate" = anything that went out, edited or not. The point of the
  // signal is "did the agent's draft survive the realtor?" — both approved
  // and edited_and_approved survived.
  const approvalRate = rate(approved + editedAndApproved, total);
  const editedRate = rate(editedAndApproved, total);

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
  });
}
