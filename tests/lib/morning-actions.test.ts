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

    // Compose actions carry intent + context for the inline draft endpoint —
    // no chat-prefill teleporter URL anymore.
    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.intent).toBe('check-in');
    expect(checkin.context).toEqual({ kind: 'deal', id: 'd_chen', label: 'Chen' });

    const logCall = actions[1]!;
    if (logCall.kind !== 'compose') throw new Error('expected compose');
    expect(logCall.intent).toBe('log-call');
    expect(logCall.context.kind).toBe('deal');

    // Open the deal still goes to the workspace-scoped detail route.
    const open = actions[2]!;
    if (open.kind !== 'navigate') throw new Error('expected navigate');
    expect(open.href).toBe('/s/demo/deals/d_chen');
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

    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.intent).toBe('reach-out');
    expect(checkin.context).toEqual({ kind: 'person', id: 'p_sarah', label: 'Sarah' });

    const open = actions[1]!;
    if (open.kind !== 'navigate') throw new Error('expected navigate');
    expect(open.href).toBe('/s/demo/contacts/p_sarah');
  });

  it('uses welcome intent for new-arrival person doorways', () => {
    const summary: MorningSummary = {
      ...empty,
      newPeopleCount: 1,
      topNewPerson: { id: 'p_new', name: 'Maya' },
    };
    const doorway: MorningDoorway = { kind: 'person', id: 'p_new' };
    const actions = buildMorningActions(doorway, summary, 'demo');

    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.intent).toBe('welcome');
    expect(checkin.context.label).toBe('Maya');
  });

  it('falls back to a generic label when the named person is missing from the summary', () => {
    // Doorway says "person" but summary has no named person — defensive path.
    const doorway: MorningDoorway = { kind: 'person', id: 'p_unknown' };
    const actions = buildMorningActions(doorway, empty, 'demo');
    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.context.label).toBe('them');
  });
});
