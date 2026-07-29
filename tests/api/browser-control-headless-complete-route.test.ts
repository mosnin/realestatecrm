import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { finishMock } = vi.hoisted(() => ({ finishMock: vi.fn() }));
vi.mock('@/lib/browser-control/session', () => ({ finishHeadlessWorker: (...args: unknown[]) => finishMock(...args) }));
import { POST } from '@/app/api/browser-control/headless/complete/route';

const token = '00000000-0000-4000-8000-000000000001';
const original = process.env.CHIPPI_BROWSER_WORKER_SECRET;
const request = (body: unknown, secret = 'worker-secret') => new NextRequest(new Request('http://t/api/browser-control/headless/complete', {
  method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
}));
beforeEach(() => { finishMock.mockReset(); finishMock.mockResolvedValue(true); process.env.CHIPPI_BROWSER_WORKER_SECRET = 'worker-secret'; });

describe('headless completion authority', () => {
  it('fails closed for missing config, bad secret, and malformed token', async () => {
    delete process.env.CHIPPI_BROWSER_WORKER_SECRET;
    expect((await POST(request({ sessionId: 's', workerLeaseToken: token }))).status).toBe(500);
    process.env.CHIPPI_BROWSER_WORKER_SECRET = 'worker-secret';
    expect((await POST(request({ sessionId: 's', workerLeaseToken: token }, 'wrong'))).status).toBe(401);
    expect((await POST(request({ sessionId: 's', workerLeaseToken: 'not-a-token' }))).status).toBe(400);
    expect(finishMock).not.toHaveBeenCalled();
  });

  it('reports stale token as unfinished and only forwards a valid exact completion once', async () => {
    finishMock.mockResolvedValueOnce(false);
    expect(await (await POST(request({ sessionId: 's', workerLeaseToken: token }))).json()).toEqual({ finished: false });
    expect(finishMock).toHaveBeenCalledTimes(1);
    finishMock.mockResolvedValueOnce(true);
    expect(await (await POST(request({ sessionId: 's', workerLeaseToken: token, error: 'failed' }))).json()).toEqual({ finished: true });
    expect(finishMock).toHaveBeenLastCalledWith({ sessionId: 's', leaseToken: token, error: 'failed' });
  });
});

process.on('exit', () => { process.env.CHIPPI_BROWSER_WORKER_SECRET = original; });
