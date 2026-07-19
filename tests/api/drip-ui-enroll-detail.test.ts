/**
 * Route-level tests for:
 *   - DELETE /api/drip/enroll/[id]           — manual "stop this enrollment"
 *   - GET    /api/drip/enroll (contact join) — enrollments enriched with
 *                                               contactName/contactEmail
 *
 * Covers:
 *   - auth/space gating
 *   - DELETE 404s a cross-tenant/nonexistent enrollment id, 409s one that's
 *     already completed/stopped, and only stops (never deletes the row) a
 *     currently-'enrolled' one, scoped by id + spaceId + status='enrolled'
 *   - GET's contact join is scoped by spaceId (a contactId from another
 *     tenant can't be joined in) and degrades to null names, never a crash,
 *     when the join query errors
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const eqCalls: Array<{ table: string; col: string; val: unknown }> = [];
const inCalls: Array<{ table: string; col: string; vals: unknown[] }> = [];
const updateCalls: Array<{ table: string; payload: unknown }> = [];

const state = {
  lookupRow: null as Record<string, unknown> | null, // DELETE's existence/status check
  updateError: null as { message: string } | null,
  enrollmentListRows: [] as Array<Record<string, unknown>>,
  contactRows: [] as Array<Record<string, unknown>>,
  contactJoinError: null as { message: string } | null,
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let isUpdate = false;
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (payload: unknown) => {
          isUpdate = true;
          updateCalls.push({ table, payload });
          return chain;
        },
        eq: (col: string, val: unknown) => {
          eqCalls.push({ table, col, val });
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        in: (col: string, vals: unknown[]) => {
          inCalls.push({ table, col, vals });
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: state.lookupRow, error: null }),
        then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
          if (table === 'DripEnrollment' && isUpdate) {
            return resolve({ data: null, error: state.updateError });
          }
          if (table === 'DripEnrollment') {
            return resolve({ data: state.enrollmentListRows, error: null });
          }
          if (table === 'Contact') {
            return resolve({ data: state.contactRows, error: state.contactJoinError });
          }
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  },
}));

import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { DELETE as stopEnrollment } from '@/app/api/drip/enroll/[id]/route';
import { GET as listEnrollments } from '@/app/api/drip/enroll/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
function getReq(qs = '') {
  return new NextRequest(`http://t/api/drip/enroll${qs}`);
}

beforeEach(() => {
  eqCalls.length = 0;
  inCalls.length = 0;
  updateCalls.length = 0;
  state.lookupRow = { id: 'enr-1', status: 'enrolled' };
  state.updateError = null;
  state.enrollmentListRows = [];
  state.contactRows = [];
  state.contactJoinError = null;
  mockRequireAuth.mockReset();
  mockGetSpaceForUser.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: 'user-1' });
  mockGetSpaceForUser.mockResolvedValue({ id: 'space-1' } as never);
});

describe('DELETE /api/drip/enroll/[id]', () => {
  it('401s when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await stopEnrollment(new NextRequest('http://t'), params('enr-1'));
    expect(res.status).toBe(401);
  });

  it('403s with no space', async () => {
    mockGetSpaceForUser.mockResolvedValue(null);
    const res = await stopEnrollment(new NextRequest('http://t'), params('enr-1'));
    expect(res.status).toBe(403);
  });

  it('404s a cross-tenant / nonexistent enrollment id', async () => {
    state.lookupRow = null;
    const res = await stopEnrollment(new NextRequest('http://t'), params('someone-elses-enr'));
    expect(res.status).toBe(404);
    expect(updateCalls).toHaveLength(0);
  });

  it('409s an enrollment that is already completed/stopped', async () => {
    state.lookupRow = { id: 'enr-1', status: 'completed' };
    const res = await stopEnrollment(new NextRequest('http://t'), params('enr-1'));
    expect(res.status).toBe(409);
    expect(updateCalls).toHaveLength(0);
  });

  it('stops a live enrollment, scoping the write by id + spaceId + status=enrolled', async () => {
    const res = await stopEnrollment(new NextRequest('http://t'), params('enr-1'));
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const payload = updateCalls[0].payload as Record<string, unknown>;
    expect(payload.status).toBe('stopped');
    expect(payload.stopReason).toBe('unenrolled');
    expect(eqCalls).toContainEqual({ table: 'DripEnrollment', col: 'id', val: 'enr-1' });
    expect(eqCalls).toContainEqual({ table: 'DripEnrollment', col: 'spaceId', val: 'space-1' });
    expect(eqCalls).toContainEqual({ table: 'DripEnrollment', col: 'status', val: 'enrolled' });
  });
});

describe('GET /api/drip/enroll — contact join', () => {
  it('returns an empty list without ever querying Contact', async () => {
    state.enrollmentListRows = [];
    const res = await listEnrollments(getReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ enrollments: [] });
    expect(inCalls).toHaveLength(0);
  });

  it('joins contact name/email, scoped to the caller space', async () => {
    state.enrollmentListRows = [
      { id: 'enr-1', sequenceId: 'seq-1', contactId: 'c1', enrolledAt: 't', currentStep: 0, status: 'enrolled', stopReason: null, createdAt: 't' },
      { id: 'enr-2', sequenceId: 'seq-1', contactId: 'c2', enrolledAt: 't', currentStep: 1, status: 'enrolled', stopReason: null, createdAt: 't' },
    ];
    state.contactRows = [
      { id: 'c1', name: 'Jane Doe', email: 'jane@example.com' },
      { id: 'c2', name: 'John Roe', email: null },
    ];
    const res = await listEnrollments(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrollments).toEqual([
      expect.objectContaining({ id: 'enr-1', contactName: 'Jane Doe', contactEmail: 'jane@example.com' }),
      expect.objectContaining({ id: 'enr-2', contactName: 'John Roe', contactEmail: null }),
    ]);
    expect(inCalls).toContainEqual({ table: 'Contact', col: 'id', vals: ['c1', 'c2'] });
    expect(eqCalls).toContainEqual({ table: 'Contact', col: 'spaceId', val: 'space-1' });
  });

  it('degrades to null contact names (never a 500) when the join query errors', async () => {
    state.enrollmentListRows = [
      { id: 'enr-1', sequenceId: 'seq-1', contactId: 'c1', enrolledAt: 't', currentStep: 0, status: 'enrolled', stopReason: null, createdAt: 't' },
    ];
    state.contactJoinError = { message: 'db hiccup' };
    const res = await listEnrollments(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrollments).toEqual([
      expect.objectContaining({ id: 'enr-1', contactName: null, contactEmail: null }),
    ]);
  });
});
