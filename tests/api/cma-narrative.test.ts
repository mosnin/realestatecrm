/**
 * Route-level tests for POST /api/cma/narrative.
 *
 *   - cross-tenant report id resolves to no row → 404 (the .eq('spaceId', ...)
 *     is the security boundary; asserted directly on the CmaReport query)
 *   - insufficient-data payload → { narrative: null, reason: 'insufficient_data' },
 *     no LLM call
 *   - happy path with a mocked composeCmaNarrative → { narrative }
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const composeCmaNarrativeMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/cma-narrative', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cma-narrative')>();
  return {
    ...actual,
    composeCmaNarrative: composeCmaNarrativeMock,
  };
});

// ── Supabase mock ────────────────────────────────────────────────────────────
let reportRow: { id: string; spaceId: string; payload: unknown } | null = null;
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    supabaseCalls.push({ table, chain: calls });
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(() => {
      calls.push(['maybeSingle', []]);
      return Promise.resolve({ data: reportRow, error: null });
    });
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { POST } from '@/app/api/cma/narrative/route';
import { requireSpaceOwner } from '@/lib/api-auth';
import { CmaNarrativeError } from '@/lib/cma-narrative';

const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);

const SPACE = { id: 'space_1', name: 'Acme Realty' };

function samplePayload(overrides: Record<string, unknown> = {}) {
  return {
    subject: { address: '412 Elm St', city: 'Oakland' },
    comps: [],
    stats: {
      compCount: 4,
      pricedCount: 4,
      low: 700000,
      median: 740000,
      high: 780000,
      avgPricePerSqft: 520,
      suggestedLow: 720000,
      suggestedHigh: 760000,
      estimatedValue: 745000,
      basis: 'sold',
      insufficientData: false,
    },
    dataSource: 'rentcast',
    generatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  };
}

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/cma/narrative', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function findCmaReportLoad() {
  return supabaseCalls.find((c) => c.table === 'CmaReport');
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseCalls.length = 0;
  reportRow = null;
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'user_1', space: SPACE as never });
});

describe('POST /api/cma/narrative — tenant scoping', () => {
  it('a report id outside the caller space resolves 404 — the CmaReport query is spaceId-scoped', async () => {
    reportRow = null; // simulates a cross-tenant id: the .eq(spaceId) excludes it

    const res = await POST(postReq({ slug: 'acme', id: 'report-other-tenant' }));

    expect(res.status).toBe(404);
    expect(composeCmaNarrativeMock).not.toHaveBeenCalled();

    const load = findCmaReportLoad();
    expect(load).toBeDefined();
    expect(load!.chain).toContainEqual(['eq', ['id', 'report-other-tenant']]);
    expect(load!.chain).toContainEqual(['eq', ['spaceId', SPACE.id]]);
  });
});

describe('POST /api/cma/narrative — insufficient data', () => {
  it('returns narrative: null with no LLM call when the report has too little data', async () => {
    reportRow = { id: 'report_1', spaceId: SPACE.id, payload: samplePayload({ stats: { ...samplePayload().stats, insufficientData: true } }) };
    composeCmaNarrativeMock.mockResolvedValue(null);

    const res = await POST(postReq({ slug: 'acme', id: 'report_1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ narrative: null, reason: 'insufficient_data' });
    expect(composeCmaNarrativeMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/cma/narrative — happy path', () => {
  it('returns the generated narrative for an in-tenant report', async () => {
    reportRow = { id: 'report_1', spaceId: SPACE.id, payload: samplePayload() };
    composeCmaNarrativeMock.mockResolvedValue('A grounded three-paragraph pitch.');

    const res = await POST(postReq({ slug: 'acme', id: 'report_1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ narrative: 'A grounded three-paragraph pitch.' });
    expect(composeCmaNarrativeMock).toHaveBeenCalledWith(
      samplePayload(),
      expect.objectContaining({ spaceId: SPACE.id, brandName: SPACE.name }),
    );
  });

  it('surfaces a 502 when composeCmaNarrative throws CmaNarrativeError', async () => {
    reportRow = { id: 'report_1', spaceId: SPACE.id, payload: samplePayload() };
    composeCmaNarrativeMock.mockRejectedValue(new CmaNarrativeError('provider down'));

    const res = await POST(postReq({ slug: 'acme', id: 'report_1' }));
    expect(res.status).toBe(502);
  });
});

describe('POST /api/cma/narrative — validation', () => {
  it('400s when id is missing', async () => {
    const res = await POST(postReq({ slug: 'acme' }));
    expect(res.status).toBe(400);
    expect(mockRequireSpaceOwner).not.toHaveBeenCalled();
  });
});
