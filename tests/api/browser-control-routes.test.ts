/**
 * Route-level tests for app/api/browser-control/**. The pairing/session
 * queue logic (lib/browser-control/auth.ts + session.ts) is covered directly
 * in browser-control-pairing.test.ts / browser-control-queue.test.ts; here we
 * assert each route's auth gating, request validation, HTTP status mapping,
 * and that it calls the lib layer with the right (spaceId, userId) derived
 * from the AUTHENTICATED context — never from the request body.
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

// ── lib/browser-control/auth + session mocks ────────────────────────────────

const {
  issuePairingCodeMock, redeemPairingCodeMock, verifyExtTokenMock,
} = vi.hoisted(() => ({
  issuePairingCodeMock: vi.fn(async (..._a: any[]): Promise<any> => ({ code: 'ABCD1234', expiresAt: '2026-07-19T00:05:00.000Z' })),
  redeemPairingCodeMock: vi.fn(async (..._a: any[]): Promise<any> => ({
    ok: true, token: 'chippi_ext_deadbeef', tokenPrefix: 'chippi_ext_dead...',
    spaceId: 'space_1', userId: 'user_1', linkId: 'link_1',
  })),
  verifyExtTokenMock: vi.fn(async (..._a: any[]): Promise<any> => ({
    link: { id: 'link_1', spaceId: 'space_1', userId: 'user_1', tokenPrefix: 'p', deviceLabel: null, createdAt: '', lastUsedAt: null, revokedAt: null },
  })),
}));
vi.mock('@/lib/browser-control/auth', () => ({
  issuePairingCode: issuePairingCodeMock,
  redeemPairingCode: redeemPairingCodeMock,
  verifyExtToken: verifyExtTokenMock,
}));

const {
  startSessionMock, getActiveSessionMock, getOrStartSessionForLinkMock, findLinkSessionMock,
  expireStaleQueuedActionsMock, dispatchNextActionMock, recordActionResultMock, endSessionsForLinkMock,
  recordPollHeartbeatMock, endSessionMock, getLatestFrameMock,
} = vi.hoisted(() => ({
  startSessionMock: vi.fn(async (opts: any): Promise<any> => ({ id: 'sess_1', status: 'active', startedAt: 'now', endedAt: null, ...opts })),
  getActiveSessionMock: vi.fn(async (..._a: any[]): Promise<any> => null),
  getOrStartSessionForLinkMock: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'sess_1', spaceId: 'space_1', userId: 'user_1', linkId: 'link_1', status: 'active', startedAt: 'now', endedAt: null })),
  findLinkSessionMock: vi.fn(async (..._a: any[]): Promise<any> => null),
  expireStaleQueuedActionsMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  dispatchNextActionMock: vi.fn(async (..._a: any[]): Promise<any> => null),
  recordActionResultMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  endSessionsForLinkMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  recordPollHeartbeatMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  endSessionMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  getLatestFrameMock: vi.fn(async (..._a: any[]): Promise<any> => null),
}));
vi.mock('@/lib/browser-control/session', () => ({
  startSession: startSessionMock,
  getActiveSession: getActiveSessionMock,
  getOrStartSessionForLink: getOrStartSessionForLinkMock,
  findLinkSession: findLinkSessionMock,
  expireStaleQueuedActions: expireStaleQueuedActionsMock,
  dispatchNextAction: dispatchNextActionMock,
  recordActionResult: recordActionResultMock,
  endSessionsForLink: endSessionsForLinkMock,
  recordPollHeartbeat: recordPollHeartbeatMock,
  endSession: endSessionMock,
  getLatestFrame: getLatestFrameMock,
}));

// ── Direct-Supabase mock (status + link/[id] routes query BrowserLink
//    directly) — records every .eq() call so tests can assert the tenant
//    scope (spaceId/userId) is actually applied, not just present in code. ──

type Row = Record<string, unknown>;
const eqCalls: { table: string; column: string; value: unknown }[] = [];
let linkRows: Row[] = [];

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  let op: 'select' | 'update' = 'select';
  let updateValues: Row = {};
  const filters: Array<(r: Row) => boolean> = [];
  chain.select = () => chain;
  chain.update = (v: Row) => { op = 'update'; updateValues = v; return chain; };
  chain.eq = (col: string, val: unknown) => {
    eqCalls.push({ table, column: col, value: val });
    filters.push((r) => r[col] === val);
    return chain;
  };
  chain.is = (col: string, val: unknown) => { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return chain; };
  chain.order = () => chain;
  const exec = async () => {
    const matched = linkRows.filter((r) => filters.every((f) => f(r)));
    if (op === 'update') {
      matched.forEach((r) => Object.assign(r, updateValues));
      return { data: matched, error: null };
    }
    return { data: matched, error: null };
  };
  chain.maybeSingle = async () => {
    const matched = linkRows.filter((r) => filters.every((f) => f(r)));
    if (op === 'update') matched.forEach((r) => Object.assign(r, updateValues));
    return { data: matched[0] ?? null, error: null };
  };
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => exec().then(onF, onR);
  return chain;
}
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (t: string) => makeChain(t) },
}));

import { POST as pairCodePost } from '@/app/api/browser-control/pair/code/route';
import { POST as pairRedeemPost } from '@/app/api/browser-control/pair/redeem/route';
import { POST as pollPost } from '@/app/api/browser-control/poll/route';
import { GET as statusGet } from '@/app/api/browser-control/status/route';
import { DELETE as linkDelete } from '@/app/api/browser-control/link/[id]/route';

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

beforeEach(() => {
  vi.clearAllMocks();
  rateState.allowed = true;
  requireAuthMock.mockResolvedValue({ userId: 'clerk_1' });
  getSpaceForUserMock.mockResolvedValue({ id: 'space_1', slug: 'acme' });
  getCurrentDbUserMock.mockResolvedValue({ id: 'user_1', clerkId: 'clerk_1' });
  issuePairingCodeMock.mockResolvedValue({ code: 'ABCD1234', expiresAt: '2026-07-19T00:05:00.000Z' });
  redeemPairingCodeMock.mockResolvedValue({
    ok: true, token: 'chippi_ext_deadbeef', tokenPrefix: 'chippi_ext_dead...',
    spaceId: 'space_1', userId: 'user_1', linkId: 'link_1',
  });
  verifyExtTokenMock.mockResolvedValue({
    link: { id: 'link_1', spaceId: 'space_1', userId: 'user_1', tokenPrefix: 'p', deviceLabel: null, createdAt: '', lastUsedAt: null, revokedAt: null },
  });
  getOrStartSessionForLinkMock.mockResolvedValue({ id: 'sess_1', spaceId: 'space_1', userId: 'user_1', linkId: 'link_1', status: 'active', startedAt: 'now', endedAt: null });
  findLinkSessionMock.mockResolvedValue(null);
  dispatchNextActionMock.mockResolvedValue(null);
  recordPollHeartbeatMock.mockResolvedValue(undefined);
  endSessionMock.mockResolvedValue(undefined);
  getLatestFrameMock.mockResolvedValue(null);
  eqCalls.length = 0;
  linkRows = [];
});

// ── POST /pair/code ──────────────────────────────────────────────────────

describe('POST /api/browser-control/pair/code', () => {
  it('401s when unauthenticated, never touching the lib', async () => {
    requireAuthMock.mockResolvedValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await pairCodePost(req('http://t/api/browser-control/pair/code', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(issuePairingCodeMock).not.toHaveBeenCalled();
  });

  it('429s when rate-limited', async () => {
    rateState.allowed = false;
    const res = await pairCodePost(req('http://t/api/browser-control/pair/code', { method: 'POST' }));
    expect(res.status).toBe(429);
    expect(issuePairingCodeMock).not.toHaveBeenCalled();
  });

  it('issues a code scoped to the AUTHENTICATED user\'s space, not any request input', async () => {
    const res = await pairCodePost(req('http://t/api/browser-control/pair/code', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe('ABCD1234');
    expect(issuePairingCodeMock).toHaveBeenCalledWith({ spaceId: 'space_1', userId: 'user_1' });
  });
});

// ── POST /pair/redeem ────────────────────────────────────────────────────

describe('POST /api/browser-control/pair/redeem', () => {
  it('429s when IP rate-limited', async () => {
    rateState.allowed = false;
    const res = await pairRedeemPost(req('http://t/api/browser-control/pair/redeem', {
      method: 'POST', body: JSON.stringify({ code: 'ABCD1234' }),
    }));
    expect(res.status).toBe(429);
    expect(redeemPairingCodeMock).not.toHaveBeenCalled();
  });

  it('400s on a malformed body', async () => {
    const res = await pairRedeemPost(req('http://t/api/browser-control/pair/redeem', {
      method: 'POST', body: JSON.stringify({ code: 'short' }),
    }));
    expect(res.status).toBe(400);
    expect(redeemPairingCodeMock).not.toHaveBeenCalled();
  });

  it('maps an expired code to 410', async () => {
    redeemPairingCodeMock.mockResolvedValueOnce({ ok: false, error: 'expired_code' });
    const res = await pairRedeemPost(req('http://t/api/browser-control/pair/redeem', {
      method: 'POST', body: JSON.stringify({ code: 'ABCD1234' }),
    }));
    expect(res.status).toBe(410);
  });

  it('maps an invalid/unknown code to 400', async () => {
    redeemPairingCodeMock.mockResolvedValueOnce({ ok: false, error: 'invalid_code' });
    const res = await pairRedeemPost(req('http://t/api/browser-control/pair/redeem', {
      method: 'POST', body: JSON.stringify({ code: 'ABCD1234' }),
    }));
    expect(res.status).toBe(400);
  });

  it('on success, returns the raw token once and opens a session', async () => {
    const res = await pairRedeemPost(req('http://t/api/browser-control/pair/redeem', {
      method: 'POST', body: JSON.stringify({ code: 'ABCD1234', deviceLabel: 'My Chrome' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe('chippi_ext_deadbeef');
    expect(startSessionMock).toHaveBeenCalledWith({ spaceId: 'space_1', userId: 'user_1', linkId: 'link_1' });
  });
});

// ── POST /poll ───────────────────────────────────────────────────────────

describe('POST /api/browser-control/poll', () => {
  it('401s on an invalid/missing bearer token', async () => {
    verifyExtTokenMock.mockResolvedValueOnce(null);
    const res = await pollPost(req('http://t/api/browser-control/poll', {
      method: 'POST', headers: { authorization: 'Bearer garbage' }, body: '{}',
    }));
    expect(res.status).toBe(401);
    expect(dispatchNextActionMock).not.toHaveBeenCalled();
  });

  it('429s when polled too fast', async () => {
    rateState.allowed = false;
    const res = await pollPost(req('http://t/api/browser-control/poll', {
      method: 'POST', headers: { authorization: 'Bearer chippi_ext_x' }, body: '{}',
    }));
    expect(res.status).toBe(429);
  });

  it('400s on a malformed poll body', async () => {
    const res = await pollPost(req('http://t/api/browser-control/poll', {
      method: 'POST', headers: { authorization: 'Bearer chippi_ext_x' }, body: '{"completed": "not-an-object"}',
    }));
    expect(res.status).toBe(400);
  });

  it('records a completed result then returns the next queued action (FIFO)', async () => {
    dispatchNextActionMock.mockResolvedValueOnce({ id: 'act_2', sessionId: 'sess_1', input: { type: 'wait', ms: 500 } });
    const res = await pollPost(req('http://t/api/browser-control/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer chippi_ext_x', 'content-type': 'application/json' },
      body: JSON.stringify({ completed: { actionId: 'act_1', result: { ok: true, summary: 'Clicked' } } }),
    }));
    expect(res.status).toBe(200);
    expect(recordActionResultMock).toHaveBeenCalledWith(
      'act_1',
      { spaceId: 'space_1', linkId: 'link_1' },
      { ok: true, summary: 'Clicked' },
    );
    const body = await res.json();
    expect(body.action.id).toBe('act_2');
    expect(body.stop).toBe(false);
  });

  it('returns stop:true when the reported session has already ended, without dispatching', async () => {
    findLinkSessionMock.mockResolvedValueOnce({ id: 'sess_old', spaceId: 'space_1', userId: 'user_1', linkId: 'link_1', status: 'ended', startedAt: 'x', endedAt: 'y' });
    const res = await pollPost(req('http://t/api/browser-control/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer chippi_ext_x', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_old' }),
    }));
    const body = await res.json();
    expect(body).toEqual({ action: null, stop: true });
    expect(dispatchNextActionMock).not.toHaveBeenCalled();
  });

  it('returns action:null, stop:false when the queue is empty', async () => {
    const res = await pollPost(req('http://t/api/browser-control/poll', {
      method: 'POST', headers: { authorization: 'Bearer chippi_ext_x', 'content-type': 'application/json' }, body: '{}',
    }));
    const body = await res.json();
    expect(body.action).toBeNull();
    expect(body.stop).toBe(false);
  });
});

// ── GET /status ──────────────────────────────────────────────────────────

describe('GET /api/browser-control/status', () => {
  it('401s when unauthenticated', async () => {
    requireAuthMock.mockResolvedValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await statusGet(req('http://t/api/browser-control/status'));
    expect(res.status).toBe(401);
  });

  it('honestly reports NOT connected when there is no link', async () => {
    linkRows = [];
    const res = await statusGet(req('http://t/api/browser-control/status'));
    const body = await res.json();
    expect(body.connected).toBe(false);
    expect(body.links).toEqual([]);
  });

  it('reports connected + active session when a link and session exist, scoped to the caller', async () => {
    linkRows = [
      { id: 'link_1', spaceId: 'space_1', userId: 'user_1', tokenPrefix: 'p', deviceLabel: 'Chrome', createdAt: 'x', lastUsedAt: null, revokedAt: null },
      // A revoked link and a different user's link must NOT leak into the response.
      { id: 'link_revoked', spaceId: 'space_1', userId: 'user_1', tokenPrefix: 'p', deviceLabel: 'Old', createdAt: 'x', lastUsedAt: null, revokedAt: '2026-01-01' },
      { id: 'link_other_user', spaceId: 'space_1', userId: 'user_2', tokenPrefix: 'p', deviceLabel: 'NotMine', createdAt: 'x', lastUsedAt: null, revokedAt: null },
    ];
    getActiveSessionMock.mockResolvedValueOnce({ id: 'sess_1', status: 'active', startedAt: 'now', endedAt: null, spaceId: 'space_1', userId: 'user_1', linkId: 'link_1' });

    const res = await statusGet(req('http://t/api/browser-control/status'));
    const body = await res.json();
    expect(body.connected).toBe(true);
    expect(body.links).toHaveLength(1);
    expect(body.links[0].id).toBe('link_1');
    expect(body.session).toEqual({ id: 'sess_1', status: 'active', startedAt: 'now', hasFrame: false });

    // Prove the tenant scope was actually applied to the query.
    expect(eqCalls).toContainEqual({ table: 'BrowserLink', column: 'spaceId', value: 'space_1' });
    expect(eqCalls).toContainEqual({ table: 'BrowserLink', column: 'userId', value: 'user_1' });
  });
});

// ── DELETE /link/[id] ────────────────────────────────────────────────────

describe('DELETE /api/browser-control/link/[id]', () => {
  function paramsFor(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockResolvedValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await linkDelete(req('http://t/x', { method: 'DELETE' }), paramsFor('link_1'));
    expect(res.status).toBe(401);
  });

  it('404s on a link owned by a DIFFERENT user in the same space (cross-tenant/cross-user block)', async () => {
    linkRows = [{ id: 'link_1', spaceId: 'space_1', userId: 'user_OTHER', tokenPrefix: 'p', deviceLabel: null, createdAt: 'x', lastUsedAt: null, revokedAt: null }];
    const res = await linkDelete(req('http://t/x', { method: 'DELETE' }), paramsFor('link_1'));
    expect(res.status).toBe(404);
    expect(endSessionsForLinkMock).not.toHaveBeenCalled();
    // The ownership lookup was scoped by BOTH spaceId and userId.
    expect(eqCalls).toContainEqual({ table: 'BrowserLink', column: 'userId', value: 'user_1' });
  });

  it('404s on a link that does not exist', async () => {
    linkRows = [];
    const res = await linkDelete(req('http://t/x', { method: 'DELETE' }), paramsFor('nope'));
    expect(res.status).toBe(404);
  });

  it('revokes the caller\'s own link and ends its sessions', async () => {
    linkRows = [{ id: 'link_1', spaceId: 'space_1', userId: 'user_1', tokenPrefix: 'p', deviceLabel: null, createdAt: 'x', lastUsedAt: null, revokedAt: null }];
    const res = await linkDelete(req('http://t/x', { method: 'DELETE' }), paramsFor('link_1'));
    expect(res.status).toBe(200);
    expect(linkRows[0].revokedAt).toBeTruthy();
    expect(endSessionsForLinkMock).toHaveBeenCalledWith('link_1', { spaceId: 'space_1' });
  });
});
