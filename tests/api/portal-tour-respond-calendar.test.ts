/**
 * Applicant portal decline must drop both calendar systems after the
 * Tour row is cancelled. Guest manage-token cancel already did this;
 * this path only flipped status + wrote an ApplicationMessage, which
 * left a live calendar slot.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  contact: {
    id: 'c_1',
    spaceId: 's_1',
    name: 'Pat',
  } as Record<string, unknown> | null,
  tour: {
    id: 't_1',
    spaceId: 's_1',
    contactId: 'c_1',
    status: 'scheduled',
    startsAt: '2026-12-01T18:00:00.000Z',
    propertyAddress: '1 Main',
    googleEventId: 'gcal_1',
  } as Record<string, unknown> | null,
  updated: [{ id: 't_1' }] as Array<{ id: string }>,
  updateError: null as { message: string } | null,
  fromTables: [] as string[],
  tourUpdates: [] as unknown[],
  drop: vi.fn(async (_input?: unknown) => undefined),
  insert: vi.fn(async (_input?: unknown) => ({ data: null, error: null })),
  after: vi.fn((fn: () => unknown) => {
    void fn();
  }),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: h.after };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/tours/calendar-propagate', () => ({
  dropTourCalendarArtifacts: (input: unknown) => h.drop(input),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantTable: (_client: unknown, table: string) => {
    if (table === 'Tour') {
      return {
        update: (values: unknown) => {
          h.tourUpdates.push(values);
          return {
            eq: () => ({
              eq: () => ({
                select: async () => ({ data: h.updated, error: h.updateError }),
              }),
            }),
          };
        },
      };
    }
    if (table === 'ApplicationMessage') {
      return {
        insert: (values: unknown) => h.insert(values),
      };
    }
    throw new Error(`unexpected tenantTable ${table}`);
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      h.fromTables.push(table);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self,
        eq: self,
        maybeSingle: () =>
          Promise.resolve({
            data: table === 'Contact' ? h.contact : table === 'Tour' ? h.tour : null,
            error: null,
          }),
      });
      return chain;
    },
  },
}));

import { POST } from '@/app/api/applications/portal/tour/[tourId]/respond/route';
import { checkRateLimit } from '@/lib/rate-limit';

const mockCheckRateLimit = vi.mocked(checkRateLimit);

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/applications/portal/tour/t_1/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  applicationRef: 'appref_1234567890',
  token: 'tok_abcdefghijklmnopqrstuvwxyz012345',
  action: 'decline' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.fromTables.length = 0;
  h.tourUpdates.length = 0;
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  h.contact = { id: 'c_1', spaceId: 's_1', name: 'Pat' };
  h.tour = {
    id: 't_1',
    spaceId: 's_1',
    contactId: 'c_1',
    status: 'scheduled',
    startsAt: '2026-12-01T18:00:00.000Z',
    propertyAddress: '1 Main',
    googleEventId: 'gcal_1',
  };
  h.updated = [{ id: 't_1' }];
  h.updateError = null;
});

describe('POST /api/applications/portal/tour/[tourId]/respond', () => {
  it('drops calendar artifacts when the applicant declines', async () => {
    const res = await POST(makeReq(validBody), { params: Promise.resolve({ tourId: 't_1' }) });
    expect(res.status).toBe(200);
    expect(h.drop).toHaveBeenCalledTimes(1);
    expect(h.drop).toHaveBeenCalledWith({
      spaceId: 's_1',
      tourId: 't_1',
      googleEventId: 'gcal_1',
    });
  });

  it('does not drop calendar when the applicant confirms', async () => {
    const res = await POST(makeReq({ ...validBody, action: 'confirm' }), {
      params: Promise.resolve({ tourId: 't_1' }),
    });
    expect(res.status).toBe(200);
    expect(h.drop).not.toHaveBeenCalled();
  });

  it('does not drop calendar on an already-cancelled idempotent decline', async () => {
    h.tour = { ...h.tour!, status: 'cancelled' };
    const res = await POST(makeReq(validBody), { params: Promise.resolve({ tourId: 't_1' }) });
    expect(res.status).toBe(200);
    expect(h.drop).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('does not drop calendar when a concurrent writer won the CAS', async () => {
    h.updated = [];
    const res = await POST(makeReq(validBody), { params: Promise.resolve({ tourId: 't_1' }) });
    expect(res.status).toBe(200);
    expect(h.drop).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('rejects missing token fields before any lookup', async () => {
    const res = await POST(makeReq({ action: 'confirm' }), {
      params: Promise.resolve({ tourId: 't_1' }),
    });
    expect(res.status).toBe(400);
    expect(h.fromTables).toEqual([]);
    expect(h.tourUpdates).toHaveLength(0);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('rejects an unknown action before lookup', async () => {
    const res = await POST(makeReq({ ...validBody, action: 'maybe' }), {
      params: Promise.resolve({ tourId: 't_1' }),
    });
    expect(res.status).toBe(400);
    expect(h.fromTables).toEqual([]);
    expect(h.tourUpdates).toHaveLength(0);
  });

  it('404s a short token without contacting Contact or Tour', async () => {
    const res = await POST(makeReq({ ...validBody, token: 'too-short' }), {
      params: Promise.resolve({ tourId: 't_1' }),
    });
    expect(res.status).toBe(404);
    expect(h.fromTables).toEqual([]);
    expect(h.tourUpdates).toHaveLength(0);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('404s a short applicationRef without lookup', async () => {
    const res = await POST(makeReq({ ...validBody, applicationRef: 'short' }), {
      params: Promise.resolve({ tourId: 't_1' }),
    });
    expect(res.status).toBe(404);
    expect(h.fromTables).toEqual([]);
  });

  it('rate-limits before Contact lookup', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(makeReq(validBody), { params: Promise.resolve({ tourId: 't_1' }) });
    expect(res.status).toBe(429);
    expect(h.fromTables).toEqual([]);
    expect(h.tourUpdates).toHaveLength(0);
  });

  it('404s a wrong token and does not update the tour', async () => {
    h.contact = null;
    const res = await POST(makeReq(validBody), { params: Promise.resolve({ tourId: 't_1' }) });
    expect(res.status).toBe(404);
    expect(h.fromTables).toEqual(['Contact']);
    expect(h.tourUpdates).toHaveLength(0);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('404s a tour that belongs to a different contact', async () => {
    h.tour = { ...h.tour!, contactId: 'c_other' };
    const res = await POST(makeReq(validBody), { params: Promise.resolve({ tourId: 't_1' }) });
    expect(res.status).toBe(404);
    expect(h.tourUpdates).toHaveLength(0);
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.drop).not.toHaveBeenCalled();
  });

  it('404s a tour in a different space even if contactId matches', async () => {
    h.tour = { ...h.tour!, spaceId: 's_other' };
    const res = await POST(makeReq(validBody), { params: Promise.resolve({ tourId: 't_1' }) });
    expect(res.status).toBe(404);
    expect(h.tourUpdates).toHaveLength(0);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('409s confirm on a completed tour without writing', async () => {
    h.tour = { ...h.tour!, status: 'completed' };
    const res = await POST(makeReq({ ...validBody, action: 'confirm' }), {
      params: Promise.resolve({ tourId: 't_1' }),
    });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'This tour is closed and can no longer be changed.',
    });
    expect(h.tourUpdates).toHaveLength(0);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('409s confirm on a cancelled tour without writing', async () => {
    h.tour = { ...h.tour!, status: 'cancelled' };
    const res = await POST(makeReq({ ...validBody, action: 'confirm' }), {
      params: Promise.resolve({ tourId: 't_1' }),
    });
    expect(res.status).toBe(409);
    expect(h.tourUpdates).toHaveLength(0);
    expect(h.insert).not.toHaveBeenCalled();
  });
});
