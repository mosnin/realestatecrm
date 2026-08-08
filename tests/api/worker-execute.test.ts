/**
 * /api/worker/execute — the background worker's execution callback. Pins the
 * fail-closed auth contract (unset secret → 500, wrong bearer → 401), task
 * dispatch, and that a throwing handler surfaces as a 500 (so the worker's
 * BullMQ job retries instead of recording a false success).
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  boom: vi.fn(async () => {
    throw new Error('kaput');
  }),
}));

vi.mock('@/lib/jobs/tasks', () => ({
  WORKER_TASKS: {
    noop: async (payload: unknown) => ({ ok: true, echo: payload ?? null }),
    boom: handlers.boom,
  },
}));

import { POST } from '@/app/api/worker/execute/route';

const SECRET = 'test-worker-secret';

function req(body: unknown, auth?: string) {
  return new Request('http://t/api/worker/execute', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.WORKER_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.WORKER_SECRET;
});

describe('POST /api/worker/execute', () => {
  it('fails closed with 500 when WORKER_SECRET is not configured', async () => {
    delete process.env.WORKER_SECRET;
    const res = await POST(req({ task: 'noop' }, `Bearer ${SECRET}`));
    expect(res.status).toBe(500);
  });

  it('rejects a missing or wrong bearer with 401', async () => {
    expect((await POST(req({ task: 'noop' }))).status).toBe(401);
    expect((await POST(req({ task: 'noop' }, 'Bearer nope'))).status).toBe(401);
  });

  it('rejects unknown tasks and garbage bodies with 400', async () => {
    expect((await POST(req({ task: 'not-a-task' }, `Bearer ${SECRET}`))).status).toBe(400);
    expect((await POST(req({}, `Bearer ${SECRET}`))).status).toBe(400);
  });

  it('executes a known task and returns its result', async () => {
    const res = await POST(req({ task: 'noop', payload: { hi: 1 } }, `Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      task: 'noop',
      result: { ok: true, echo: { hi: 1 } },
    });
  });

  it('a throwing handler returns 500 so the worker retries', async () => {
    const res = await POST(req({ task: 'boom' }, `Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, task: 'boom', error: 'kaput' });
    expect(handlers.boom).toHaveBeenCalledTimes(1);
  });
});
