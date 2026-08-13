import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { lookupMock, endMock } = vi.hoisted(() => ({ lookupMock: vi.fn(), endMock: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: async () => ({ userId: 'clerk_1' }) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: async () => ({ id: 'space_1' }) }));
vi.mock('@/lib/permissions', () => ({ getCurrentDbUser: async () => ({ id: 'user_1' }) }));
vi.mock('@/lib/browser-control/session', () => ({
  getHeadlessSessionForUser: (...args: unknown[]) => lookupMock(...args),
  endHeadlessSession: (...args: unknown[]) => endMock(...args),
}));
import { POST } from '@/app/api/browser-control/headless/stop/route';

const sessionId = '00000000-0000-4000-8000-000000000001';
const req = (body: unknown) => new NextRequest(new Request('http://t/api/browser-control/headless/stop', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

beforeEach(() => { lookupMock.mockReset(); endMock.mockReset(); endMock.mockResolvedValue(undefined); });

describe('exact headless Stop authority', () => {
  it('does not look up or stop on a missing/malformed session id', async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ sessionId: 'foreign' }))).status).toBe(400);
    expect(lookupMock).not.toHaveBeenCalled();
    expect(endMock).not.toHaveBeenCalled();
  });

  it('does not stop a foreign/mismatched session', async () => {
    lookupMock.mockResolvedValueOnce(null);
    expect(await (await POST(req({ sessionId }))).json()).toEqual({ stopped: false });
    expect(lookupMock).toHaveBeenCalledWith(sessionId, { spaceId: 'space_1', userId: 'user_1' });
    expect(endMock).not.toHaveBeenCalled();
  });

  it('stops only the exact authenticated headless session', async () => {
    lookupMock.mockResolvedValueOnce({ id: sessionId, source: 'headless' });
    expect(await (await POST(req({ sessionId }))).json()).toEqual({ stopped: true, sessionId });
    expect(endMock).toHaveBeenCalledTimes(1);
    expect(endMock).toHaveBeenCalledWith(sessionId, { spaceId: 'space_1' });
  });
});
