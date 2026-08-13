/**
 * Work-session dispatch priority (lib/work-sessions/kick.ts): Cloudflare
 * queue first, Inngest only as legacy fallback, inline after() last — and a
 * dead queue falls through instead of stranding the session.
 */

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const enqueueMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queue', () => ({
  enqueueWorkerTask: enqueueMock,
  workerQueueConfigured: () => Boolean(process.env.WORKER_URL && process.env.WORKER_SECRET),
}));

const inngestSend = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: inngestSend } }));

const afterCallbacks = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock('next/server', () => ({ after: (cb: () => Promise<void>) => afterCallbacks.push(cb) }));

const engine = vi.hoisted(() => ({
  planSession: vi.fn(async () => 'running' as const),
  executeSession: vi.fn(async () => {}),
  advanceSession: vi.fn(),
}));
vi.mock('@/lib/work-sessions/engine', () => engine);
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { kickPlan, kickExecute } from '@/lib/work-sessions/kick';

beforeEach(() => {
  enqueueMock.mockReset();
  inngestSend.mockClear();
  engine.planSession.mockClear();
  engine.executeSession.mockClear();
  afterCallbacks.length = 0;
  delete process.env.INNGEST_EVENT_KEY;
  delete process.env.INNGEST_SIGNING_KEY;
  delete process.env.WORKER_URL;
  delete process.env.WORKER_SECRET;
});
afterEach(() => {
  delete process.env.INNGEST_EVENT_KEY;
  delete process.env.INNGEST_SIGNING_KEY;
  delete process.env.WORKER_URL;
  delete process.env.WORKER_SECRET;
});

describe('kickPlan', () => {
  it('queue accepts → nothing else fires', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'secret';
    enqueueMock.mockResolvedValue(true);
    await kickPlan('ws1');
    expect(enqueueMock).toHaveBeenCalledWith('work-session-plan', { sessionId: 'ws1' });
    expect(inngestSend).not.toHaveBeenCalled();
    expect(afterCallbacks.length).toBe(0);
  });

  it('configured queue fails closed instead of dual-dispatching', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'secret';
    process.env.INNGEST_EVENT_KEY = 'legacy';
    process.env.INNGEST_SIGNING_KEY = 'legacy-signing';
    enqueueMock.mockResolvedValue(null);

    await expect(kickPlan('ws1')).rejects.toThrow('Cloudflare queue did not accept work-session-plan');
    expect(inngestSend).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it('queue unavailable + Inngest configured → Inngest event', async () => {
    enqueueMock.mockResolvedValue(null);
    process.env.INNGEST_EVENT_KEY = 'k';
    process.env.INNGEST_SIGNING_KEY = 's';
    await kickPlan('ws1');
    expect(inngestSend).toHaveBeenCalledWith({ name: 'work-session/plan', data: { sessionId: 'ws1' } });
    expect(afterCallbacks.length).toBe(0);
  });

  it('event key with a whitespace-only signing key is not a durable Inngest rail', async () => {
    enqueueMock.mockResolvedValue(null);
    process.env.INNGEST_EVENT_KEY = 'k';
    process.env.INNGEST_SIGNING_KEY = '   ';

    await kickPlan('ws1');

    expect(inngestSend).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
  });

  it('nothing configured → inline after() runs plan then execute', async () => {
    enqueueMock.mockResolvedValue(null);
    await kickPlan('ws1');
    expect(afterCallbacks.length).toBe(1);
    await afterCallbacks[0]();
    expect(engine.planSession).toHaveBeenCalledWith('ws1');
    expect(engine.executeSession).toHaveBeenCalledWith('ws1'); // plan landed in 'running'
  });
});

describe('kickExecute', () => {
  it('queue accepts → advance task queued, nothing else fires', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'secret';
    enqueueMock.mockResolvedValue(true);
    await kickExecute('ws1');
    expect(enqueueMock).toHaveBeenCalledWith('work-session-advance', { sessionId: 'ws1' });
    expect(inngestSend).not.toHaveBeenCalled();
    expect(afterCallbacks.length).toBe(0);
  });

  it('configured queue rejection never falls through to another rail', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'secret';
    process.env.INNGEST_EVENT_KEY = 'legacy';
    process.env.INNGEST_SIGNING_KEY = 'legacy-signing';
    enqueueMock.mockResolvedValue(null);

    await expect(kickExecute('ws1')).rejects.toThrow('Cloudflare queue did not accept work-session-advance');
    expect(inngestSend).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it('queue unavailable → Inngest, then inline as last resort', async () => {
    enqueueMock.mockResolvedValue(null);
    process.env.INNGEST_EVENT_KEY = 'k';
    process.env.INNGEST_SIGNING_KEY = 's';
    await kickExecute('ws1');
    expect(inngestSend).toHaveBeenCalledWith({ name: 'work-session/execute', data: { sessionId: 'ws1' } });

    inngestSend.mockClear();
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    await kickExecute('ws1');
    expect(inngestSend).not.toHaveBeenCalled();
    expect(afterCallbacks.length).toBe(1);
    await afterCallbacks[0]();
    expect(engine.executeSession).toHaveBeenCalledWith('ws1');
  });
});
