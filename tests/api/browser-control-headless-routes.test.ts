/**
 * Route-level tests for app/api/browser-control/headless/{start,poll}.
 * The session-lifecycle logic itself (startHeadlessSession, getHeadlessSessionById,
 * recordHeadlessActionResult, …) is covered directly in
 * tests/lib/browser-routing.test.ts; here we assert each route's auth
 * gating, request validation, HTTP status mapping, and that reads/writes are
 * scoped by values derived from the AUTHENTICATED context / the session
 * lookup — never from request body input.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Clerk / space / db-user auth mocks (POST /headless/start) ──────────────

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

// ── lib/browser-control/session mocks ───────────────────────────────────────

const {
  startHeadlessSessionMock,
  getHeadlessSessionByIdMock,
  expireStaleQueuedActionsMock,
  dispatchNextActionMock,
  recordHeadlessActionResultMock,
  recordPollHeartbeatMock,
  endHeadlessSessionMock,
} = vi.hoisted(() => ({
  startHeadlessSessionMock: vi.fn(async (opts: any): Promise<any> => ({
    id: 'sess_h1', spaceId: opts.spaceId, userId: opts.userId, linkId: null,
    status: 'active', source: 'headless', startedAt: '2026-07-19T00:00:00.000Z', endedAt: null,
  })),
  getHeadlessSessionByIdMock: vi.fn(async (..._a: any[]): Promise<any> => ({
    id: 'sess_h1', spaceId: 'space_1', userId: 'user_1', linkId: null,
    status: 'active', source: 'headless', startedAt: 'x', endedAt: null,
  })),
  expireStaleQueuedActionsMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  dispatchNextActionMock: vi.fn(async (..._a: any[]): Promise<any> => null),
  recordHeadlessActionResultMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  recordPollHeartbeatMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
  endHeadlessSessionMock: vi.fn(async (..._a: any[]): Promise<any> => undefined),
}));
vi.mock('@/lib/browser-control/session', () => ({
  startHeadlessSession: startHeadlessSessionMock,
  getHeadlessSessionById: getHeadlessSessionByIdMock,
  expireStaleQueuedActions: expireStaleQueuedActionsMock,
  dispatchNextAction: dispatchNextActionMock,
  recordHeadlessActionResult: recordHeadlessActionResultMock,
  recordPollHeartbeat: recordPollHeartbeatMock,
  endHeadlessSession: endHeadlessSessionMock,
}));

import { POST as startPost } from '@/app/api/browser-control/headless/start/route';
import { POST as pollPost } from '@/app/api/browser-control/headless/poll/route';

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

const ORIGINAL_SECRET = process.env.AGENT_INTERNAL_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  rateState.allowed = true;
  requireAuthMock.mockResolvedValue({ userId: 'clerk_1' });
  getSpaceForUserMock.mockResolvedValue({ id: 'space_1', slug: 'acme' });
  getCurrentDbUserMock.mockResolvedValue({ id: 'user_1', clerkId: 'clerk_1' });
  startHeadlessSessionMock.mockResolvedValue({
    id: 'sess_h1', spaceId: 'space_1', userId: 'user_1', linkId: null,
    status: 'active', source: 'headless', startedAt: '2026-07-19T00:00:00.000Z', endedAt: null,
  });
  getHeadlessSessionByIdMock.mockResolvedValue({
    id: 'sess_h1', spaceId: 'space_1', userId: 'user_1', linkId: null,
    status: 'active', source: 'headless', startedAt: 'x', endedAt: null,
  });
  dispatchNextActionMock.mockResolvedValue(null);
  process.env.AGENT_INTERNAL_SECRET = 'test-internal-secret';
});

afterAll(() => {
  process.env.AGENT_INTERNAL_SECRET = ORIGINAL_SECRET;
});

// ── POST /headless/start ─────────────────────────────────────────────────

describe('POST /api/browser-control/headless/start', () => {
  it('401s when unauthenticated, never starting a session', async () => {
    requireAuthMock.mockResolvedValueOnce(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await startPost(req('http://t/api/browser-control/headless/start', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(startHeadlessSessionMock).not.toHaveBeenCalled();
  });

  it('429s when rate-limited', async () => {
    rateState.allowed = false;
    const res = await startPost(req('http://t/api/browser-control/headless/start', { method: 'POST' }));
    expect(res.status).toBe(429);
    expect(startHeadlessSessionMock).not.toHaveBeenCalled();
  });

  it('starts a headless session scoped to the AUTHENTICATED user\'s space, not any request input', async () => {
    const res = await startPost(req('http://t/api/browser-control/headless/start', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe('sess_h1');
    expect(body.source).toBe('headless');
    expect(startHeadlessSessionMock).toHaveBeenCalledWith({ spaceId: 'space_1', userId: 'user_1' });
  });
});

// ── POST /headless/poll ──────────────────────────────────────────────────

describe('POST /api/browser-control/headless/poll', () => {
  it('500s when AGENT_INTERNAL_SECRET is not configured (fail closed)', async () => {
    delete process.env.AGENT_INTERNAL_SECRET;
    const res = await pollPost(req('http://t/api/browser-control/headless/poll', {
      method: 'POST', headers: { authorization: 'Bearer whatever' }, body: JSON.stringify({ sessionId: 'sess_h1' }),
    }));
    expect(res.status).toBe(500);
    process.env.AGENT_INTERNAL_SECRET = 'test-internal-secret';
  });

  it('401s on a missing/wrong bearer', async () => {
    const res = await pollPost(req('http://t/api/browser-control/headless/poll', {
      method: 'POST', headers: { authorization: 'Bearer garbage' }, body: JSON.stringify({ sessionId: 'sess_h1' }),
    }));
    expect(res.status).toBe(401);
    expect(getHeadlessSessionByIdMock).not.toHaveBeenCalled();
  });

  it('400s when sessionId is missing — a headless worker cannot rely on auto-resolve', async () => {
    const res = await pollPost(req('http://t/api/browser-control/headless/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer test-internal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
    expect(getHeadlessSessionByIdMock).not.toHaveBeenCalled();
  });

  it('429s when polled too fast', async () => {
    rateState.allowed = false;
    const res = await pollPost(req('http://t/api/browser-control/headless/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer test-internal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_h1' }),
    }));
    expect(res.status).toBe(429);
  });

  it('returns stop:true without dispatching when the session is unknown', async () => {
    getHeadlessSessionByIdMock.mockResolvedValueOnce(null);
    const res = await pollPost(req('http://t/api/browser-control/headless/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer test-internal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_unknown' }),
    }));
    const body = await res.json();
    expect(body).toEqual({ action: null, stop: true });
    expect(dispatchNextActionMock).not.toHaveBeenCalled();
  });

  it('returns stop:true without dispatching when the session has already ended', async () => {
    getHeadlessSessionByIdMock.mockResolvedValueOnce({
      id: 'sess_h1', spaceId: 'space_1', userId: 'user_1', linkId: null,
      status: 'ended', source: 'headless', startedAt: 'x', endedAt: 'y',
    });
    const res = await pollPost(req('http://t/api/browser-control/headless/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer test-internal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_h1' }),
    }));
    const body = await res.json();
    expect(body).toEqual({ action: null, stop: true });
    expect(dispatchNextActionMock).not.toHaveBeenCalled();
  });

  it('records a completed result then returns the next queued action, scoped to the SESSION\'s spaceId', async () => {
    getHeadlessSessionByIdMock.mockResolvedValueOnce({
      id: 'sess_h1', spaceId: 'space_from_lookup', userId: 'user_1', linkId: null,
      status: 'active', source: 'headless', startedAt: 'x', endedAt: null,
    });
    dispatchNextActionMock.mockResolvedValueOnce({ id: 'act_2', sessionId: 'sess_h1', input: { type: 'wait', ms: 500 } });

    const res = await pollPost(req('http://t/api/browser-control/headless/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer test-internal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_h1', completed: { actionId: 'act_1', result: { ok: true, summary: 'Opened page' } } }),
    }));

    expect(res.status).toBe(200);
    expect(recordHeadlessActionResultMock).toHaveBeenCalledWith(
      'act_1',
      { spaceId: 'space_from_lookup', sessionId: 'sess_h1' },
      { ok: true, summary: 'Opened page' },
    );
    // Downstream calls must use the session's spaceId (from the lookup), not
    // any spaceId a caller might have tried to smuggle in the body.
    expect(recordPollHeartbeatMock).toHaveBeenCalledWith('sess_h1', { spaceId: 'space_from_lookup' }, undefined);
    expect(dispatchNextActionMock).toHaveBeenCalledWith('sess_h1', { spaceId: 'space_from_lookup' });

    const body = await res.json();
    expect(body.action.id).toBe('act_2');
    expect(body.stop).toBe(false);
  });

  it('ends the session and stops immediately on killed:true, without dispatching', async () => {
    const res = await pollPost(req('http://t/api/browser-control/headless/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer test-internal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_h1', killed: true }),
    }));
    const body = await res.json();
    expect(body).toEqual({ action: null, stop: true });
    expect(endHeadlessSessionMock).toHaveBeenCalledWith('sess_h1', { spaceId: 'space_1' });
    expect(dispatchNextActionMock).not.toHaveBeenCalled();
  });

  it('returns action:null, stop:false when the queue is empty', async () => {
    const res = await pollPost(req('http://t/api/browser-control/headless/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer test-internal-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_h1' }),
    }));
    const body = await res.json();
    expect(body.action).toBeNull();
    expect(body.stop).toBe(false);
  });
});
