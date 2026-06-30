/**
 * Route-level test for `POST /api/deals` — closedAt stamping on initial create.
 *
 * Regression guard for the bug where a Deal CREATED directly in a terminal
 * status (status='won'|'lost') never got a `closedAt`, so
 * lib/deal-metrics.ts avgTimeToCloseDays silently dropped it. The PATCH path
 * already stamped closedAt on transition; the POST path did not (it didn't
 * even read `status`). This verifies POST now:
 *   - defaults status to 'active' and leaves closedAt unset
 *   - sets status when provided
 *   - stamps closedAt when created as 'won' or 'lost' (mirrors PATCH)
 *   - rejects an invalid status with 400
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// next/server's `after()` requires a real request scope and throws in Vitest.
// Override it with a no-op so the route can reach its 201 response.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn() };
});
vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(),
}));
vi.mock('@/lib/vectorize', () => ({
  syncDeal: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/notify', () => ({
  notifyNewDeal: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ allowed: true })),
}));
vi.mock('@/lib/agent/ts-idempotency', () => ({
  makeIdempotencyKey: vi.fn((...args: unknown[]) => args.join(':')),
  withIdempotency: vi.fn((_key: string, fn: () => Promise<unknown>) => fn()),
}));
vi.mock('@/lib/workflows/executor', () => ({
  runWorkflowsForEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ── Supabase mock — records the Deal insert payload for assertion ───────────
// The POST flow (with no contactIds) issues, in order:
//   1. DealStage stageCheck  → maybeSingle
//   2. Deal last-position    → order().limit() (awaited array)
//   3. Deal insert           → insert().select().single()
//   4. DealStage include     → select().eq().single()
let lastInsertValues: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    let isInsert = false;
    let insertValues: Record<string, unknown> | null = null;

    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.insert = vi.fn((values: Record<string, unknown>) => {
      isInsert = true;
      insertValues = values;
      if (table === 'Deal') lastInsertValues = values;
      return chain;
    });
    // last-position query: `.order(...).limit(1)` is awaited directly.
    chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    chain.maybeSingle = vi.fn(() => {
      if (table === 'DealStage') {
        // stageCheck: a valid stage in this space, no pipeline auto-routing.
        return Promise.resolve({ data: { id: 'stage_1', pipelineType: null }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    chain.single = vi.fn(() => {
      if (table === 'Deal' && isInsert) {
        // Echo the inserted row back (id + the values we recorded).
        return Promise.resolve({ data: { id: 'deal_1', ...(insertValues ?? {}) }, error: null });
      }
      if (table === 'DealStage') {
        return Promise.resolve({ data: { id: 'stage_1', name: 'New' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/deals/route';
import { requireSpaceOwner } from '@/lib/api-auth';

const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/deals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SPACE = { id: 'space_1', name: 'Acme' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  lastInsertValues = null;
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'user_1', space: SPACE });
});

describe('POST /api/deals — status + closedAt on create', () => {
  it('defaults to active with no closedAt when status is omitted', async () => {
    const res = await POST(makeReq({ slug: 'acme', title: 'Deal A', stageId: 'stage_1' }));
    expect(res.status).toBe(201);
    expect(lastInsertValues).not.toBeNull();
    expect(lastInsertValues!.status).toBe('active');
    expect(lastInsertValues!.closedAt).toBeUndefined();
  });

  it('stamps closedAt when created with status=won', async () => {
    const res = await POST(makeReq({ slug: 'acme', title: 'Won Deal', stageId: 'stage_1', status: 'won' }));
    expect(res.status).toBe(201);
    expect(lastInsertValues!.status).toBe('won');
    expect(typeof lastInsertValues!.closedAt).toBe('string');
    // closedAt should equal stageChangedAt (both stamped from the same nowIso).
    expect(lastInsertValues!.closedAt).toBe(lastInsertValues!.stageChangedAt);
  });

  it('stamps closedAt when created with status=lost', async () => {
    const res = await POST(makeReq({ slug: 'acme', title: 'Lost Deal', stageId: 'stage_1', status: 'lost' }));
    expect(res.status).toBe(201);
    expect(lastInsertValues!.status).toBe('lost');
    expect(typeof lastInsertValues!.closedAt).toBe('string');
  });

  it('does NOT stamp closedAt for a non-terminal status (on_hold)', async () => {
    const res = await POST(makeReq({ slug: 'acme', title: 'Held Deal', stageId: 'stage_1', status: 'on_hold' }));
    expect(res.status).toBe(201);
    expect(lastInsertValues!.status).toBe('on_hold');
    expect(lastInsertValues!.closedAt).toBeUndefined();
  });

  it('rejects an invalid status with 400', async () => {
    const res = await POST(makeReq({ slug: 'acme', title: 'Bad', stageId: 'stage_1', status: 'archived' }));
    expect(res.status).toBe(400);
    expect(lastInsertValues).toBeNull();
  });
});
