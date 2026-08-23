/**
 * Behavioral tests for the last mile between ConversationTurn DB authority
 * and the SSE / queue layer: cancellation-wins settlement, and which
 * statuses hold automatic drain.
 */
import { describe, expect, it } from 'vitest';

import {
  nextDispatchableTurn,
  queueIsHeld,
  queuedTurnOrder,
  settledConversationTurnOutcome,
  type ConversationTurnRecord,
  type TurnTerminalOutcome,
} from '@/lib/chat/turn-control';

function turn(
  over: Partial<ConversationTurnRecord> & Pick<ConversationTurnRecord, 'id' | 'status'>,
): ConversationTurnRecord {
  return {
    spaceId: 'space-1',
    conversationId: 'conversation-1',
    mode: 'chat',
    source: 'typed',
    clientRequestId: over.id,
    message: 'Do the work',
    attachmentIds: [],
    attachments: [],
    priority: 0,
    enqueueSeq: 1,
    attemptToken: null,
    attempts: 0,
    leaseExpiresAt: null,
    cancelRequestedAt: null,
    startedAt: null,
    finishedAt: null,
    terminalReason: null,
    lastError: null,
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    ...over,
  };
}

const completedFallback: TurnTerminalOutcome = {
  status: 'completed',
  reason: 'model_finished',
};

describe('settledConversationTurnOutcome', () => {
  it('lets a cancelled DB row win over a completed stream fallback', () => {
    expect(
      settledConversationTurnOutcome(
        turn({ id: 't1', status: 'cancelled', terminalReason: 'user_stop' }),
        completedFallback,
      ),
    ).toEqual({ status: 'cancelled', reason: 'user_stop' });
  });

  it('surfaces lastError when the DB settled as failed', () => {
    expect(
      settledConversationTurnOutcome(
        turn({ id: 't1', status: 'failed', terminalReason: 'provider', lastError: 'quota' }),
        completedFallback,
      ),
    ).toEqual({ status: 'failed', reason: 'provider', error: 'quota' });
  });

  it('falls back to the stream error when a failed row has no lastError', () => {
    expect(
      settledConversationTurnOutcome(
        turn({ id: 't1', status: 'failed', terminalReason: null, lastError: null }),
        { status: 'failed', reason: 'stream', error: 'socket reset' },
      ),
    ).toEqual({ status: 'failed', reason: 'stream', error: 'socket reset' });
  });

  it('preserves the fallback when the settler returned no row', () => {
    expect(settledConversationTurnOutcome(undefined, completedFallback)).toEqual(completedFallback);
  });

  it('throws when the DB row is still in a non-terminal status', () => {
    expect(() =>
      settledConversationTurnOutcome(turn({ id: 't1', status: 'running' }), completedFallback),
    ).toThrow(/settlement returned running/);
  });
});

describe('nextDispatchableTurn', () => {
  it('holds the queue only for an approval-paused turn', () => {
    const paused = turn({ id: 'paused', status: 'paused' });
    const pending = turn({ id: 'pending', status: 'pending', enqueueSeq: 2 });
    expect(queueIsHeld([paused, pending])).toBe(true);
    expect(nextDispatchableTurn([paused, pending])).toBeNull();
  });

  it('does not dispatch while another turn is running', () => {
    const running = turn({ id: 'running', status: 'running' });
    const pending = turn({ id: 'pending', status: 'pending', enqueueSeq: 2 });
    expect(queueIsHeld([running, pending])).toBe(false);
    expect(nextDispatchableTurn([running, pending])).toBeNull();
  });

  it('lets a failed or completed turn stay visible without blocking the next pending send', () => {
    const failed = turn({ id: 'failed', status: 'failed' });
    const completed = turn({ id: 'done', status: 'completed' });
    const pending = turn({ id: 'pending', status: 'pending', enqueueSeq: 3, priority: 1 });
    expect(queueIsHeld([failed, completed, pending])).toBe(false);
    expect(nextDispatchableTurn([failed, completed, pending])?.id).toBe('pending');
  });

  it('drains pending turns by priority then enqueueSeq', () => {
    const later = turn({ id: 'later', status: 'pending', priority: 0, enqueueSeq: 1 });
    const sooner = turn({ id: 'sooner', status: 'pending', priority: 1, enqueueSeq: 2 });
    expect(queuedTurnOrder([later, sooner]).map((row) => row.id)).toEqual(['sooner', 'later']);
    expect(nextDispatchableTurn([later, sooner])?.id).toBe('sooner');
  });
});
