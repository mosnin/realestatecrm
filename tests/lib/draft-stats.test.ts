/**
 * aggregateDraftStats — the shared math behind the realtor draft-stats API and
 * the broker "Draft impact" card. Both surfaces bind to these numbers, so pin
 * the counts, rates (zero-denominator safe), medians (empty -> null), and the
 * defensive handling of malformed rows.
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateDraftStats,
  draftStatsWindowStart,
  DRAFT_STATS_WINDOW_DAYS,
  type DraftStatsRow,
} from '@/lib/draft-stats';

describe('aggregateDraftStats', () => {
  it('returns an all-zero shape for no rows (medians null, not NaN)', () => {
    const s = aggregateDraftStats([]);
    expect(s).toMatchObject({
      total: 0,
      approved: 0,
      approvalRate: 0,
      editedRate: 0,
      medianEditDistance: null,
      medianDecisionMs: null,
      outcomeCheckedCount: 0,
      outcomeAdvancedRate: 0,
      windowDays: DRAFT_STATS_WINDOW_DAYS,
    });
  });

  it('counts actions, computes rates, medians, and outcomes', () => {
    const rows: DraftStatsRow[] = [
      { feedback_action: 'approved', edit_distance: null, decision_ms: 100, outcome_signal: 'deal_advanced' },
      { feedback_action: 'edited_and_approved', edit_distance: 10, decision_ms: 200, outcome_signal: 'none' },
      { feedback_action: 'edited_and_approved', edit_distance: 30, decision_ms: 400, outcome_signal: null },
      { feedback_action: 'rejected', edit_distance: null, decision_ms: null, outcome_signal: null },
      { feedback_action: 'held', edit_distance: null, decision_ms: 0, outcome_signal: null },
      // Malformed: null feedback_action must not poison totals, but its valid
      // decision_ms / outcome_signal still count on their own axes.
      { feedback_action: null, edit_distance: 5, decision_ms: 5, outcome_signal: 'deal_advanced' },
    ];
    const s = aggregateDraftStats(rows);

    expect(s.approved).toBe(1);
    expect(s.editedAndApproved).toBe(2);
    expect(s.rejected).toBe(1);
    expect(s.held).toBe(1);
    expect(s.total).toBe(5); // malformed row excluded from total

    expect(s.approvalRate).toBe(0.6); // (1+2)/5
    expect(s.editedRate).toBe(0.4); // 2/5

    expect(s.medianEditDistance).toBe(20); // median(10,30); only edited+approved with >0
    expect(s.medianDecisionMs).toBe(100); // median(0,5,100,200,400)

    expect(s.outcomeCheckedCount).toBe(3); // deal_advanced + none + deal_advanced
    expect(s.outcomeAdvancedRate).toBe(0.67); // 2/3 rounded
  });

  it('ignores a non-positive edit distance on an edited row', () => {
    const s = aggregateDraftStats([
      { feedback_action: 'edited_and_approved', edit_distance: 0, decision_ms: null, outcome_signal: null },
    ]);
    expect(s.medianEditDistance).toBeNull();
    expect(s.editedAndApproved).toBe(1);
  });
});

describe('draftStatsWindowStart', () => {
  it('returns the ISO timestamp 30 days before now', () => {
    const now = Date.parse('2026-06-27T00:00:00Z');
    expect(draftStatsWindowStart(now)).toBe('2026-05-28T00:00:00.000Z');
  });
});
