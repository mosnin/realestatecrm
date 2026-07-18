/**
 * Route-level test for POST /GET /api/drip/enroll.
 *
 * Covers:
 *   - 401 unauth, 403 no-space
 *   - 400 missing sequenceId/contactId
 *   - enrollContact's typed outcomes map to the right HTTP status, including
 *     cross-tenant rejection (sequence_not_found → 404, NOT a 500 leak)
 *   - GET list is scoped to the caller's space (.eq('spaceId', space.id))
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const enrollContactMock = vi.fn();
vi.mock('@/lib/drip/engine', () => ({
  enrollContact: (...args: unknown[]) => enrollContactMock(...args),
}));

// ── Supabase mock (GET list only) ───────────────────────────────────────────
const eqCalls: Array<[string, unknown]> = [];
const listRows = { value: [] as unknown[] };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          eqCalls.push([col, val]);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: listRows.value, error: null }),
      };
      return chain;
    },
  },
}));

import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { GET, POST } from '@/app/api/drip/enroll/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

function jsonReq(body: unknown) {
  return new NextRequest('http://t/api/drip/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getReq(qs = '') {
  return new NextRequest(`http://t/api/drip/enroll${qs}`);
}

beforeEach(() => {
  eqCalls.length = 0;
  listRows.value = [];
  enrollContactMock.mockReset();
  mockRequireAuth.mockReset();
  mockGetSpaceForUser.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: 'user-1' });
  mockGetSpaceForUser.mockResolvedValue({ id: 'space-1' } as never);
});

describe('POST /api/drip/enroll — auth + validation', () => {
  it('401s when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await POST(jsonReq({ sequenceId: 's1', contactId: 'c1' }));
    expect(res.status).toBe(401);
    expect(enrollContactMock).not.toHaveBeenCalled();
  });

  it('403s when the user has no space', async () => {
    mockGetSpaceForUser.mockResolvedValue(null);
    const res = await POST(jsonReq({ sequenceId: 's1', contactId: 'c1' }));
    expect(res.status).toBe(403);
    expect(enrollContactMock).not.toHaveBeenCalled();
  });

  it('400s on a missing sequenceId/contactId', async () => {
    const res = await POST(jsonReq({ sequenceId: 's1' }));
    expect(res.status).toBe(400);
    expect(enrollContactMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/drip/enroll — outcome mapping', () => {
  it('201s and returns the enrollmentId on success', async () => {
    enrollContactMock.mockResolvedValue({ outcome: 'enrolled', enrollmentId: 'enr-1' });
    const res = await POST(jsonReq({ sequenceId: 's1', contactId: 'c1' }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ enrollmentId: 'enr-1' });
    // The route always resolves spaceId from the AUTHENTICATED caller's own
    // space, never from the request body — the cross-tenant guard.
    expect(enrollContactMock).toHaveBeenCalledWith({
      spaceId: 'space-1',
      sequenceId: 's1',
      contactId: 'c1',
    });
  });

  it('404s a cross-tenant / nonexistent sequenceId (never a 500 leak)', async () => {
    enrollContactMock.mockResolvedValue({ outcome: 'sequence_not_found' });
    const res = await POST(jsonReq({ sequenceId: 'someone-elses-sequence', contactId: 'c1' }));
    expect(res.status).toBe(404);
  });

  it('404s a contact not found in this space', async () => {
    enrollContactMock.mockResolvedValue({ outcome: 'contact_not_found' });
    const res = await POST(jsonReq({ sequenceId: 's1', contactId: 'c1' }));
    expect(res.status).toBe(404);
  });

  it('409s an already-enrolled contact', async () => {
    enrollContactMock.mockResolvedValue({ outcome: 'already_enrolled' });
    const res = await POST(jsonReq({ sequenceId: 's1', contactId: 'c1' }));
    expect(res.status).toBe(409);
  });

  it('500s a hard engine failure', async () => {
    enrollContactMock.mockResolvedValue({ outcome: 'failed', error: 'db down' });
    const res = await POST(jsonReq({ sequenceId: 's1', contactId: 'c1' }));
    expect(res.status).toBe(500);
  });
});

describe('GET /api/drip/enroll', () => {
  it('scopes the list query to the caller space', async () => {
    listRows.value = [{ id: 'enr-1', spaceId: 'space-1' }];
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(['spaceId', 'space-1']);
  });

  it('401s when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });
});
