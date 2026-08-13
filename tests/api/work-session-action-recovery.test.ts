import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { reconcile } = vi.hoisted(() => ({ reconcile: vi.fn() }));
vi.mock('@/lib/work-sessions/actions', () => ({
  reconcileWorkSessionActionExecutions: reconcile,
}));
vi.mock('@/lib/cron-monitor', () => ({
  monitorCron: (_slug: string, _schedule: unknown, handler: unknown) => handler,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

import { GET } from '@/app/api/cron/work-session-action-recovery/route';

const savedSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'cron-secret';
  reconcile.mockReset().mockResolvedValue({ scanned: 2, enqueued: 2 });
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

describe('WorkSession action recovery cron', () => {
  it('fails closed without exact cron authority', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(new NextRequest('http://localhost/api/cron/work-session-action-recovery'))).status)
      .toBe(500);
    process.env.CRON_SECRET = 'cron-secret';
    expect((await GET(new NextRequest('http://localhost/api/cron/work-session-action-recovery'))).status)
      .toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('returns a bounded recovery receipt and exposes failure as 500', async () => {
    const request = () => new NextRequest(
      'http://localhost/api/cron/work-session-action-recovery',
      { headers: { authorization: 'Bearer cron-secret' } },
    );
    const ok = await GET(request());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      ok: true, scanned: 2, enqueued: 2, durationMs: expect.any(Number),
    });

    reconcile.mockRejectedValueOnce(new Error('queue unavailable'));
    const failed = await GET(request());
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'WorkSession action recovery failed' });
  });
});
