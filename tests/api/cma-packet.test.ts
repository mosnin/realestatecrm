/**
 * Route-level tests for GET /api/cma/packet/[id] — the pre-listing packet
 * export.
 *
 *   - cross-tenant / missing report id → 404 (the .eq('spaceId', ...) IS the
 *     security boundary — asserted directly on the CmaReport query)
 *   - happy path → 200, text/html, renders the suggested range + comps table
 *   - honest UI: no persisted narrative → the seller-pitch section is
 *     omitted from the HTML entirely, never faked
 *   - a persisted narrative IS included when present
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── Supabase mock ────────────────────────────────────────────────────────────
let reportRow: Record<string, unknown> | null = null;
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chainCalls: Array<[string, unknown[]]> = [];
    supabaseCalls.push({ table, chain: chainCalls });
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        chainCalls.push([method, args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(() => {
      chainCalls.push(['maybeSingle', []]);
      return Promise.resolve({ data: table === 'CmaReport' ? reportRow : null, error: null });
    });
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { GET } from '@/app/api/cma/packet/[id]/route';
import { requireSpaceOwner } from '@/lib/api-auth';

const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);

const SPACE = { id: 'space_1', name: 'Acme Realty' };

function samplePayload(overrides: Record<string, unknown> = {}) {
  return {
    subject: {
      propertyId: null,
      address: '412 Elm St',
      city: 'Oakland',
      stateRegion: 'CA',
      beds: 3,
      baths: 2,
      squareFeet: 1450,
      propertyType: 'single_family',
      listPrice: 750000,
    },
    comps: [
      {
        id: 'comp-1',
        address: '410 Elm St',
        city: 'Oakland',
        beds: 3,
        baths: 2,
        squareFeet: 1400,
        price: 740000,
        priceBasis: 'sold',
        pricePerSqft: 528,
        listingStatus: 'sold',
        source: 'rentcast',
        distanceMiles: 0.2,
        daysOld: 30,
      },
    ],
    stats: {
      compCount: 1,
      pricedCount: 1,
      low: 740000,
      median: 740000,
      high: 740000,
      avgPricePerSqft: 528,
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

function getReq(id: string, slug: string | null) {
  const url = slug
    ? `http://localhost/api/cma/packet/${id}?slug=${encodeURIComponent(slug)}`
    : `http://localhost/api/cma/packet/${id}`;
  const req = new NextRequest(url);
  return GET(req, { params: Promise.resolve({ id }) });
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

describe('GET /api/cma/packet/[id] — validation', () => {
  it('400s when slug is missing', async () => {
    const res = await getReq('report_1', null);
    expect(res.status).toBe(400);
    expect(mockRequireSpaceOwner).not.toHaveBeenCalled();
  });
});

describe('GET /api/cma/packet/[id] — tenant scoping', () => {
  it('a report id outside the caller space resolves 404 — the CmaReport query is spaceId-scoped', async () => {
    reportRow = null; // simulates a cross-tenant id: the .eq(spaceId) excludes it

    const res = await getReq('report-other-tenant', 'acme');

    expect(res.status).toBe(404);

    const load = findCmaReportLoad();
    expect(load).toBeDefined();
    expect(load!.chain).toContainEqual(['eq', ['id', 'report-other-tenant']]);
    expect(load!.chain).toContainEqual(['eq', ['spaceId', SPACE.id]]);
  });
});

describe('GET /api/cma/packet/[id] — happy path', () => {
  it('renders the suggested range and comps table as text/html', async () => {
    reportRow = {
      id: 'report_1',
      spaceId: SPACE.id,
      subjectAddress: '412 Elm St',
      title: null,
      status: 'draft',
      payload: samplePayload(),
      narrative: null,
      narrativeUpdatedAt: null,
      createdAt: '2026-07-18T00:00:00.000Z',
    };

    const res = await getReq('report_1', 'acme');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(html).toContain('412 Elm St');
    expect(html).toContain('410 Elm St');
    // suggested range numbers show up formatted as currency
    expect(html).toContain('$720,000');
    expect(html).toContain('$760,000');
  });

  it('omits the seller-pitch section when no narrative has been persisted (honest UI)', async () => {
    reportRow = {
      id: 'report_1',
      spaceId: SPACE.id,
      subjectAddress: '412 Elm St',
      title: null,
      status: 'draft',
      payload: samplePayload(),
      narrative: null,
      narrativeUpdatedAt: null,
      createdAt: '2026-07-18T00:00:00.000Z',
    };

    const res = await getReq('report_1', 'acme');
    const html = await res.text();

    expect(html).not.toContain('Seller pitch');
  });

  it('includes the persisted narrative when present', async () => {
    reportRow = {
      id: 'report_1',
      spaceId: SPACE.id,
      subjectAddress: '412 Elm St',
      title: null,
      status: 'draft',
      payload: samplePayload(),
      narrative: 'A grounded three-paragraph pitch for the seller.',
      narrativeUpdatedAt: '2026-07-19T00:00:00.000Z',
      createdAt: '2026-07-18T00:00:00.000Z',
    };

    const res = await getReq('report_1', 'acme');
    const html = await res.text();

    expect(html).toContain('Seller pitch');
    expect(html).toContain('A grounded three-paragraph pitch for the seller.');
  });

  it('escapes narrative and address text to prevent HTML injection', async () => {
    reportRow = {
      id: 'report_1',
      spaceId: SPACE.id,
      subjectAddress: '412 Elm St',
      title: null,
      status: 'draft',
      payload: samplePayload({
        subject: { ...samplePayload().subject, address: '<script>alert(1)</script>' },
      }),
      narrative: '<img src=x onerror=alert(1)>',
      narrativeUpdatedAt: '2026-07-19T00:00:00.000Z',
      createdAt: '2026-07-18T00:00:00.000Z',
    };

    const res = await getReq('report_1', 'acme');
    const html = await res.text();

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
  });
});
