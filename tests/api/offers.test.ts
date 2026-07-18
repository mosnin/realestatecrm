/**
 * Route-level tests for /api/offers, /api/offers/[id], and
 * /api/offers/[id]/transition.
 *
 * lib/offers.ts's actual scoped-query behavior is covered by
 * tests/lib/offers.test.ts; these tests instead verify the ROUTE layer:
 * auth gating, request validation, error-code mapping (404 not 403 on a
 * cross-tenant miss, 409 on an illegal transition), and that spaceId always
 * comes from the authenticated context (getSpaceForUser), never the body.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const {
  listOffersMock,
  createOfferMock,
  getOfferMock,
  updateOfferMock,
  deleteDraftOfferMock,
  listOfferEventsMock,
  transitionMock,
  IllegalOfferTransitionErrorMock,
} = vi.hoisted(() => {
  class IllegalOfferTransitionError extends Error {
    from: string;
    to: string;
    constructor(from: string, to: string) {
      super(`Illegal offer transition: ${from} -> ${to}`);
      this.name = 'IllegalOfferTransitionError';
      this.from = from;
      this.to = to;
    }
  }
  return {
    listOffersMock: vi.fn(),
    createOfferMock: vi.fn(),
    getOfferMock: vi.fn(),
    updateOfferMock: vi.fn(),
    deleteDraftOfferMock: vi.fn(),
    listOfferEventsMock: vi.fn(),
    transitionMock: vi.fn(),
    IllegalOfferTransitionErrorMock: IllegalOfferTransitionError,
  };
});

vi.mock('@/lib/offers', () => ({
  listOffers: listOffersMock,
  createOffer: createOfferMock,
  getOffer: getOfferMock,
  updateOffer: updateOfferMock,
  deleteDraftOffer: deleteDraftOfferMock,
  listOfferEvents: listOfferEventsMock,
  transition: transitionMock,
  IllegalOfferTransitionError: IllegalOfferTransitionErrorMock,
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
import {
  GET as itemGET,
  PATCH as itemPATCH,
  DELETE as itemDELETE,
} from '@/app/api/offers/[id]/route';
import { POST as transitionPOST } from '@/app/api/offers/[id]/transition/route';
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
    dealId: null,
    propertyAddress: '123 Elm St',
    buyerName: 'Dana Whitfield',
    amount: 450000,
    status: 'submitted',
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

// ── GET /api/offers ───────────────────────────────────────────────────────

describe('GET /api/offers', () => {
  it('returns the caller space offers', async () => {
    listOffersMock.mockResolvedValue([offerRow()]);
    const res = await listGET(jsonReq('http://localhost/api/offers', 'GET'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([offerRow()]);
    expect(listOffersMock).toHaveBeenCalledWith('space_1');
  });

  it('an unauthenticated caller gets requireAuth\'s response back verbatim', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as never,
    );
    const res = await listGET(jsonReq('http://localhost/api/offers', 'GET'));
    expect(res.status).toBe(401);
    expect(listOffersMock).not.toHaveBeenCalled();
  });

  it('a user with no space gets 404 before any offer read', async () => {
    mockGetSpaceForUser.mockResolvedValue(null as never);
    const res = await listGET(jsonReq('http://localhost/api/offers', 'GET'));
    expect(res.status).toBe(404);
    expect(listOffersMock).not.toHaveBeenCalled();
  });
});

// ── POST /api/offers ──────────────────────────────────────────────────────

describe('POST /api/offers', () => {
  it('creates an offer scoped to the caller space, ignoring any body spaceId', async () => {
    createOfferMock.mockResolvedValue(offerRow());
    const res = await createPOST(
      jsonReq('http://localhost/api/offers', 'POST', {
        buyerName: 'Dana Whitfield',
        amount: 450000,
        spaceId: 'space_evil', // must be ignored — space comes from context
      }),
    );
    expect(res.status).toBe(201);
    expect(createOfferMock).toHaveBeenCalledWith(
      'space_1',
      expect.objectContaining({ buyerName: 'Dana Whitfield', amount: 450000 }),
    );
  });

  it('rejects a missing buyerName with 400', async () => {
    const res = await createPOST(
      jsonReq('http://localhost/api/offers', 'POST', { amount: 1000 }),
    );
    expect(res.status).toBe(400);
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it('a user with no space gets 404 before any write', async () => {
    mockGetSpaceForUser.mockResolvedValue(null as never);
    const res = await createPOST(
      jsonReq('http://localhost/api/offers', 'POST', { buyerName: 'Dana' }),
    );
    expect(res.status).toBe(404);
    expect(createOfferMock).not.toHaveBeenCalled();
  });
});

// ── GET/PATCH/DELETE /api/offers/[id] ─────────────────────────────────────

describe('GET /api/offers/[id]', () => {
  it('returns the offer + its event history', async () => {
    getOfferMock.mockResolvedValue(offerRow());
    listOfferEventsMock.mockResolvedValue([
      { id: 'evt_1', offerId: 'offer_1', spaceId: 'space_1', fromStatus: null, toStatus: 'draft', note: null, at: '2026-07-01T00:00:00.000Z' },
    ]);
    const res = await itemGET(jsonReq('http://localhost/api/offers/offer_1', 'GET'), {
      params: Promise.resolve({ id: 'offer_1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.offer).toEqual(offerRow());
    expect(body.events).toHaveLength(1);
  });

  it("a cross-tenant offer id 404s, never 403", async () => {
    getOfferMock.mockResolvedValue(null);
    const res = await itemGET(jsonReq('http://localhost/api/offers/offer_other', 'GET'), {
      params: Promise.resolve({ id: 'offer_other' }),
    });
    expect(res.status).toBe(404);
    expect(listOfferEventsMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/offers/[id]', () => {
  it('updates allowed fields scoped to the caller space', async () => {
    updateOfferMock.mockResolvedValue(offerRow({ notes: 'Updated' }));
    const res = await itemPATCH(
      jsonReq('http://localhost/api/offers/offer_1', 'PATCH', { notes: 'Updated' }),
      { params: Promise.resolve({ id: 'offer_1' }) },
    );
    expect(res.status).toBe(200);
    expect(updateOfferMock).toHaveBeenCalledWith(
      'space_1',
      'offer_1',
      expect.objectContaining({ notes: 'Updated' }),
    );
  });

  it('a cross-tenant offer id 404s', async () => {
    updateOfferMock.mockResolvedValue(null);
    const res = await itemPATCH(
      jsonReq('http://localhost/api/offers/offer_other', 'PATCH', { notes: 'x' }),
      { params: Promise.resolve({ id: 'offer_other' }) },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/offers/[id]', () => {
  it('deletes a draft offer', async () => {
    getOfferMock.mockResolvedValue(offerRow({ status: 'draft' }));
    deleteDraftOfferMock.mockResolvedValue(true);
    const res = await itemDELETE(jsonReq('http://localhost/api/offers/offer_1', 'DELETE'), {
      params: Promise.resolve({ id: 'offer_1' }),
    });
    expect(res.status).toBe(200);
    expect(deleteDraftOfferMock).toHaveBeenCalledWith('space_1', 'offer_1');
  });

  it('refuses to delete a non-draft offer with 409', async () => {
    getOfferMock.mockResolvedValue(offerRow({ status: 'accepted' }));
    const res = await itemDELETE(jsonReq('http://localhost/api/offers/offer_1', 'DELETE'), {
      params: Promise.resolve({ id: 'offer_1' }),
    });
    expect(res.status).toBe(409);
    expect(deleteDraftOfferMock).not.toHaveBeenCalled();
  });

  it('a cross-tenant offer id 404s', async () => {
    getOfferMock.mockResolvedValue(null);
    const res = await itemDELETE(jsonReq('http://localhost/api/offers/offer_other', 'DELETE'), {
      params: Promise.resolve({ id: 'offer_other' }),
    });
    expect(res.status).toBe(404);
    expect(deleteDraftOfferMock).not.toHaveBeenCalled();
  });
});

// ── POST /api/offers/[id]/transition ──────────────────────────────────────

describe('POST /api/offers/[id]/transition', () => {
  it('transitions a legal move and returns the updated offer', async () => {
    transitionMock.mockResolvedValue(offerRow({ status: 'accepted' }));
    const res = await transitionPOST(
      jsonReq('http://localhost/api/offers/offer_1/transition', 'POST', { to: 'accepted' }),
      { params: Promise.resolve({ id: 'offer_1' }) },
    );
    expect(res.status).toBe(200);
    expect(transitionMock).toHaveBeenCalledWith('space_1', 'offer_1', 'accepted', null);
    expect((await res.json()).status).toBe('accepted');
  });

  it('an illegal transition surfaces as 409, not 500', async () => {
    transitionMock.mockRejectedValue(new IllegalOfferTransitionErrorMock('draft', 'accepted'));
    const res = await transitionPOST(
      jsonReq('http://localhost/api/offers/offer_1/transition', 'POST', { to: 'accepted' }),
      { params: Promise.resolve({ id: 'offer_1' }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.from).toBe('draft');
    expect(body.to).toBe('accepted');
  });

  it('a cross-tenant offer id 404s, never 403', async () => {
    transitionMock.mockResolvedValue(null);
    const res = await transitionPOST(
      jsonReq('http://localhost/api/offers/offer_other/transition', 'POST', { to: 'accepted' }),
      { params: Promise.resolve({ id: 'offer_other' }) },
    );
    expect(res.status).toBe(404);
  });

  it('rejects an invalid status value with 400', async () => {
    const res = await transitionPOST(
      jsonReq('http://localhost/api/offers/offer_1/transition', 'POST', { to: 'not_a_status' }),
      { params: Promise.resolve({ id: 'offer_1' }) },
    );
    expect(res.status).toBe(400);
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it('an unauthenticated caller never reaches transition()', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as never,
    );
    const res = await transitionPOST(
      jsonReq('http://localhost/api/offers/offer_1/transition', 'POST', { to: 'accepted' }),
      { params: Promise.resolve({ id: 'offer_1' }) },
    );
    expect(res.status).toBe(401);
    expect(transitionMock).not.toHaveBeenCalled();
  });
});
