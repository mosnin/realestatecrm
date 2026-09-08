// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentTask } from '@/components/ai/hooks/use-agent-task';
import { __resetTurnRunnerForTests } from '@/components/ai/hooks/turn-runner';

let driver: ReturnType<typeof useAgentTask>;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let saved: Record<string, unknown> | null;
let attempts: Record<string, unknown>[];
let failure: number | 'network' | 'truncated';

function Harness() {
  driver = useAgentTask({ spaceSlug: 'qa', conversationId: 'qa-conversation', conversationMode: 'work' });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  saved = null;
  attempts = [];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/ai/turns' && init?.method === 'POST') {
      saved = { ...JSON.parse(String(init.body)), id: JSON.parse(String(init.body)).turnId,
        status: 'pending', priority: 0, enqueueSeq: 1, createdAt: new Date().toISOString() };
      return Response.json({ turn: saved });
    }
    if (url.startsWith('/api/ai/turns?')) {
      // Bound a regressed loop so the assertion fails instead of hanging CI.
      return Response.json({ turns: saved ? [{ ...saved, status: attempts.length > 3 ? 'failed' : 'pending' }] : [] });
    }
    if (url === '/api/ai/task') {
      attempts.push(JSON.parse(String(init?.body)));
      if (failure === 'network') throw new Error('Network error');
      if (failure === 'truncated') return new Response('', { headers: { 'content-type': 'text/event-stream' } });
      return Response.json({ error: failure === 402 ? 'Out of credits.' : 'Request unavailable.' }, { status: failure });
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  __resetTurnRunnerForTests();
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('durable queue after pre-claim failure', () => {
  it.each([402, 429, 503, 'network', 'truncated'] as const)(
    'does not redispatch a pending turn after %s and permits an explicit retry', async (kind) => {
      failure = kind;
      await act(async () => root.render(React.createElement(Harness)));
      await act(async () => { expect(await driver.send('Read my priorities', [], 'work')).toBe(true); });
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(attempts).toHaveLength(1);
      expect(driver.isStreaming).toBe(false);
      expect(driver.messages.filter(message => message.role === 'user')).toHaveLength(1);
      expect(driver.messages.filter(message => message.role === 'assistant')).toHaveLength(1);
      expect(driver.error).toBeTruthy();

      await act(async () => { await driver.retryLastMessage(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(attempts).toHaveLength(2);
      expect(attempts[1].turnId).toBe(attempts[0].turnId);
      expect(attempts[1].clientRequestId).toBe(attempts[0].clientRequestId);
      expect(attempts[1].mode).toBe('work');
    },
  );
});
