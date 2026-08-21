/**
 * Guest manage-token cancel must drop calendar artifacts AND tell the realtor.
 * The old handler only flipped Tour.status — ghost GCal slots + silent cancel.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  tour: null as Record<string, unknown> | null,
  updateError: null as { message: string } | null,
  drop: vi.fn(async () => undefined),
  notifyOwner: vi.fn(async () => undefined),
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
  dropTourCalendarArtifacts: (...a: unknown[]) => h.drop(...a),
}));

vi.mock('@/lib/notify', () => ({
  notifyTourCancelledOwner: (...a: unknown[]) => h.notifyOwner(...a),
}));

vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    update: self,
    eq: self,
    maybeSingle: () => Promise.resolve({ data: h.tour, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: h.updateError }).then(resolve, reject),
  });
  return { supabase: { from: vi.fn(() => chain) } };
});

import { POST } from '@/app/api/tours/manage/route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tours/manage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.updateError = null;
  h.tour = {
    id: 't_1',
    spaceId: 's_1',
    status: 'scheduled',
    startsAt: '2026-12-01T18:00:00.000Z',
    endsAt: '2026-12-01T18:30:00.000Z',
    guestName: 'Sam Lee',
    guestEmail: 'sam@example.com',
    guestPhone: null,
    propertyAddress: '1 Main',
    googleEventId: 'gcal_1',
  };
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T00:00:00.000Z'));
});

describe('POST /api/tours/manage cancel', () => {
  it('cancels, drops both calendar systems, and notifies the realtor', async () => {
    const res = await POST(makeReq({ token: 'tok', action: 'cancel' }));
    expect(res.status).toBe(200);
    expect(h.drop).toHaveBeenCalledTimes(1);
    expect(h.drop.mock.calls[0][0]).toMatchObject({
      spaceId: 's_1',
      tourId: 't_1',
      googleEventId: 'gcal_1',
    });
    expect(h.notifyOwner).toHaveBeenCalledTimes(1);
    expect(h.notifyOwner.mock.calls[0][0]).toMatchObject({
      spaceId: 's_1',
      tourData: expect.objectContaining({ guestName: 'Sam Lee', tourId: 't_1' }),
    });
  });

  it('does not drop calendar or notify when already cancelled', async () => {
    h.tour = { ...h.tour!, status: 'cancelled' };
    const res = await POST(makeReq({ token: 'tok', action: 'cancel' }));
    expect(res.status).toBe(400);
    expect(h.drop).not.toHaveBeenCalled();
    expect(h.notifyOwner).not.toHaveBeenCalled();
  });
});
