import { describe, it, expect } from 'vitest';
import { buildMorningActions } from '@/components/chippi/morning-actions';
import type { MorningSummary } from '@/app/api/agent/morning/route';
import type { MorningDoorway } from '@/lib/morning-story';

const empty: MorningSummary = {
  newPeopleCount: 0,
  hotPeopleCount: 0,
  overdueFollowUpsCount: 0,
  stuckDealsCount: 0,
  closingThisWeekCount: 0,
  draftsCount: 0,
  questionsCount: 0,
  topStuckDeal: null,
  topOverdueFollowUp: null,
  topNewPerson: null,
  topHotPerson: null,
};

describe('buildMorningActions', () => {
  it('returns nothing when the doorway is null (no inline panel for drafts/closing/all-clear)', () => {
    expect(buildMorningActions(null, empty, 'demo')).toEqual([]);
  });

  it('builds three deal actions: check-in (compose), log call (compose), open (navigate)', () => {
    const summary: MorningSummary = {
      ...empty,
      stuckDealsCount: 1,
      topStuckDeal: { id: 'd_chen', title: 'Chen', daysStuck: 14 },
    };
    const doorway: MorningDoorway = { kind: 'deal', id: 'd_chen' };
    const actions = buildMorningActions(doorway, summary, 'demo');

    expect(actions.map((a) => a.id)).toEqual(['deal-checkin', 'deal-log-call', 'deal-open']);
    expect(actions.map((a) => a.kind)).toEqual(['compose', 'compose', 'navigate']);

    // Check-in prefill carries the title and the days-stuck from the summary,
    // URL-encoded so the workspace can read it back.
    const checkin = actions[0]!;
    expect(checkin.href).toBe(
      `/s/demo/chippi?prefill=${encodeURIComponent(
        "Draft a check-in email for the Chen deal — it hasn't moved in 14 days.",
      )}`,
    );

    // Open the deal goes to the workspace-scoped detail route, not a bare /deals/.
    expect(actions[2]!.href).toBe('/s/demo/deals/d_chen');
  });

  it('builds two person actions regardless of sub-kind: check-in (compose), open (navigate)', () => {
    const summary: MorningSummary = {
      ...empty,
      overdueFollowUpsCount: 1,
      topOverdueFollowUp: { id: 'p_sarah', name: 'Sarah', daysOverdue: 4 },
    };
    const doorway: MorningDoorway = { kind: 'person', id: 'p_sarah' };
    const actions = buildMorningActions(doorway, summary, 'demo');

    expect(actions.map((a) => a.id)).toEqual(['person-checkin', 'person-open']);
    expect(actions.map((a) => a.kind)).toEqual(['compose', 'navigate']);
    expect(actions[0]!.href).toBe(
      `/s/demo/chippi?prefill=${encodeURIComponent('Draft a check-in message to Sarah.')}`,
    );
    expect(actions[1]!.href).toBe('/s/demo/contacts/p_sarah');
  });

  it('falls back to a generic subject when the named person is missing from the summary', () => {
    // Doorway says "person" but summary has no named person — defensive path.
    const doorway: MorningDoorway = { kind: 'person', id: 'p_unknown' };
    const actions = buildMorningActions(doorway, empty, 'demo');
    expect(actions[0]!.href).toBe(
      `/s/demo/chippi?prefill=${encodeURIComponent('Draft a check-in message to them.')}`,
    );
  });
});
