import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ entitled: true }));
const { latestMock, frameMock } = vi.hoisted(() => ({ latestMock: vi.fn(), frameMock: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: async () => ({ userId: 'clerk_1' }) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: async () => ({ id: 'space_1' }) }));
vi.mock('@/lib/permissions', () => ({ getCurrentDbUser: async () => ({ id: 'user_1' }) }));
vi.mock('@/lib/chippi/research-workspace-flag', () => ({ isResearchWorkspaceEnabledForSpace: () => state.entitled }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/browser-control/session', () => ({
  getLatestHeadlessSession: (...args: unknown[]) => latestMock(...args),
  getLatestHeadlessFrame: (...args: unknown[]) => frameMock(...args),
}));

import { GET as statusGet } from '@/app/api/browser-control/headless/status/route';
import { GET as frameGet } from '@/app/api/browser-control/headless/frame/route';

const base = { id: 'h1', source: 'headless', startedAt: '2026-01-01T00:00:00.000Z', lastPolledAt: null, workerLeaseExpiresAt: null, workerLastError: null };
beforeEach(() => { state.entitled = true; latestMock.mockReset(); frameMock.mockReset(); });

describe('exact headless observability routes', () => {
  it('gates status and frame to the entitled tenant', async () => {
    state.entitled = false;
    expect((await statusGet()).status).toBe(404);
    expect((await frameGet()).status).toBe(404);
    expect(latestMock).not.toHaveBeenCalled();
    expect(frameMock).not.toHaveBeenCalled();
  });

  it('reports launching, active, stopped, and real error states honestly', async () => {
    latestMock.mockResolvedValueOnce({ ...base, status: 'active' });
    expect((await (await statusGet()).json()).session.state).toBe('launching');
    latestMock.mockResolvedValueOnce({ ...base, status: 'active', lastPolledAt: '2026-01-01T00:00:01.000Z', workerLeaseExpiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect((await (await statusGet()).json()).session.state).toBe('active');
    expect(latestMock).toHaveBeenLastCalledWith('space_1', 'user_1');
    latestMock.mockResolvedValueOnce({ ...base, status: 'active', lastPolledAt: '2026-01-01T00:00:01.000Z', workerLeaseExpiresAt: new Date(Date.now() - 1_000).toISOString() });
    expect((await (await statusGet()).json()).session.state).toBe('error');
    latestMock.mockResolvedValueOnce({ ...base, status: 'ended' });
    expect((await (await statusGet()).json()).session.state).toBe('stopped');
    latestMock.mockResolvedValueOnce({ ...base, status: 'ended', workerLastError: 'worker crashed' });
    const error = await (await statusGet()).json();
    expect(error.session.state).toBe('error');
    expect(error.session.error).toBe('worker crashed');
  });

  it('returns only the exact headless frame provenance', async () => {
    frameMock.mockResolvedValue({ sessionId: 'h1', frame: { image: 'data:image/jpeg;base64,x', at: '2026-01-01T00:00:00.000Z' } });
    const body = await (await frameGet()).json();
    expect(body).toMatchObject({ sessionId: 'h1', source: 'headless' });
    expect(frameMock).toHaveBeenCalledWith('space_1', 'user_1');
  });
});
