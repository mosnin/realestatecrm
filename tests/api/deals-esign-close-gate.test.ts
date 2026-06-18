/**
 * Route-level test for `PATCH /api/deals/[id]` — the CONFIGURABLE e-sign close
 * gate. Behavior change behind a per-brokerage flag,
 * `Brokerage.requireSignedDocsBeforeClose`, default OFF.
 *
 * Contract (see app/api/deals/[id]/route.ts):
 *   - setting OFF (or no brokerage)  → close to 'won' succeeds, exactly as
 *     before. If unsigned docs exist, the success body carries a non-blocking
 *     `closedWithUnsignedDocs: true` advisory (and ONLY when true).
 *   - setting ON + an OPEN signature request (created|sent|delivered) → BLOCKED
 *     with 409 + code 'unsigned_documents'. The Deal is NOT updated.
 *   - setting ON + all signatures terminal (completed/declined/voided) →
 *     succeeds (nothing in flight).
 *   - setting ON + NO signature requests at all → succeeds (nothing to sign).
 *
 * "Required documents signed" has no first-class schema, so the gate reuses the
 * strongest available signal: an in-flight SignatureRequest tied to the deal
 * (lib/esign.ts → dealHasOpenSignatureRequests). See that helper for the
 * created/sent/delivered = "open" rationale.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));
vi.mock('@/lib/vectorize', () => ({
  syncDeal: vi.fn(() => Promise.resolve()),
  deleteDealVector: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/agent/fire-trigger', () => ({
  fireAgentTrigger: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/storage', () => ({
  deleteObjectsBestEffort: vi.fn(() => Promise.resolve({ ok: 0, failed: [] })),
  getSignedDownloadUrl: vi.fn(),
  uploadObject: vi.fn(),
  buildKey: (...s: string[]) => s.join('/'),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── Supabase mock ────────────────────────────────────────────────────────────
// Per-table behavior is driven by module-level knobs the tests set. The PATCH
// "close to won" flow (body { status: 'won' }, no stageId / contactIds) issues,
// in order:
//   1. Deal   select .eq().eq()           → awaited array (existing deal)
//   2. Brokerage select .eq().maybeSingle()→ { requireSignedDocsBeforeClose }
//   3. SignatureRequest .eq().eq().in()    → awaited array (open requests)
//   4. Deal   update .eq().select().single()→ updated row   (skipped if blocked)
//   5. DealActivity insert                 → awaited        (skipped if blocked)
//   6. DealStage select .eq().single()     → stage include  (skipped if blocked)
let brokerageGateOn = false;
let openSignatureRows: Array<{ id: string; status: string }> = [];
let dealUpdateValues: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    let isUpdate = false;
    let updateValues: Record<string, unknown> | null = null;

    // Resolve the value this chain yields when awaited directly (no terminal
    // .single()/.maybeSingle()). Deal-select and SignatureRequest-select are
    // both consumed as arrays.
    const arrayResult = () => {
      if (table === 'Deal') {
        return { data: [{ id: 'deal_1', spaceId: 'space_1', status: 'active', stageId: 'stage_1' }], error: null };
      }
      if (table === 'SignatureRequest') {
        return { data: openSignatureRows, error: null };
      }
      return { data: [], error: null };
    };

    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(arrayResult()));
    chain.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.update = vi.fn((values: Record<string, unknown>) => {
      isUpdate = true;
      updateValues = values;
      if (table === 'Deal') dealUpdateValues = values;
      return chain;
    });
    chain.maybeSingle = vi.fn(() => {
      if (table === 'Brokerage') {
        return Promise.resolve({ data: { requireSignedDocsBeforeClose: brokerageGateOn }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    chain.single = vi.fn(() => {
      if (table === 'Deal' && isUpdate) {
        return Promise.resolve({ data: { id: 'deal_1', spaceId: 'space_1', ...(updateValues ?? {}) }, error: null });
      }
      if (table === 'DealStage') {
        return Promise.resolve({ data: { id: 'stage_1', name: 'Closed Won' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    // Make the chain awaitable as an array result (Deal-select / SignatureRequest).
    chain.then = (resolve: (v: unknown) => unknown) => resolve(arrayResult());
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { PATCH } from '@/app/api/deals/[id]/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/deals/deal_1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'deal_1' });

// Space WITH a brokerage by default (so the gate is reachable when on).
const SPACE_WITH_BROKERAGE = { id: 'space_1', name: 'Acme', brokerageId: 'brk_1' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  brokerageGateOn = false;
  openSignatureRows = [];
  dealUpdateValues = null;
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
  mockGetSpaceForUser.mockResolvedValue(SPACE_WITH_BROKERAGE);
});

describe('PATCH /api/deals/[id] — e-sign close gate (default OFF)', () => {
  it('setting OFF: close to won succeeds even with an open signature request', async () => {
    brokerageGateOn = false;
    openSignatureRows = [{ id: 'sig_1', status: 'sent' }];
    const res = await PATCH(makeReq({ status: 'won' }), { params });
    expect(res.status).toBe(200);
    // Deal was actually updated to won + closedAt stamped (unchanged behavior).
    expect(dealUpdateValues).not.toBeNull();
    expect(dealUpdateValues!.status).toBe('won');
    expect(typeof dealUpdateValues!.closedAt).toBe('string');
  });

  it('setting OFF + unsigned docs: success body carries closedWithUnsignedDocs advisory', async () => {
    brokerageGateOn = false;
    openSignatureRows = [{ id: 'sig_1', status: 'delivered' }];
    const res = await PATCH(makeReq({ status: 'won' }), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { closedWithUnsignedDocs?: boolean };
    expect(body.closedWithUnsignedDocs).toBe(true);
  });

  it('setting OFF + no open docs: success body OMITS the advisory', async () => {
    brokerageGateOn = false;
    openSignatureRows = [];
    const res = await PATCH(makeReq({ status: 'won' }), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { closedWithUnsignedDocs?: boolean };
    expect(body.closedWithUnsignedDocs).toBeUndefined();
  });

  it('setting ON + open signature request: BLOCKED with 409, Deal not updated', async () => {
    brokerageGateOn = true;
    openSignatureRows = [{ id: 'sig_1', status: 'sent' }];
    const res = await PATCH(makeReq({ status: 'won' }), { params });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe('unsigned_documents');
    expect(body.error).toMatch(/aren't signed/i);
    // The blocking return happens BEFORE the Deal.update.
    expect(dealUpdateValues).toBeNull();
  });

  it('setting ON + all signatures terminal (completed): succeeds (nothing in flight)', async () => {
    brokerageGateOn = true;
    // The route filters by .in(OPEN_STATUSES); a completed request is excluded
    // server-side, so the helper sees zero open rows.
    openSignatureRows = [];
    const res = await PATCH(makeReq({ status: 'won' }), { params });
    expect(res.status).toBe(200);
    expect(dealUpdateValues!.status).toBe('won');
    const body = (await res.json()) as { closedWithUnsignedDocs?: boolean };
    expect(body.closedWithUnsignedDocs).toBeUndefined();
  });

  it('setting ON + NO signature requests at all: succeeds (nothing to sign)', async () => {
    brokerageGateOn = true;
    openSignatureRows = [];
    const res = await PATCH(makeReq({ status: 'won' }), { params });
    expect(res.status).toBe(200);
    expect(dealUpdateValues!.status).toBe('won');
  });

  it('setting ON but space has NO brokerage: gate is skipped, close succeeds', async () => {
    brokerageGateOn = true; // would block, but no brokerage means no lookup
    openSignatureRows = [{ id: 'sig_1', status: 'sent' }];
    mockGetSpaceForUser.mockResolvedValue({ id: 'space_1', name: 'Solo', brokerageId: null } as never);
    const res = await PATCH(makeReq({ status: 'won' }), { params });
    expect(res.status).toBe(200);
    expect(dealUpdateValues!.status).toBe('won');
  });

  it('non-close PATCH (status=on_hold) never consults the gate', async () => {
    brokerageGateOn = true;
    openSignatureRows = [{ id: 'sig_1', status: 'sent' }];
    const res = await PATCH(makeReq({ status: 'on_hold' }), { params });
    expect(res.status).toBe(200);
    expect(dealUpdateValues!.status).toBe('on_hold');
    expect(dealUpdateValues!.closedAt).toBeUndefined();
  });
});
