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
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: async () => ({ data: h.updated, error: h.updateError }),
            }),
          }),
        }),
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
});
