/**
 * Route-level tests for the screencast/kill/rotation additions:
 *   - GET  /api/browser-control/frame
 *   - POST /api/browser-control/poll   (frame storage + killed:true handling)
 *   - POST /api/browser-control/link/[id]/rotate
 *
 * Mirrors tests/api/browser-control-routes.test.ts's approach: mock the
 * Clerk/space/db-user/rate-limit layer plus lib/browser-control/{auth,session}
 * and assert each route's auth gating, HTTP status mapping, and that it calls
 * the lib layer with (spaceId, userId) derived from the AUTHENTICATED
 * context — never from the request body/params alone.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Clerk / space / db-user auth mocks ──────────────────────────────────────

const { requireAuthMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(async (..._a: any[]): Promise<any> => ({ userId: 'clerk_1' })),
}));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));

const { getSpaceForUserMock } = vi.hoisted(() => ({
  getSpaceForUserMock: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'space_1', slug: 'acme' })),
}));
vi.mock('@/lib/space', () => ({ getSpaceForUser: getSpaceForUserMock }));

const { getCurrentDbUserMock } = vi.hoisted(() => ({
  getCurrentDbUserMock: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'user_1', clerkId: 'clerk_1' })),
}));
vi.mock('@/lib/permissions', () => ({ getCurrentDbUser: getCurrentDbUserMock }));

const { checkRateLimitMock, rateState } = vi.hoisted(() => {
  const rateState = { allowed: true };
  return { rateState, checkRateLimitMock: vi.fn(async (..._a: any[]): Promise<any> => ({ allowed: rateState.allowed })) };
});
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: () => '203.0.113.5',
}));

// ── lib/browser-control/auth mocks ──────────────────────────────────────────

const { verifyExtTokenMock, rotateTokenMock } = vi.hoisted(() => ({
  verifyExtTokenMock: vi.fn(async (..._a: any[]): Promise<any> => ({
    link: { id: 'link_1', spaceId: 'space_1', userId: 'user_1', tokenPrefix: 'p', deviceLabel: null, createdAt: '', lastUsedAt: null, revokedAt: null },
  })),
  rotateTokenMock: vi.fn(async (..._a: any[]): Promise<any> => ({ token: 'chippi_ext_freshtoken', tokenPrefix: 'chippi_ext_fresh...' })),
}));
vi.mock('@/lib/browser-control/auth', () => ({
  verifyExtToken: verifyExtTokenMock,
  rotateToken: rotateTokenMock,
}));

// ── lib/browser-control/session mocks ───────────────────────────────────────

const {
  getOrStartSessionForLinkMock, findLinkSessionMock, expireStaleQueuedActionsMock,
  dispatchNextActionMock, recordActionResultMock, recordPollHeartbeatMock, endSessionMock,
  getLatestFrameMock,
} = vi.hoisted(() => ({
  getOrStartSessionForLinkMock: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'sess_1', spaceId: 'space_1', userId: 'user_1', linkId: 'link_1', status: 'active', startedAt: 'now', endedAt: null })),
  findLinkSessionMock: vi.fn(async (..._a: any[]): Promise<any> => null),
  expireStaleQueuedActionsMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  dispatchNextActionMock: vi.fn(async (..._a: any[]): Promise<any> => null),
  recordActionResultMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  recordPollHeartbeatMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  endSessionMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  getLatestFrameMock: vi.fn(async (..._a: any[]): Promise<any> => null),
}));
vi.mock('@/lib/browser-control/session', () => ({
  getOrStartSessionForLink: getOrStartSessionForLinkMock,
  findLinkSession: findLinkSessionMock,
  expireStaleQueuedActions: expireStaleQueuedActionsMock,
  dispatchNextAction: dispatchNextActionMock,
  recordActionResult: recordActionResultMock,
  recordPollHeartbeat: recordPollHeartbeatMock,
  endSession: endSessionMock,
  getLatestFrame: getLatestFrameMock,
}));

// ── Direct-Supabase mock (rotate route queries BrowserLink for ownership) ──

type Row = Record<string, unknown>;
const eqCalls: { table: string; column: string; value: unknown }[] = [];
let linkRows: Row[] = [];

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  let op: 'select' | 'update' = 'select';
  const filters: Array<(r: Row) => boolean> = [];
  chain.select = () => chain;
  chain.update = () => { op = 'update'; return chain; };
  chain.eq = (col: string, val: unknown) => {
    eqCalls.push({ table, column: col, value: val });
    filters.push((r) => r[col] === val);
    return chain;
  };
  chain.is = (col: string, val: unknown) => { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return chain; };
  chain.order = () => chain;
  const exec = async () => {
    const matched = linkRows.filter((r) => filters.every((f) => f(r)));
    return { data: matched, error: null };
  };
  chain.maybeSingle = async () => {
    const matched = linkRows.filter((r) => filters.every((f) => f(r)));
    return { data: matched[0] ?? null, error: null };
  };
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => exec().then(onF, onR);
  return chain;
}
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (t: string) => makeChain(t) },
}));

import { GET as frameGet } from '@/app/api/browser-control/frame/route';
import { POST as pollPost } from '@/app/api/browser-control/poll/route';
import { POST as rotatePost } from '@/app/api/browser-control/link/[id]/rotate/route';

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

beforeEach(() => {
  vi.clearAllMocks();
  rateState.allowed = true;
  requireAuthMock.mockResolvedValue({ userId: 'clerk_1' });
  getSpaceForUserMock.mockResolvedValue({ id: 'space_1', slug: 'acme' });
  getCurrentDbUserMock.mockResolvedValue({ id: 'user_1', clerkId: 'clerk_1' });
  verifyExtTokenMock.mockResolvedValue({
    link: { id: 'link_1', spaceId: 'space_1', userId: 'user_1', tokenPrefix: 'p', deviceLabel: null, createdAt: '', lastUsedAt: null, revokedAt: null },
  });
  rotateTokenMock.mockResolvedValue({ token: 'chippi_ext_freshtoken', tokenPrefix: 'chippi_ext_fresh...' });
  getOrStartSessionForLinkMock.mockResolvedValue({ id: 'sess_1', spaceId: 'space_1', userId: 'user_1', linkId: 'link_1', status: 'active', startedAt: 'now', endedAt: null });
  findLinkSessionMock.mockResolvedValue(null);
  dispatchNextActionMock.mockResolvedValue(null);
  getLatestFrameMock.mockResolvedValue(null);
  eqCalls.length = 0;
  linkRows = [];
});

// ── GET /frame ───────────────────────────────────────────────────────────

describe('GET /api/browser-control/frame', () => {
  it('401s when unauthenticated', async () => {
    requireAuthMock.mockResolvedValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await frameGet(req('http://t/api/browser-control/frame'));
    expect(res.status).toBe(401);
    expect(getLatestFrameMock).not.toHaveBeenCalled();
  });

  it('429s when polled too fast', async () => {
    rateState.allowed = false;
    const res = await frameGet(req('http://t/api/browser-control/frame'));
    expect(res.status).toBe(429);
    expect(getLatestFrameMock).not.toHaveBeenCalled();
  });

  it('honestly returns null when there is no frame yet', async () => {
    getLatestFrameMock.mockResolvedValueOnce(null);
    const res = await frameGet(req('http://t/api/browser-control/frame'));
    const body = await res.json();
    expect(body.frame).toBeNull();
  });

  it('returns the caller\'s frame, scoped to the AUTHENTICATED (spaceId, userId) — never request input', async () => {
    getLatestFrameMock.mockResolvedValueOnce({ image: 'data:image/jpeg;base64,AAA', pageUrl: 'https://x.example', pageTitle: 'X', at: '2026-07-19T00:00:00.000Z' });
    const res = await frameGet(req('http://t/api/browser-control/frame'));
    const body = await res.json();
    expect(body.frame.image).toBe('data:image/jpeg;base64,AAA');
    expect(getLatestFrameMock).toHaveBeenCalledWith('space_1', 'user_1');
  });
});

// ── POST /poll — frame storage + killed handling ────────────────────────

describe('POST /api/browser-control/poll — frame + kill', () => {
  it('forwards a piggy-backed frame to recordPollHeartbeat for the resolved session', async () => {
    const frame = { image: 'data:image/jpeg;base64,ZZZ', pageUrl: 'https://y.example', pageTitle: 'Y' };
    const res = await pollPost(req('http://t/api/browser-control/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer chippi_ext_x', 'content-type': 'application/json' },
      body: JSON.stringify({ frame }),
    }));
    expect(res.status).toBe(200);
    expect(recordPollHeartbeatMock).toHaveBeenCalledWith('sess_1', { spaceId: 'space_1' }, frame);
  });

  it('a heartbeat with no frame still records the liveness heartbeat', async () => {
    const res = await pollPost(req('http://t/api/browser-control/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer chippi_ext_x', 'content-type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(200);
    expect(recordPollHeartbeatMock).toHaveBeenCalledWith('sess_1', { spaceId: 'space_1' }, undefined);
  });

  it('killed:true ends the session and returns stop:true without dispatching or recording a heartbeat', async () => {
    const res = await pollPost(req('http://t/api/browser-control/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer chippi_ext_x', 'content-type': 'application/json' },
      body: JSON.stringify({ killed: true }),
    }));
    const body = await res.json();
    expect(body).toEqual({ action: null, stop: true });
    expect(endSessionMock).toHaveBeenCalledWith('sess_1', { spaceId: 'space_1' });
    expect(dispatchNextActionMock).not.toHaveBeenCalled();
    expect(recordPollHeartbeatMock).not.toHaveBeenCalled();
  });

  it('killed:true still records a completed action result reported in the same round-trip', async () => {
    const res = await pollPost(req('http://t/api/browser-control/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer chippi_ext_x', 'content-type': 'application/json' },
      body: JSON.stringify({ killed: true, completed: { actionId: 'act_1', result: { ok: true, summary: 'Last click before kill' } } }),
    }));
    expect(res.status).toBe(200);
    expect(recordActionResultMock).toHaveBeenCalledWith(
      'act_1',
      { spaceId: 'space_1', linkId: 'link_1' },
      { ok: true, summary: 'Last click before kill' },
    );
    expect(endSessionMock).toHaveBeenCalledWith('sess_1', { spaceId: 'space_1' });
  });
});

// ── POST /link/[id]/rotate ───────────────────────────────────────────────

describe('POST /api/browser-control/link/[id]/rotate', () => {
  function paramsFor(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('401s when unauthenticated, never touching rotateToken', async () => {
    requireAuthMock.mockResolvedValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await rotatePost(req('http://t/x', { method: 'POST' }), paramsFor('link_1'));
    expect(res.status).toBe(401);
    expect(rotateTokenMock).not.toHaveBeenCalled();
  });

  it('404s on a link owned by a DIFFERENT user in the same space (cross-tenant/cross-user block)', async () => {
    linkRows = [{ id: 'link_1', spaceId: 'space_1', userId: 'user_OTHER', tokenPrefix: 'p', deviceLabel: null, createdAt: 'x', lastUsedAt: null, revokedAt: null }];
    const res = await rotatePost(req('http://t/x', { method: 'POST' }), paramsFor('link_1'));
    expect(res.status).toBe(404);
    expect(rotateTokenMock).not.toHaveBeenCalled();
    expect(eqCalls).toContainEqual({ table: 'BrowserLink', column: 'userId', value: 'user_1' });
  });

  it('404s on a link that does not exist', async () => {
    linkRows = [];
    const res = await rotatePost(req('http://t/x', { method: 'POST' }), paramsFor('nope'));
    expect(res.status).toBe(404);
    expect(rotateTokenMock).not.toHaveBeenCalled();
  });

  it('404s when rotateToken itself reports nothing to rotate (e.g. concurrently revoked)', async () => {
    linkRows = [{ id: 'link_1', spaceId: 'space_1', userId: 'user_1', tokenPrefix: 'p', deviceLabel: null, createdAt: 'x', lastUsedAt: null, revokedAt: null }];
    rotateTokenMock.mockResolvedValueOnce(null);
    const res = await rotatePost(req('http://t/x', { method: 'POST' }), paramsFor('link_1'));
    expect(res.status).toBe(404);
  });

  it('rotates the caller\'s own link and returns the new raw token exactly once', async () => {
    linkRows = [{ id: 'link_1', spaceId: 'space_1', userId: 'user_1', tokenPrefix: 'p', deviceLabel: null, createdAt: 'x', lastUsedAt: null, revokedAt: null }];
    const res = await rotatePost(req('http://t/x', { method: 'POST' }), paramsFor('link_1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe('chippi_ext_freshtoken');
    expect(rotateTokenMock).toHaveBeenCalledWith('link_1', { spaceId: 'space_1' });
  });
});
