import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  insertSteeringMessage,
  nextDispatchableQueuedTurn,
  queuedMessagesFromTurns,
  type PendingTurnMessage,
} from '@/components/ai/hooks/use-agent-task';
import type { ConversationTurnRecord } from '@/lib/chat/turn-control';

function record(over: Partial<ConversationTurnRecord>): ConversationTurnRecord {
  return {
    id: 'turn-1',
    spaceId: 'space-1',
    conversationId: 'conversation-1',
    mode: 'work',
    source: 'typed',
    clientRequestId: 'request-1',
    message: 'queued text',
    attachmentIds: [],
    attachments: [],
    priority: 0,
    enqueueSeq: 1,
    status: 'pending',
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

describe('Work queue and steering', () => {
  it('keeps steering instructions FIFO ahead of ordinary queued turns', () => {
    const pending = (
      id: string,
      text: string,
      kind: PendingTurnMessage['kind'],
    ): PendingTurnMessage => ({
      id,
      clientRequestId: `request-${id}`,
      text,
      mode: 'work',
      kind,
      status: 'pending',
      attachmentIds: [],
      attachments: [],
    });
    const queued: PendingTurnMessage[] = [
      pending('q1', 'queued one', 'queued'),
      pending('q2', 'queued two', 'queued'),
    ];
    const first = insertSteeringMessage(queued, pending('s1', 'steer one', 'steer'));
    const second = insertSteeringMessage(first, pending('s2', 'steer two', 'steer'));

    expect(second.map((message) => message.text)).toEqual([
      'steer one',
      'steer two',
      'queued one',
      'queued two',
    ]);
  });

  it('dispatches the next pending turn even when a failed turn is still visible', () => {
    const pending = record({ id: 'pending-1', status: 'pending', enqueueSeq: 2 });
    const failed = record({ id: 'failed-1', status: 'failed', enqueueSeq: 1 });

    expect(nextDispatchableQueuedTurn([failed, pending])?.id).toBe('pending-1');
    expect(nextDispatchableQueuedTurn([
      failed,
      record({ id: 'running-1', status: 'running' }),
      pending,
    ])).toBeNull();
    expect(nextDispatchableQueuedTurn([
      record({ id: 'paused-1', status: 'paused' }),
      pending,
    ])).toBeNull();
  });

  it('keeps failed turns in the queue rail so the user can remove them', () => {
    const messages = queuedMessagesFromTurns([
      record({ id: 'q1', source: 'typed', status: 'pending', priority: 0, enqueueSeq: 2, message: 'queued' }),
      record({ id: 'f1', source: 'typed', status: 'failed', priority: 0, enqueueSeq: 1, message: 'failed' }),
      record({ id: 's1', source: 'steer', status: 'pending', priority: 10, enqueueSeq: 3, message: 'steer' }),
      record({ id: 'r1', source: 'typed', status: 'running', message: 'live' }),
    ]);

    expect(messages.map((message) => message.id)).toEqual(['s1', 'f1', 'q1']);
    expect(messages.find((message) => message.id === 'f1')?.status).toBe('failed');
    expect(messages.find((message) => message.id === 's1')?.kind).toBe('steer');
  });

  it('persists Queue and Steer with exact turn identities before dispatch', () => {
    const source = readFileSync('components/ai/hooks/use-agent-task.ts', 'utf8');
    expect(source).toContain("await fetch('/api/ai/turns'");
    expect(source).toContain('activeTurnId');
    expect(source).toContain('turnId: input.turnId, clientRequestId: input.clientRequestId');
    expect(source).toContain("fetch(`/api/ai/turns/${encodeURIComponent(turnId)}`");
    expect(source).toContain('body: JSON.stringify({ conversationId: cid, turnId })');
    expect(source).not.toContain("body: JSON.stringify({ conversationId }),\n        keepalive: true");
  });

  it('clears the composer only after durable acceptance', () => {
    const prompt = readFileSync('components/ui/chippi-prompt-box.tsx', 'utf8');
    expect(prompt).toContain('if (!accepted)');
    expect(prompt).toContain('Nothing was cleared — try again.');
    expect(prompt.indexOf('if (!accepted)')).toBeLessThan(prompt.indexOf("setMessage('');"));
    expect(prompt).toContain('boolean | Promise<boolean>');
  });

  it('releases the submit lock once streaming so Enter can queue the next message', () => {
    const prompt = readFileSync('components/ui/chippi-prompt-box.tsx', 'utf8');
    expect(prompt).toContain('(isSubmitting && !isLoading)');
    expect(prompt).not.toContain('disabled || isSubmitting || !hasContent');
  });

  it('does not duplicate the active turn in the queue rail while its claim settles', () => {
    const hook = readFileSync('components/ai/hooks/use-agent-task.ts', 'utf8');
    expect(hook).toContain('.filter((turn) => turn.id !== activeTurnIdRef.current)');
  });

  it('keeps the live composer to one stop control', () => {
    const prompt = readFileSync('components/ui/chippi-prompt-box.tsx', 'utf8');
    expect(prompt).toContain('aria-label="Stop generating"');
    expect(prompt).not.toContain('aria-label="Queue message"');
    expect(prompt).not.toContain('aria-label="Steer active work"');
  });

  it('keeps queued actions compact with Steer primary and Edit/Delete in overflow', () => {
    const workspace = readFileSync('components/chippi/chippi-workspace.tsx', 'utf8');

    expect(workspace).toMatch(/>\s*Steer\s*<\/button>/);
    expect(workspace).toContain('aria-label="Queued message options"');
    expect(workspace).toContain('Edit message');
    expect(workspace).toContain('Delete message');
    expect(workspace).toContain('onSelect={() => { void deleteQueuedMessage(q.id); }}');
    expect(workspace).not.toContain('aria-label="Remove queued message"');
    expect(workspace.match(/<Trash2\b/g)).toHaveLength(1);
  });

  it('bounds the conversation sidebar query on the server', () => {
    const route = readFileSync('app/api/ai/conversations/route.ts', 'utf8');
    expect(route).toContain('Math.max(1, Math.min(requestedLimit, 50))');
    expect(route).toContain('.limit(limit);');
    expect(route).toContain('.limit(limit * 20)');
  });
});
