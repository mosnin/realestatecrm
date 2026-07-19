/**
 * Route-level tests for the deal-linking additions to /api/offers
 * (Track 18 — deal detail page Offers section):
 *
 *   - GET /api/offers?dealId=... delegates to listOffersForDeal, scoped to
 *     the AUTHENTICATED caller's space (never a space id from the query
 *     string) — so a dealId belonging to another tenant can never surface
 *     that tenant's offers.
 *   - GET /api/offers without dealId still uses the unscoped-by-deal
 *     listOffers (regression guard against the new branch swallowing the
 *     default path).
 *   - POST /api/offers with a dealId in the body ("New offer on this deal")
 *     passes it straight through to createOffer, scoped to the caller's
 *     own space.
 *
 * lib/offers.ts's actual scoped-query behavior (the .eq('spaceId')/
 * .eq('dealId') chain) is covered by tests/lib/offers-deal.test.ts; these
 * tests verify the ROUTE layer wiring only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { listOffersMock, listOffersForDealMock, createOfferMock } = vi.hoisted(() => ({
  listOffersMock: vi.fn(),
  listOffersForDealMock: vi.fn(),
  createOfferMock: vi.fn(),
}));

vi.mock('@/lib/offers', () => ({
  listOffers: listOffersMock,
  listOffersForDeal: listOffersForDealMock,
  createOffer: createOfferMock,
  OFFER_STATUSES: [
    'draft',
    'submitted',
    'countered',
    'accepted',
    'rejected',
    'withdrawn',
    'expired',
  ],
}));

import { GET as listGET, POST as createPOST } from '@/app/api/offers/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

const SPACE = { id: 'space_1', slug: 'acme' } as never;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function offerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer_1',
    spaceId: 'space_1',
    dealId: 'deal_1',
    propertyAddress: '123 Elm St',
    buyerName: 'Dana Whitfield',
    amount: 450000,
    status: 'draft',
    expiresAt: null,
    terms: {},
    notes: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' } as never);
  mockGetSpaceForUser.mockResolvedValue(SPACE);
});

// ── GET /api/offers?dealId=... ──────────────────────────────────────────

describe('GET /api/offers?dealId=...', () => {
  it('deal-scoped offer list is spaceId + dealId scoped', async () => {
    listOffersForDealMock.mockResolvedValue([offerRow()]);
    const res = await listGET(jsonReq('http://localhost/api/offers?dealId=deal_1', 'GET'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([offerRow()]);
    // spaceId comes from the AUTHENTICATED context (getSpaceForUser), never
    // from the query string — the route can't be tricked into reading
    // another tenant's offers by passing someone else's dealId.
    expect(listOffersForDealMock).toHaveBeenCalledWith('space_1', 'deal_1');
    expect(listOffersMock).not.toHaveBeenCalled();
  });

  it('a dealId belonging to another tenant resolves to whatever listOffersForDeal returns for the caller\'s own space (empty, never a leak)', async () => {
    // listOffersForDeal itself enforces the spaceId scope (see
    // tests/lib/offers-deal.test.ts); at the route layer we assert the
    // route always passes the CALLER's space, so even a cross-tenant
    // dealId can only ever be looked up within the caller's own space.
    listOffersForDealMock.mockResolvedValue([]);
    const res = await listGET(
      jsonReq('http://localhost/api/offers?dealId=deal-in-another-space', 'GET'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(listOffersForDealMock).toHaveBeenCalledWith('space_1', 'deal-in-another-space');
  });

  it('without a dealId, falls back to the unfiltered space-wide list', async () => {
    listOffersMock.mockResolvedValue([offerRow({ dealId: null })]);
    const res = await listGET(jsonReq('http://localhost/api/offers', 'GET'));
    expect(res.status).toBe(200);
    expect(listOffersMock).toHaveBeenCalledWith('space_1');
    expect(listOffersForDealMock).not.toHaveBeenCalled();
  });

  it('a user with no space gets 404 before any deal-scoped read', async () => {
    mockGetSpaceForUser.mockResolvedValue(null as never);
    const res = await listGET(jsonReq('http://localhost/api/offers?dealId=deal_1', 'GET'));
    expect(res.status).toBe(404);
    expect(listOffersForDealMock).not.toHaveBeenCalled();
  });

  it('an unauthenticated caller never reaches listOffersForDeal', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as never,
    );
    const res = await listGET(jsonReq('http://localhost/api/offers?dealId=deal_1', 'GET'));
    expect(res.status).toBe(401);
    expect(listOffersForDealMock).not.toHaveBeenCalled();
  });
});

// ── POST /api/offers — create-from-deal ─────────────────────────────────

describe('POST /api/offers ("New offer on this deal")', () => {
  it('a dealId in the body is passed through to createOffer, scoped to the caller space', async () => {
    createOfferMock.mockResolvedValue(offerRow());
    const res = await createPOST(
      jsonReq('http://localhost/api/offers', 'POST', {
        dealId: 'deal_1',
        buyerName: 'Dana Whitfield',
        amount: 450000,
      }),
    );
    expect(res.status).toBe(201);
    expect(createOfferMock).toHaveBeenCalledWith(
      'space_1',
      expect.objectContaining({ dealId: 'deal_1', buyerName: 'Dana Whitfield', amount: 450000 }),
    );
  });

  it('omitting dealId still creates an unlinked offer (dealId null)', async () => {
    createOfferMock.mockResolvedValue(offerRow({ dealId: null }));
    const res = await createPOST(
      jsonReq('http://localhost/api/offers', 'POST', { buyerName: 'Dana Whitfield' }),
    );
    expect(res.status).toBe(201);
    expect(createOfferMock).toHaveBeenCalledWith(
      'space_1',
      expect.objectContaining({ dealId: null }),
    );
  });

  it('cross-tenant blocked: spaceId always comes from the authenticated context, never the body', async () => {
    createOfferMock.mockResolvedValue(offerRow());
    await createPOST(
      jsonReq('http://localhost/api/offers', 'POST', {
        dealId: 'deal_1',
        buyerName: 'Dana Whitfield',
        spaceId: 'space_evil', // must be ignored — space comes from auth context
      }),
    );
    expect(createOfferMock).toHaveBeenCalledWith(
      'space_1',
      expect.objectContaining({ dealId: 'deal_1' }),
    );
    expect(createOfferMock).not.toHaveBeenCalledWith(
      'space_evil',
      expect.anything(),
    );
  });

  it('a user with no space gets 404 before any write', async () => {
    mockGetSpaceForUser.mockResolvedValue(null as never);
    const res = await createPOST(
      jsonReq('http://localhost/api/offers', 'POST', { dealId: 'deal_1', buyerName: 'Dana' }),
    );
    expect(res.status).toBe(404);
    expect(createOfferMock).not.toHaveBeenCalled();
  });
});
