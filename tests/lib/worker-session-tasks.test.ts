/**
 * The work-session task handlers behind /api/worker/execute: one step per
 * queued job, self-chaining while work remains, and the never-strand inline
 * fallback when re-enqueue fails.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

const engine = vi.hoisted(() => ({
  planSession: vi.fn(),
  executeSession: vi.fn(async () => {}),
  advanceSession: vi.fn(),
}));
vi.mock('@/lib/work-sessions/engine', () => engine);

const enqueueMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queue', () => ({ enqueueWorkerTask: enqueueMock }));

import { WORKER_TASKS } from '@/lib/jobs/tasks';

beforeEach(() => {
  engine.planSession.mockReset();
  engine.executeSession.mockClear();
  engine.advanceSession.mockReset();
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue(true);
});

describe('work-session-plan task', () => {
  it('plan lands in running → chains one advance job', async () => {
    engine.planSession.mockResolvedValue('running');
    const out = await WORKER_TASKS['work-session-plan']({ sessionId: 'ws1' });
    expect(enqueueMock).toHaveBeenCalledWith('work-session-advance', { sessionId: 'ws1' });
    expect(out).toEqual({ sessionId: 'ws1', status: 'running', chained: true });
    expect(engine.executeSession).not.toHaveBeenCalled();
  });

  it('plan lands in awaiting_approval → no execution chained', async () => {
    engine.planSession.mockResolvedValue('awaiting_approval');
    const out = await WORKER_TASKS['work-session-plan']({ sessionId: 'ws1' });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(out).toEqual({ sessionId: 'ws1', status: 'awaiting_approval' });
  });

  it('re-enqueue failure → finishes inline instead of stranding a running session', async () => {
    engine.planSession.mockResolvedValue('running');
    enqueueMock.mockResolvedValue(null);
    await WORKER_TASKS['work-session-plan']({ sessionId: 'ws1' });
    expect(engine.executeSession).toHaveBeenCalledWith('ws1');
  });

  it('rejects a payload without a sessionId', async () => {
    await expect(WORKER_TASKS['work-session-plan']({})).rejects.toThrow(/sessionId/);
  });
});

describe('work-session-advance task', () => {
  it('more steps remain → re-enqueues itself (one step per job)', async () => {
    engine.advanceSession.mockResolvedValue('more');
    const out = await WORKER_TASKS['work-session-advance']({ sessionId: 'ws1' });
    expect(engine.advanceSession).toHaveBeenCalledWith('ws1');
    expect(enqueueMock).toHaveBeenCalledWith('work-session-advance', { sessionId: 'ws1' });
    expect(out).toEqual({ sessionId: 'ws1', progress: 'more', chained: true });
  });

  it('done → chain ends quietly', async () => {
    engine.advanceSession.mockResolvedValue('done');
    const out = await WORKER_TASKS['work-session-advance']({ sessionId: 'ws1' });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(out).toEqual({ sessionId: 'ws1', progress: 'done' });
  });

  it('re-enqueue failure mid-run → inline continuation, never a stranded session', async () => {
    engine.advanceSession.mockResolvedValue('more');
    enqueueMock.mockResolvedValue(null);
    await WORKER_TASKS['work-session-advance']({ sessionId: 'ws1' });
    expect(engine.executeSession).toHaveBeenCalledWith('ws1');
  });
});
