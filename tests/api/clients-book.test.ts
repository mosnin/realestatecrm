/**
 * Client-portal POST /api/clients/book — identity + engagement gates.
 *
 * The route is a thin proxy over public /api/tours/book. These tests lock the
 * portal-specific guarantees that the public book path does not enforce:
 *
 *   1. Unauthenticated / unverified sessions never reach booking.
 *   2. A client can only book with a realtor they already have an application
 *      or tour with. A foreign slug is 403 and does not call /api/tours/book.
 *   3. guestName / guestEmail / guestPhone are taken from the verified session.
 *      Attacker-supplied identity in the body is ignored.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { getClientUser, getClientPortalData, checkRateLimit } = vi.hoisted(() => ({
  getClientUser: vi.fn(),
  getClientPortalData: vi.fn(),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/client-auth', () => ({ getClientUser }));
vi.mock('@/lib/client-portal-data', () => ({ getClientPortalData }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { POST } from '@/app/api/clients/book/route';

const VERIFIED = {
  id: 'cu_1',
  email: 'buyer@example.com',
  emailLower: 'buyer@example.com',
  name: 'Bea Buyer',
  phone: '+15551212',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
};

function jsonReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/clients/book', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function engaged(slugs: { apps?: string[]; tours?: string[] } = { apps: ['jane'] }) {
  getClientPortalData.mockResolvedValue({
    applications: (slugs.apps ?? []).map((realtorSlug) => ({
      contactId: 'c_1',
      name: 'Bea',
      status: 'received',
      statusNote: null,
      applicationRef: 'ref_1',
      spaceId: 'sp_1',
      realtorName: 'Jane',
      realtorSlug,
      createdAt: '2026-01-01T00:00:00.000Z',
    })),
    tours: (slugs.tours ?? []).map((realtorSlug) => ({
      id: 't_1',
      propertyAddress: '1 Main',
      startsAt: '2026-09-01T17:00:00.000Z',
      status: 'scheduled',
      spaceId: 'sp_1',
      contactId: 'c_1',
      realtorName: 'Jane',
      realtorSlug,
    })),
    contactIds: ['c_1'],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true });
  getClientUser.mockResolvedValue(VERIFIED);
  engaged({ apps: ['jane'] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, tourId: 'tour_1' }), { status: 201 }),
    ),
  );
});

describe('POST /api/clients/book — auth + validation', () => {
  it('401s when there is no portal session and does not book', async () => {
    getClientUser.mockResolvedValue(null);
    const res = await POST(jsonReq({ slug: 'jane', startsAt: '2026-09-01T17:00:00.000Z' }));
    expect(res.status).toBe(401);
    expect(getClientPortalData).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('401s when the inbox is not verified and does not book', async () => {
    getClientUser.mockResolvedValue({ ...VERIFIED, emailVerifiedAt: null });
    const res = await POST(jsonReq({ slug: 'jane', startsAt: '2026-09-01T17:00:00.000Z' }));
    expect(res.status).toBe(401);
    expect(getClientPortalData).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('400s when slug or startsAt is missing and does not look up engagement', async () => {
    const missingSlug = await POST(jsonReq({ startsAt: '2026-09-01T17:00:00.000Z' }));
    expect(missingSlug.status).toBe(400);
    const missingStart = await POST(jsonReq({ slug: 'jane' }));
    expect(missingStart.status).toBe(400);
    expect(getClientPortalData).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('POST /api/clients/book — engagement + identity', () => {
  it('403s a realtor the client has never engaged with and does not call /api/tours/book', async () => {
    engaged({ apps: ['jane'], tours: [] });
    const res = await POST(
      jsonReq({
        slug: 'other-realtor',
        startsAt: '2026-09-01T17:00:00.000Z',
        guestEmail: 'attacker@evil.test',
      }),
    );
    expect(res.status).toBe(403);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets the client book via a prior tour slug even with no application', async () => {
    engaged({ apps: [], tours: ['pat'] });
    const res = await POST(jsonReq({ slug: 'pat', startsAt: '2026-09-01T17:00:00.000Z' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('429s after engagement is proven and does not book', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(jsonReq({ slug: 'jane', startsAt: '2026-09-01T17:00:00.000Z' }));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith('clients:book:cu_1', 5, 3600);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forces session identity onto /api/tours/book and ignores body spoofing', async () => {
    const res = await POST(
      jsonReq({
        slug: 'jane',
        startsAt: '2026-09-01T17:00:00.000Z',
        guestName: 'Not Bea',
        guestEmail: 'attacker@evil.test',
        guestPhone: '+19999999',
        propertyAddress: '7 Oak Ave',
        notes: 'Bring lockbox',
      }),
    );
    expect(res.status).toBe(201);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost/api/tours/book');
    expect(init.method).toBe('POST');
    const forwarded = JSON.parse(String(init.body));
    expect(forwarded).toEqual({
      slug: 'jane',
      guestName: 'Bea Buyer',
      guestEmail: 'buyer@example.com',
      guestPhone: '+15551212',
      propertyAddress: '7 Oak Ave',
      notes: 'Bring lockbox',
      startsAt: '2026-09-01T17:00:00.000Z',
    });
    expect(forwarded).not.toHaveProperty('guestEmail', 'attacker@evil.test');
  });

  it('uses the session email as guestName when the client has no name', async () => {
    getClientUser.mockResolvedValue({ ...VERIFIED, name: null, phone: null });
    const res = await POST(jsonReq({ slug: 'jane', startsAt: '2026-09-01T17:00:00.000Z' }));
    expect(res.status).toBe(201);
    const forwarded = JSON.parse(String((vi.mocked(fetch).mock.calls[0] as [string, RequestInit])[1].body));
    expect(forwarded.guestName).toBe('buyer@example.com');
    expect(forwarded.guestPhone).toBeUndefined();
  });

  it('forwards a downstream booking failure without claiming success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'That time is no longer available.' }), { status: 409 }),
      ),
    );
    const res = await POST(jsonReq({ slug: 'jane', startsAt: '2026-09-01T17:00:00.000Z' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'That time is no longer available.' });
  });
});
