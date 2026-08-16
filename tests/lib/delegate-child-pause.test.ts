import { describe, expect, it } from 'vitest';
import {
  applyDecisionToApprovals,
  CHILD_WAITER_STALE_MS,
  isChildWaiterFresh,
  isDelegateChildPausedRun,
  markApprovalsAsChild,
  readChildDecision,
  unwrapChildResult,
  unwrapChildRunState,
  wrapChildResult,
  wrapChildRunState,
} from '@/lib/ai-tools/delegate-child-pause';

describe('delegated specialist pause envelope', () => {
  it('round-trips the child run state and goal', () => {
    const wrapped = wrapChildRunState({ goal: 'Email Jane', state: 'sdk-state' });
    expect(unwrapChildRunState(wrapped)).toEqual({ goal: 'Email Jane', state: 'sdk-state' });
    expect(unwrapChildRunState('sdk-state')).toBeNull();
    expect(isDelegateChildPausedRun({ runState: wrapped, approvals: [] })).toBe(true);
    expect(isDelegateChildPausedRun({ runState: 'sdk-state', approvals: [] })).toBe(false);
  });

  it('stores and reads the realtor decision on the approval list', () => {
    const marked = markApprovalsAsChild(
      [{ callId: 'c1', toolName: 'send_email', arguments: { to: 'a@b.c' }, summary: 'Email a' }],
      'Email Jane',
    );
    expect(isDelegateChildPausedRun({ approvals: marked })).toBe(true);
    expect(readChildDecision(marked)).toBeNull();
    const decided = applyDecisionToApprovals(marked, 'c1', { approved: true });
    expect(readChildDecision(decided)).toEqual({ callId: 'c1', approved: true, message: undefined });
  });

  it('treats a heartbeat older than the stale window as a dead waiter', () => {
    const now = Date.parse('2026-08-16T00:00:00.000Z');
    expect(isChildWaiterFresh(new Date(now - 1_000).toISOString(), now)).toBe(true);
    expect(isChildWaiterFresh(new Date(now - CHILD_WAITER_STALE_MS - 1).toISOString(), now)).toBe(false);
    expect(isChildWaiterFresh(null, now)).toBe(false);
  });

  it('round-trips a takeover briefing so a lost waiter can still return it', () => {
    const wrapped = wrapChildResult({ ok: true, summary: 'Tour booked Friday.' });
    expect(unwrapChildResult(wrapped)).toEqual({ ok: true, summary: 'Tour booked Friday.' });
  });
});
