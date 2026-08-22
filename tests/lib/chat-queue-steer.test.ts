import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  insertSteeringMessage,
  type PendingTurnMessage,
} from '@/components/ai/hooks/use-agent-task';

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

  it('keeps the live composer to one stop control', () => {
    const prompt = readFileSync('components/ui/chippi-prompt-box.tsx', 'utf8');
    expect(prompt).toContain('aria-label="Stop generating"');
    expect(prompt).not.toContain('aria-label="Queue message"');
    expect(prompt).not.toContain('aria-label="Steer active work"');
  });

  it('bounds the conversation sidebar query on the server', () => {
    const route = readFileSync('app/api/ai/conversations/route.ts', 'utf8');
    expect(route).toContain('Math.max(1, Math.min(requestedLimit, 50))');
    expect(route).toContain('.limit(limit);');
    expect(route).toContain('.limit(limit * 20)');
  });
});
