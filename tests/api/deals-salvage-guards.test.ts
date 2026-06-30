/**
 * Route-level tests for the salvaged input-validation guards on the deals
 * routes (ported from #263 onto current main):
 *
 *   POST /api/deals
 *     - contactIds must be an array            → 400
 *     - contactIds capped at 50                → 400 over the cap, OK at the cap
 *
 *   PATCH /api/deals/[id]
 *     - position: negative/float/garbage       → 400
 *     - position: valid integer is validated but NOT written (reorder RPC owns
 *       the kanban ordering key)
 *     - propertyId not owned by this space     → 404 (ownership-scoped, not FK-only)
 *
 * These guards are independent of main's close-reason / e-sign / closedAt work,
 * which has its own tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// next/server's `after()` requires a real request scope and throws in Vitest.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn() };
});

// ── Shared mocks ─────────────────────────────────────────────────────────────
vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(),
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));
vi.mock('@/lib/vectorize', () => ({
  syncDeal: vi.fn(() => Promise.resolve()),
  deleteDealVector: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/notify', () => ({
  notifyNewDeal: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/agent/fire-trigger', () => ({
  fireAgentTrigger: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/storage', () => ({
  deleteObjectsBestEffort: vi.fn(() => Promise.resolve({ ok: 0, failed: [] })),
  uploadObject: vi.fn(),
  buildKey: (...s: string[]) => s.join('/'),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
// Idempotency passthrough so a duplicate payload across tests never returns a
// cached row — each call runs the insert fn directly.
vi.mock('@/lib/agent/ts-idempotency', () => ({
  makeIdempotencyKey: (...parts: string[]) => parts.join(':'),
  withIdempotency: (_key: string, fn: () => Promise<unknown>) => fn(),
}));
// E-sign gate: no open signature requests (irrelevant to these guards).
vi.mock('@/lib/esign', () => ({
  dealHasOpenSignatureRequests: vi.fn(async () => ({ hasOpen: false })),
}));

// ── Supabase mock ────────────────────────────────────────────────────────────
// Knobs the tests set. Covers both POST (stage check, last-position, insert,
// stage include) and PATCH (existing-deal select, optional Property ownership
// check, update, activity insert, stage include).
let propertyOwned = true; // Property maybeSingle returns a row in this space?
let dealUpdateValues: Record<string, unknown> | null = null;
let dealInsertValues: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    let isUpdate = false;
    let isInsert = false;
    let updateValues: Record<string, unknown> | null = null;

    const arrayResult = () => {
      if (table === 'Deal') {
        // Existing deal for PATCH; also used by POST last-position (returns
        // [] there because POST calls .order().limit(), handled below).
        return { data: [{ id: 'deal_1', spaceId: 'space_1', status: 'active', stageId: 'stage_1', value: 1000, probability: 50, commissionRate: 3, priority: 'MEDIUM', closeDate: null, followUpAt: null, nextAction: null }], error: null };
      }
      return { data: [], error: null };
    };

    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    // POST last-position: .order().limit(1) awaited → [].
    chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    chain.insert = vi.fn((values: Record<string, unknown>) => {
      isInsert = true;
      if (table === 'Deal') dealInsertValues = values;
      return chain;
    });
    chain.update = vi.fn((values: Record<string, unknown>) => {
      isUpdate = true;
      updateValues = values;
      if (table === 'Deal') dealUpdateValues = values;
      return chain;
    });
    chain.maybeSingle = vi.fn(() => {
      if (table === 'DealStage') {
        return Promise.resolve({ data: { id: 'stage_1', pipelineType: null, name: 'New' }, error: null });
      }
      if (table === 'Property') {
        return Promise.resolve({ data: propertyOwned ? { id: 'prop_1' } : null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    chain.single = vi.fn(() => {
      if (table === 'Deal' && isInsert) {
        return Promise.resolve({ data: { id: 'deal_1', ...(dealInsertValues ?? {}) }, error: null });
      }
      if (table === 'Deal' && isUpdate) {
        return Promise.resolve({ data: { id: 'deal_1', spaceId: 'space_1', ...(updateValues ?? {}) }, error: null });
      }
      if (table === 'DealStage') {
        return Promise.resolve({ data: { id: 'stage_1', name: 'New' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    // Awaiting the chain directly → array result (PATCH existing-deal select,
    // DealActivity insert, dealContact reads). Insert without .single() resolves
    // to {error:null}.
    chain.then = (resolve: (v: unknown) => unknown) => {
      if (isInsert) return Promise.resolve({ data: null, error: null }).then(resolve);
      return Promise.resolve(arrayResult()).then(resolve);
    };
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { POST } from '@/app/api/deals/route';
import { PATCH } from '@/app/api/deals/[id]/route';
import { requireSpaceOwner, requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

const SPACE = { id: 'space_1', name: 'Acme' } as never;
const params = Promise.resolve({ id: 'deal_1' });

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/deals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function patchReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/deals/deal_1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  propertyOwned = true;
  dealUpdateValues = null;
  dealInsertValues = null;
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'user_1', space: SPACE });
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
  mockGetSpaceForUser.mockResolvedValue(SPACE);
});

describe('POST /api/deals — contactIds guard', () => {
  it('rejects a non-array contactIds with 400', async () => {
    const res = await POST(postReq({ slug: 'acme', title: 'D', stageId: 'stage_1', contactIds: 'not-an-array' }));
    expect(res.status).toBe(400);
    expect(dealInsertValues).toBeNull();
  });

  it('rejects more than 50 contactIds with 400', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `c${i}`);
    const res = await POST(postReq({ slug: 'acme', title: 'D', stageId: 'stage_1', contactIds: tooMany }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/max 50/i);
    expect(dealInsertValues).toBeNull();
  });

  it('accepts exactly 50 contactIds (boundary) and creates the deal', async () => {
    const atCap = Array.from({ length: 50 }, (_, i) => `c${i}`);
    const res = await POST(postReq({ slug: 'acme', title: 'D', stageId: 'stage_1', contactIds: atCap }));
    expect(res.status).toBe(201);
    expect(dealInsertValues).not.toBeNull();
  });
});

describe('PATCH /api/deals/[id] — position validate-and-ignore', () => {
  it('rejects a negative position with 400', async () => {
    const res = await PATCH(patchReq({ position: -1 }), { params });
    expect(res.status).toBe(400);
    expect(dealUpdateValues).toBeNull();
  });

  it('rejects a non-integer position with 400', async () => {
    const res = await PATCH(patchReq({ position: 2.5 }), { params });
    expect(res.status).toBe(400);
    expect(dealUpdateValues).toBeNull();
  });

  it('accepts a valid integer position but does NOT write it to the update', async () => {
    const res = await PATCH(patchReq({ position: 3, title: 'Renamed' }), { params });
    expect(res.status).toBe(200);
    expect(dealUpdateValues).not.toBeNull();
    // position is dropped — the reorder RPC owns it.
    expect(dealUpdateValues).not.toHaveProperty('position');
    // ...but the rest of the PATCH still applied.
    expect(dealUpdateValues!.title).toBe('Renamed');
  });
});

describe('PATCH /api/deals/[id] — propertyId ownership scoping', () => {
  it('rejects a propertyId not owned by this space with 404', async () => {
    propertyOwned = false;
    const res = await PATCH(patchReq({ propertyId: 'prop_other' }), { params });
    expect(res.status).toBe(404);
    expect(dealUpdateValues).toBeNull();
  });

  it('accepts a propertyId owned by this space and writes it', async () => {
    propertyOwned = true;
    const res = await PATCH(patchReq({ propertyId: 'prop_1' }), { params });
    expect(res.status).toBe(200);
    expect(dealUpdateValues).not.toBeNull();
    expect(dealUpdateValues!.propertyId).toBe('prop_1');
  });
});
