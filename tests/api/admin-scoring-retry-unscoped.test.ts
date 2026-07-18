/**
 * POST /api/admin/scoring/retry looks up a Contact by an admin-supplied
 * contactId — not scoped to any single space, by design (an admin can retry
 * scoring for any tenant's contact). Track 4 (cross-tenant read audit)
 * annotated those Contact reads/writes with `unscoped(...)` so the runtime
 * tenant-scope guard (lib/supabase-guard.ts, opt-in via TENANT_GUARD=1)
 * doesn't flag them as an oversight.
 *
 * This test pins the behavioral contract: the route still resolves,
 * rescoring a target Contact end-to-end, whether or not the guard is
 * wrapping the client — i.e. the `unscoped()` annotations added to the route
 * are a safe no-op against a plain mocked Supabase chain (which — like the
 * real supabase-js builder when TENANT_GUARD is unset — has no `.unscoped`
 * method), matching the request path a platform admin actually exercises.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { requireAdminMock, logAdminActionMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(async () => ({ userId: 'admin_1' })),
  logAdminActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/admin', () => ({
  requireAdmin: requireAdminMock,
  logAdminAction: logAdminActionMock,
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

const { scoreMock } = vi.hoisted(() => ({
  scoreMock: vi.fn(async () => ({
    scoringStatus: 'scored',
    leadScore: 82,
    scoreLabel: 'hot',
    scoreSummary: 'Strong applicant',
    scoreDetails: {},
  })),
}));
vi.mock('@/lib/lead-scoring', () => ({ scoreLeadApplicationDynamic: scoreMock }));
vi.mock('@/lib/form-builder', () => ({ getFormConfigs: vi.fn(async () => ({ rental: null, buyer: null })) }));

const contactRow = {
  id: 'contact_cross_tenant',
  spaceId: 'space_other_tenant',
  name: 'Jordan Lee',
  email: 'jordan@example.com',
  phone: null,
  budget: null,
  leadType: 'rental',
  formLeadType: 'rental',
  applicationData: { income: '90000' },
  formConfigSnapshot: null,
  scoringStatus: 'failed',
  Space: { id: 'space_other_tenant', brokerageId: null },
};

const updateCalls: Array<{ payload: Record<string, unknown>; filterId: string }> = [];

vi.mock('@/lib/supabase', () => {
  // Plain mock chain — deliberately has NO `.unscoped` method, matching the
  // real supabase-js builder shape when the tenant-scope guard isn't
  // wrapping the client (the common case; TENANT_GUARD is opt-in).
  function chain(table: string) {
    const c: Record<string, unknown> = {};
    let pendingUpdate: Record<string, unknown> | null = null;
    c.select = () => c;
    c.eq = (_col: string, val: string) => {
      if (pendingUpdate) updateCalls.push({ payload: pendingUpdate, filterId: val });
      return c;
    };
    c.update = (values: Record<string, unknown>) => {
      pendingUpdate = values;
      return c;
    };
    c.maybeSingle = async () => {
      if (table === 'Contact' && !pendingUpdate) {
        return { data: contactRow, error: null };
      }
      return { data: { ...contactRow, ...pendingUpdate }, error: null };
    };
    return c;
  }
  return { supabase: { from: (table: string) => chain(table) } };
});

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/scoring/retry/route';

function req(body: unknown): NextRequest {
  return new NextRequest('http://t/api/admin/scoring/retry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  updateCalls.length = 0;
  requireAdminMock.mockClear();
  logAdminActionMock.mockClear();
  scoreMock.mockClear();
});

describe('POST /api/admin/scoring/retry — cross-tenant admin lookup stays functional', () => {
  it('rescoring a Contact from a different tenant than the admin succeeds', async () => {
    const res = await POST(req({ contactId: '11111111-1111-1111-1111-111111111111' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, scoringStatus: 'scored', leadScore: 82, scoreLabel: 'hot' });
  });

  it('rejects an invalid contactId before touching the database', async () => {
    const res = await POST(req({ contactId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
  });

  it('requires admin auth — a rejected requireAdmin() yields 403, not a DB read', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    const res = await POST(req({ contactId: '11111111-1111-1111-1111-111111111111' }));
    expect(res.status).toBe(403);
  });

  it('audits the retry action with the resolved contact id', async () => {
    await POST(req({ contactId: '11111111-1111-1111-1111-111111111111' }));
    expect(logAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'retry_scoring', target: 'contact_cross_tenant' }),
    );
  });
});
