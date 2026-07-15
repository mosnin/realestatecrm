/**
 * Route-level behavioral tests for POST /api/public/home-value/[slug] — the
 * public seller lead-magnet.
 *
 * Contract under test (execute the handler with mocked supabase/cma/first-touch):
 *   - valid address → captures a SELLER Contact scoped to the slug-resolved
 *     spaceId, fires exactly one first touch, and returns the value range.
 *   - unknown slug → 404, nothing captured.
 *   - CMA with no defensible data → honest response (hasEstimate false, no
 *     fabricated number), lead still captured.
 *   - rate-limited → 429, no CMA call, no capture.
 *   - malformed address / missing email → 400.
 *
 * Mock style mirrors tests/api/apply-first-touch.test.ts: Supabase is a
 * per-table terminal queue; buildCma + fireFirstTouch are module mocks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { CmaPayload } from '@/lib/cma-types';

// ── Module mocks ─────────────────────────────────────────────────────────────
const { fireFirstTouchMock } = vi.hoisted(() => ({
  fireFirstTouchMock: vi.fn((_input: { spaceId: string; contactId: string }) =>
    Promise.resolve({ created: true, draftId: 'draft_1' }),
  ),
}));
vi.mock('@/lib/leads/first-touch', () => ({ fireFirstTouch: fireFirstTouchMock }));

const { buildCmaMock } = vi.hoisted(() => ({ buildCmaMock: vi.fn() }));
vi.mock('@/lib/cma', () => ({ buildCma: buildCmaMock }));

const { checkRateLimitMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

const { getSpaceFromSlugMock } = vi.hoisted(() => ({ getSpaceFromSlugMock: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceFromSlug: getSpaceFromSlugMock }));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── Supabase: per-table terminal queue (last call resolves to next entry) ─────
type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const inserts: Record<string, unknown[]> = {};
function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}
function insertsFor(table: string): unknown[] {
  if (!inserts[table]) inserts[table] = [];
  return inserts[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.insert = vi.fn((payload: unknown) => {
      insertsFor(table).push(payload);
      return chain;
    });
    const next = (): Terminal => q.shift() ?? { data: null, error: null };
    chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
    chain.single = vi.fn(() => Promise.resolve(next()));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/public/home-value/[slug]/route';

const SPACE = {
  id: 'space_1',
  slug: 'acme',
  name: 'Acme Realty',
  emoji: null,
  ownerId: 'user_1',
  brokerageId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  stripeSubscriptionStatus: 'active',
};

function cmaWithEstimate(): CmaPayload {
  return {
    subject: {
      propertyId: null,
      address: '123 Main St',
      city: null,
      stateRegion: null,
      beds: null,
      baths: null,
      squareFeet: null,
      propertyType: null,
      listPrice: null,
    },
    comps: [
      // three comps → real data
      { id: 'c1', address: 'a', city: null, beds: 3, baths: 2, squareFeet: 1500, price: 500000, priceBasis: 'sold', pricePerSqft: 333, listingStatus: 'sold', source: 'rentcast', distanceMiles: 0.2, daysOld: 30 },
      { id: 'c2', address: 'b', city: null, beds: 3, baths: 2, squareFeet: 1500, price: 520000, priceBasis: 'sold', pricePerSqft: 346, listingStatus: 'sold', source: 'rentcast', distanceMiles: 0.3, daysOld: 40 },
      { id: 'c3', address: 'c', city: null, beds: 3, baths: 2, squareFeet: 1500, price: 540000, priceBasis: 'sold', pricePerSqft: 360, listingStatus: 'sold', source: 'rentcast', distanceMiles: 0.4, daysOld: 50 },
    ],
    stats: {
      compCount: 3,
      pricedCount: 3,
      low: 500000,
      median: 520000,
      high: 540000,
      avgPricePerSqft: 346,
      suggestedLow: 505000,
      suggestedHigh: 545000,
      estimatedValue: 525000,
      basis: 'sold',
      insufficientData: false,
    },
    dataSource: 'rentcast',
    dataSourceReason: 'rentcast',
    generatedAt: '2026-07-15T00:00:00.000Z',
  };
}

function cmaNoData(): CmaPayload {
  return {
    subject: {
      propertyId: null,
      address: '123 Nowhere Rd',
      city: null,
      stateRegion: null,
      beds: null,
      baths: null,
      squareFeet: null,
      propertyType: null,
      listPrice: null,
    },
    comps: [],
    stats: {
      compCount: 0,
      pricedCount: 0,
      low: null,
      median: null,
      high: null,
      avgPricePerSqft: null,
      suggestedLow: null,
      suggestedHigh: null,
      estimatedValue: null,
      basis: 'none',
      insufficientData: true,
    },
    dataSource: 'crm',
    dataSourceReason: 'rentcast_no_match',
    generatedAt: '2026-07-15T00:00:00.000Z',
  };
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/public/home-value/acme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ slug: 'acme' }) };

const goodBody = {
  address: '123 Main St',
  city: 'Austin',
  stateRegion: 'TX',
  name: 'Jane Homeowner',
  email: 'jane@example.com',
  phone: '(555) 123-4567',
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  for (const k of Object.keys(inserts)) delete inserts[k];
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  getSpaceFromSlugMock.mockResolvedValue(SPACE);
  fireFirstTouchMock
    .mockReset()
    .mockImplementation(() => Promise.resolve({ created: true, draftId: 'draft_1' }));
});

describe('POST /api/public/home-value/[slug]', () => {
  it('valid address → captures a seller Contact scoped to the space, fires first touch, returns the range', async () => {
    buildCmaMock.mockResolvedValue(cmaWithEstimate());
    queueFor('Contact').push({ data: { id: 'contact_1' }, error: null });

    const res = await POST(makeReq(goodBody), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();

    // Real range surfaced, honestly labelled — no fabrication.
    expect(body.captured).toBe(true);
    expect(body.estimate.hasEstimate).toBe(true);
    expect(body.estimate.low).toBe(505000);
    expect(body.estimate.high).toBe(545000);
    expect(body.estimate.dataSourceLabel).toBe('RentCast market data');

    // buildCma was scoped to the slug-resolved space.
    expect(buildCmaMock).toHaveBeenCalledTimes(1);
    expect(buildCmaMock.mock.calls[0][0]).toMatchObject({ spaceId: 'space_1' });

    // Contact written with the correct tenant spaceId + seller intent + source.
    const contactInsert = insertsFor('Contact')[0] as Record<string, unknown>;
    expect(contactInsert.spaceId).toBe('space_1');
    expect(contactInsert.leadType).toBe('seller');
    expect(contactInsert.source).toBe('web_form');
    expect(contactInsert.sourceLabel).toBe('home_value_tool');
    expect(contactInsert.email).toBe('jane@example.com');

    // First touch fired once for the captured contact.
    expect(fireFirstTouchMock).toHaveBeenCalledTimes(1);
    expect(fireFirstTouchMock).toHaveBeenCalledWith({ spaceId: 'space_1', contactId: 'contact_1' });
  });

  it('unknown slug → 404, nothing captured, no CMA call', async () => {
    getSpaceFromSlugMock.mockResolvedValue(null);

    const res = await POST(makeReq(goodBody), ctx);
    expect(res.status).toBe(404);
    expect(buildCmaMock).not.toHaveBeenCalled();
    expect(insertsFor('Contact')).toHaveLength(0);
    expect(fireFirstTouchMock).not.toHaveBeenCalled();
  });

  it('no CMA data → honest response with no fabricated number, lead still captured', async () => {
    buildCmaMock.mockResolvedValue(cmaNoData());
    queueFor('Contact').push({ data: { id: 'contact_2' }, error: null });

    const res = await POST(makeReq(goodBody), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.estimate.hasEstimate).toBe(false);
    expect(body.estimate.low).toBeNull();
    expect(body.estimate.high).toBeNull();
    expect(body.estimate.estimatedValue).toBeNull();

    // Still a seller lead — captured + first touch fired.
    expect(insertsFor('Contact')[0]).toMatchObject({ spaceId: 'space_1', leadType: 'seller' });
    expect(fireFirstTouchMock).toHaveBeenCalledTimes(1);
  });

  it('rate-limited → 429, no CMA call, no capture', async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false });

    const res = await POST(makeReq(goodBody), ctx);
    expect(res.status).toBe(429);
    expect(buildCmaMock).not.toHaveBeenCalled();
    expect(insertsFor('Contact')).toHaveLength(0);
    expect(fireFirstTouchMock).not.toHaveBeenCalled();
  });

  it('malformed address → 400', async () => {
    const res = await POST(makeReq({ ...goodBody, address: 'x' }), ctx);
    expect(res.status).toBe(400);
    expect(buildCmaMock).not.toHaveBeenCalled();
  });

  it('missing email → 400', async () => {
    const { email: _omit, ...noEmail } = goodBody;
    const res = await POST(makeReq(noEmail), ctx);
    expect(res.status).toBe(400);
    expect(buildCmaMock).not.toHaveBeenCalled();
  });
});
