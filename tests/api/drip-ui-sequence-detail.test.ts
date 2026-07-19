/**
 * Route-level tests for GET/PATCH/DELETE /api/drip/sequences/[id].
 *
 * Covers:
 *   - auth/space gating (401/403)
 *   - GET/PATCH/DELETE all 404 on a cross-tenant or nonexistent id (the
 *     `.eq('id', id).eq('spaceId', space.id)` pair is the boundary — a
 *     lookup scoped to another tenant's spaceId simply returns nothing)
 *   - PATCH validates steps (parseDripSteps) and name before writing
 *   - PATCH's update call carries both id and spaceId filters
 *   - DELETE is blocked (409) while a live ('enrolled') enrollment exists on
 *     the sequence, and only deletes once that's false
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const eqCalls: Array<{ table: string; col: string; val: unknown }> = [];
const updateCalls: Array<{ table: string; payload: unknown }> = [];
const deleteCalls: Array<{ table: string }> = [];

// Configurable per-test responses.
const state = {
  sequenceSelectRow: null as Record<string, unknown> | null, // GET's select + DELETE's existence check
  sequenceUpdateRow: null as Record<string, unknown> | null, // PATCH's update().select()
  enrolledCount: 0, // DELETE's live-enrollment guard
  deleteError: null as { message: string } | null,
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let isCount = false;
      let isUpdate = false;
      let isDelete = false;
      const chain: Record<string, unknown> = {
        select: (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
          isCount = !!opts?.count;
          return chain;
        },
        update: (payload: unknown) => {
          isUpdate = true;
          updateCalls.push({ table, payload });
          return chain;
        },
        delete: () => {
          isDelete = true;
          deleteCalls.push({ table });
          return chain;
        },
        eq: (col: string, val: unknown) => {
          eqCalls.push({ table, col, val });
          return chain;
        },
        maybeSingle: () => {
          if (isUpdate) return Promise.resolve({ data: state.sequenceUpdateRow, error: null });
          return Promise.resolve({ data: state.sequenceSelectRow, error: null });
        },
        then: (resolve: (v: { data: unknown; count?: number; error: unknown }) => unknown) => {
          if (isDelete) return resolve({ data: null, error: state.deleteError });
          if (isCount) return resolve({ data: [], count: state.enrolledCount, error: null });
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  },
}));

import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { GET, PATCH, DELETE } from '@/app/api/drip/sequences/[id]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchReq(body: unknown) {
  return new NextRequest('http://t/api/drip/sequences/seq-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  eqCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  state.sequenceSelectRow = { id: 'seq-1', name: 'Nurture', steps: [], active: true };
  state.sequenceUpdateRow = { id: 'seq-1', name: 'Nurture', steps: [], active: true };
  state.enrolledCount = 0;
  state.deleteError = null;
  mockRequireAuth.mockReset();
  mockGetSpaceForUser.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: 'user-1' });
  mockGetSpaceForUser.mockResolvedValue({ id: 'space-1' } as never);
});

describe('GET /api/drip/sequences/[id]', () => {
  it('401s when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await GET(new NextRequest('http://t'), params('seq-1'));
    expect(res.status).toBe(401);
  });

  it('403s with no space', async () => {
    mockGetSpaceForUser.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://t'), params('seq-1'));
    expect(res.status).toBe(403);
  });

  it('404s a cross-tenant / nonexistent id', async () => {
    state.sequenceSelectRow = null;
    const res = await GET(new NextRequest('http://t'), params('someone-elses-seq'));
    expect(res.status).toBe(404);
  });

  it('200s and scopes the lookup by id + spaceId', async () => {
    const res = await GET(new NextRequest('http://t'), params('seq-1'));
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual({ table: 'DripSequence', col: 'id', val: 'seq-1' });
    expect(eqCalls).toContainEqual({ table: 'DripSequence', col: 'spaceId', val: 'space-1' });
  });
});

describe('PATCH /api/drip/sequences/[id]', () => {
  it('401s when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await PATCH(patchReq({ name: 'x' }), params('seq-1'));
    expect(res.status).toBe(401);
  });

  it('400s on an empty name', async () => {
    const res = await PATCH(patchReq({ name: '   ' }), params('seq-1'));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('400s on out-of-order dayOffsets in steps', async () => {
    const res = await PATCH(
      patchReq({ steps: [{ dayOffset: 5, channel: 'email', instruction: 'a' }, { dayOffset: 1, channel: 'email', instruction: 'b' }] }),
      params('seq-1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
    expect(updateCalls).toHaveLength(0);
  });

  it('400s when the patch has nothing real to change', async () => {
    const res = await PATCH(patchReq({}), params('seq-1'));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('404s a cross-tenant / nonexistent id', async () => {
    state.sequenceUpdateRow = null;
    const res = await PATCH(patchReq({ active: false }), params('someone-elses-seq'));
    expect(res.status).toBe(404);
  });

  it('updates, scoping the write by id + spaceId (never a client-supplied space)', async () => {
    const res = await PATCH(
      patchReq({ name: 'Renamed', active: false, steps: [{ dayOffset: 0, channel: 'sms', instruction: 'hi' }] }),
      params('seq-1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const payload = updateCalls[0].payload as Record<string, unknown>;
    expect(payload.name).toBe('Renamed');
    expect(payload.active).toBe(false);
    expect(Array.isArray(payload.steps)).toBe(true);
    expect(eqCalls).toContainEqual({ table: 'DripSequence', col: 'id', val: 'seq-1' });
    expect(eqCalls).toContainEqual({ table: 'DripSequence', col: 'spaceId', val: 'space-1' });
  });
});

describe('DELETE /api/drip/sequences/[id]', () => {
  it('401s when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await DELETE(new NextRequest('http://t'), params('seq-1'));
    expect(res.status).toBe(401);
  });

  it('404s a cross-tenant / nonexistent id (before ever checking enrollments)', async () => {
    state.sequenceSelectRow = null;
    const res = await DELETE(new NextRequest('http://t'), params('someone-elses-seq'));
    expect(res.status).toBe(404);
    expect(deleteCalls).toHaveLength(0);
  });

  it('409s when the sequence still has a live enrollment (refuses to cascade-delete silently)', async () => {
    state.enrolledCount = 1;
    const res = await DELETE(new NextRequest('http://t'), params('seq-1'));
    expect(res.status).toBe(409);
    expect(deleteCalls).toHaveLength(0);
  });

  it('deletes, scoping by id + spaceId, once there is nothing live enrolled', async () => {
    state.enrolledCount = 0;
    const res = await DELETE(new NextRequest('http://t'), params('seq-1'));
    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(1);
    expect(eqCalls).toContainEqual({ table: 'DripSequence', col: 'id', val: 'seq-1' });
    expect(eqCalls).toContainEqual({ table: 'DripSequence', col: 'spaceId', val: 'space-1' });
  });
});
