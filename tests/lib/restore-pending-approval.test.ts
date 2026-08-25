import { describe, expect, it } from 'vitest';
import {
  pendingApprovalFromPausedRun,
  pickPausedRunForTurn,
  restorePendingApprovalIfIdle,
} from '@/lib/chat/restore-pending-approval';

const NOW = Date.parse('2026-08-25T12:00:00.000Z');

function pausedRun(over: Record<string, unknown> = {}) {
  return {
    id: 'pause-1',
    status: 'pending',
    expiresAt: '2026-08-26T12:00:00.000Z',
    approvals: [
      {
        callId: 'call-1',
        toolName: 'send_email',
        arguments: { toEmail: 'pat@example.com', subject: 'Tour' },
        summary: 'Send an email to Pat',
      },
      {
        callId: 'call-2',
        toolName: 'log_call',
        arguments: { contactId: 'c1' },
        summary: 'Log a call',
      },
    ],
    ...over,
  };
}

describe('pendingApprovalFromPausedRun', () => {
  it('maps the first stored approval to the chat card shape', () => {
    expect(pendingApprovalFromPausedRun(pausedRun(), NOW)).toEqual({
      requestId: 'pause-1',
      callId: 'call-1',
      name: 'send_email',
      args: { toEmail: 'pat@example.com', subject: 'Tour' },
      summary: 'Send an email to Pat',
      otherPendingCalls: [
        {
          callId: 'call-2',
          name: 'log_call',
          args: { contactId: 'c1' },
          summary: 'Log a call',
        },
      ],
    });
  });

  it('rejects resumed, expired, or empty checkpoints', () => {
    expect(pendingApprovalFromPausedRun(pausedRun({ status: 'resumed' }), NOW)).toBeNull();
    expect(pendingApprovalFromPausedRun(pausedRun({ expiresAt: '2026-08-25T11:00:00.000Z' }), NOW)).toBeNull();
    expect(pendingApprovalFromPausedRun(pausedRun({ approvals: [] }), NOW)).toBeNull();
    expect(pendingApprovalFromPausedRun({ id: '', status: 'pending', approvals: [] }, NOW)).toBeNull();
  });
});

describe('pickPausedRunForTurn', () => {
  it('prefers the checkpoint linked to the paused turn', () => {
    const rows = [
      { id: 'old', turnId: 'other', createdAt: '2026-08-25T11:00:00.000Z' },
      { id: 'match', turnId: 'turn-9', createdAt: '2026-08-25T10:00:00.000Z' },
    ];
    expect(pickPausedRunForTurn(rows, 'turn-9')?.id).toBe('match');
  });

  it('falls back to the newest pending row when turnId is missing', () => {
    const rows = [
      { id: 'older', createdAt: '2026-08-25T10:00:00.000Z' },
      { id: 'newer', createdAt: '2026-08-25T11:00:00.000Z' },
    ];
    expect(pickPausedRunForTurn(rows, 'turn-9')?.id).toBe('newer');
  });
});

describe('restorePendingApprovalIfIdle', () => {
  const restored = pendingApprovalFromPausedRun(pausedRun(), NOW);

  it('hydrates only when this tab is idle on the loaded conversation', () => {
    expect(restorePendingApprovalIfIdle({
      current: null,
      restored,
      streaming: false,
      loadedConversationId: 'conv-1',
      activeConversationId: 'conv-1',
    })).toEqual(restored);
  });

  it('keeps a live SSE prompt and ignores a stale restore after navigation', () => {
    const live = { ...restored!, requestId: 'live-1' };
    expect(restorePendingApprovalIfIdle({
      current: live,
      restored,
      streaming: false,
      loadedConversationId: 'conv-1',
      activeConversationId: 'conv-1',
    })).toBe(live);
    expect(restorePendingApprovalIfIdle({
      current: null,
      restored,
      streaming: true,
      loadedConversationId: 'conv-1',
      activeConversationId: 'conv-1',
    })).toBeNull();
    expect(restorePendingApprovalIfIdle({
      current: null,
      restored,
      streaming: false,
      loadedConversationId: 'conv-1',
      activeConversationId: 'conv-2',
    })).toBeNull();
  });
});
