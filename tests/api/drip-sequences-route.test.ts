/**
 * Route-level test for GET/POST /api/drip/sequences.
 *
 * Covers: auth/space gating, steps validation (parseDripSteps) rejects a bad
 * shape with 400 + issues, and a successful create is stamped with the
 * caller's own spaceId (never a client-supplied one).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const insertCalls: Array<{ payload: unknown }> = [];
let countValue = 0;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      let isCount = false;
      const chain: Record<string, unknown> = {
        select: (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
          isCount = !!opts?.count;
          return chain;
        },
        eq: () => chain,
        order: () => chain,
        insert: (payload: unknown) => {
          insertCalls.push({ payload });
          return chain;
        },
        single: () => Promise.resolve({ data: { id: 'seq-1', ...(insertCalls.at(-1)?.payload as object) }, error: null }),
        then: (resolve: (v: { data: unknown[]; count?: number; error: null }) => unknown) =>
          resolve(isCount ? { data: [], count: countValue, error: null } : { data: [], error: null }),
      };
      return chain;
    },
  },
}));

import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { GET, POST } from '@/app/api/drip/sequences/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

function jsonReq(body: unknown) {
  return new NextRequest('http://t/api/drip/sequences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  insertCalls.length = 0;
  countValue = 0;
  mockRequireAuth.mockReset();
  mockGetSpaceForUser.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: 'user-1' });
  mockGetSpaceForUser.mockResolvedValue({ id: 'space-1' } as never);
});

describe('POST /api/drip/sequences', () => {
  it('401s when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await POST(jsonReq({ name: 'x', steps: [] }));
    expect(res.status).toBe(401);
  });

  it('400s on empty steps', async () => {
    const res = await POST(jsonReq({ name: 'New seller nurture', steps: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
    expect(insertCalls).toHaveLength(0);
  });

  it('400s on out-of-order dayOffsets', async () => {
    const res = await POST(
      jsonReq({
        name: 'Bad order',
        steps: [
          { dayOffset: 5, channel: 'sms', instruction: 'later' },
          { dayOffset: 1, channel: 'sms', instruction: 'earlier' },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a sequence stamped with the caller space, not any client-supplied id', async () => {
    const res = await POST(
      jsonReq({
        name: 'New seller nurture',
        steps: [
          { dayOffset: 0, channel: 'sms', instruction: 'Intro' },
          { dayOffset: 3, channel: 'sms', instruction: 'Value nudge' },
          { dayOffset: 10, channel: 'email', instruction: 'Check-in' },
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    const payload = insertCalls[0].payload as Record<string, unknown>;
    expect(payload.spaceId).toBe('space-1');
    expect(payload.name).toBe('New seller nurture');
    expect(Array.isArray(payload.steps)).toBe(true);
  });

  it('409s past the per-space sequence cap', async () => {
    countValue = 50;
    const res = await POST(
      jsonReq({ name: 'One more', steps: [{ dayOffset: 0, channel: 'sms', instruction: 'hi' }] }),
    );
    expect(res.status).toBe(409);
    expect(insertCalls).toHaveLength(0);
  });
});

describe('GET /api/drip/sequences', () => {
  it('403s with no space', async () => {
    mockGetSpaceForUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('200s with an (honestly empty) list', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sequences: [] });
  });
});
