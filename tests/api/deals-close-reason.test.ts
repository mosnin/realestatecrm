/**
 * Route-level test for `PATCH /api/deals/[id]` — close-reason taxonomy (Feature B).
 *
 * Verifies the structured `closeReason` / `closeReasonDetail` are persisted on
 * the won/lost transition, validated against the outcome, and cleared when the
 * deal reopens to active. The affordance is optional, so a missing reason must
 * still close the deal (just with closeReason left untouched).
 *
 * Mirrors tests/api/deals-esign-close-gate.test.ts (the deals PATCH mock shape).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn() }));
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
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// The deal starts 'active' so any won/lost body is a real transition.
let dealUpdateValues: Record<string, unknown> | null = null;
let activityInserts: Array<Record<string, unknown>> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    let isUpdate = false;
    let updateValues: Record<string, unknown> | null = null;

    const arrayResult = () => {
      if (table === 'Deal') {
        return {
          data: [{ id: 'deal_1', spaceId: 'space_1', status: 'active', stageId: 'stage_1' }],
          error: null,
        };
      }
      if (table === 'SignatureRequest') return { data: [], error: null };
      return { data: [], error: null };
    };

    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(arrayResult()));
    chain.insert = vi.fn((values: unknown) => {
      if (table === 'DealActivity') {
        activityInserts = Array.isArray(values)
          ? (values as Array<Record<string, unknown>>)
          : [values as Record<string, unknown>];
      }
      return Promise.resolve({ data: null, error: null });
    });
    chain.update = vi.fn((values: Record<string, unknown>) => {
      isUpdate = true;
      updateValues = values;
      if (table === 'Deal') dealUpdateValues = values;
      return chain;
    });
    chain.maybeSingle = vi.fn(() => {
      if (table === 'Brokerage') {
        return Promise.resolve({ data: { requireSignedDocsBeforeClose: false }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    chain.single = vi.fn(() => {
      if (table === 'Deal' && isUpdate) {
        return Promise.resolve({ data: { id: 'deal_1', spaceId: 'space_1', ...(updateValues ?? {}) }, error: null });
      }
      if (table === 'DealStage') {
        return Promise.resolve({ data: { id: 'stage_1', name: 'Closed' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
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
// No brokerageId → e-sign gate short-circuits (still runs the won path though).
const SPACE = { id: 'space_1', name: 'Acme' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  dealUpdateValues = null;
  activityInserts = [];
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' } as never);
  mockGetSpaceForUser.mockResolvedValue(SPACE);
});

describe('PATCH /api/deals/[id] — close-reason taxonomy', () => {
  it('persists a valid won reason + detail on the won transition', async () => {
    const res = await PATCH(
      makeReq({ status: 'won', closeReason: 'price', closeReasonDetail: 'Best offer' }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(dealUpdateValues!.status).toBe('won');
    expect(dealUpdateValues!.closeReason).toBe('price');
    expect(dealUpdateValues!.closeReasonDetail).toBe('Best offer');
  });

  it('persists a valid lost reason on the lost transition', async () => {
    await PATCH(makeReq({ status: 'lost', closeReason: 'financing_fell_through' }), { params });
    expect(dealUpdateValues!.status).toBe('lost');
    expect(dealUpdateValues!.closeReason).toBe('financing_fell_through');
  });

  it('rejects a mismatched reason (lost reason on a won deal) → null, not written', async () => {
    await PATCH(makeReq({ status: 'won', closeReason: 'financing_fell_through' }), { params });
    expect(dealUpdateValues!.status).toBe('won');
    // closeReason was supplied but invalid for the outcome → normalized to null.
    expect(dealUpdateValues!.closeReason).toBeNull();
  });

  it('closes fine with no reason supplied (optional, non-blocking)', async () => {
    const res = await PATCH(makeReq({ status: 'won' }), { params });
    expect(res.status).toBe(200);
    expect(dealUpdateValues!.status).toBe('won');
    // No closeReason key was sent → we don't touch the column.
    expect('closeReason' in dealUpdateValues!).toBe(false);
  });

  it('clears closeReason + detail when the deal reopens to active', async () => {
    await PATCH(makeReq({ status: 'active' }), { params });
    expect(dealUpdateValues!.status).toBe('active');
    expect(dealUpdateValues!.closeReason).toBeNull();
    expect(dealUpdateValues!.closeReasonDetail).toBeNull();
  });

  it('stamps the structured reason into the status_change activity metadata', async () => {
    await PATCH(makeReq({ status: 'won', closeReason: 'relationship' }), { params });
    const statusActivity = activityInserts.find((a) => a.type === 'status_change');
    expect(statusActivity).toBeTruthy();
    expect((statusActivity!.metadata as Record<string, unknown>).closeReason).toBe('relationship');
  });

  it('does not write closeReason on a non-close PATCH (e.g. title edit)', async () => {
    await PATCH(makeReq({ title: 'Renamed deal' }), { params });
    expect(dealUpdateValues!.title).toBe('Renamed deal');
    expect('closeReason' in dealUpdateValues!).toBe(false);
  });
});
