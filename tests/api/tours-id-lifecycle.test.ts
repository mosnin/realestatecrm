/**
 * Realtor PATCH cancel / reschedule and DELETE must propagate to calendar
 * (both systems) and, for cancel/reschedule, notify the guest. PATCH of a
 * new window must refuse an overlapping slot.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  tour: {
    id: 't_1',
    spaceId: 's_1',
    status: 'scheduled',
    startsAt: '2026-07-15T18:00:00.000Z',
    endsAt: '2026-07-15T18:30:00.000Z',
    guestName: 'Sam',
    guestEmail: 'sam@example.com',
    guestPhone: null,
    propertyAddress: null,
    googleEventId: 'gcal_1',
    contactId: null,
  } as Record<string, unknown>,
  conflicts: vi.fn(async (_input?: unknown) => false),
  drop: vi.fn(async (_input?: unknown) => undefined),
  move: vi.fn(async (_input?: unknown) => undefined),
  notifyCancelled: vi.fn(async (_input?: unknown) => undefined),
  notifyRescheduled: vi.fn(async (_input?: unknown) => undefined),
  after: vi.fn((fn: () => unknown) => {
    void fn();
  }),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: h.after };
});

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'u_1' })),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => ({ id: 's_1', slug: 'jane', name: 'Jane' })),
}));

vi.mock('@/lib/tours/conflicts', () => ({
  tourWindowConflicts: (input: unknown) => h.conflicts(input),
}));

vi.mock('@/lib/tours/calendar-propagate', () => ({
  dropTourCalendarArtifacts: (input: unknown) => h.drop(input),
  moveTourCalendarArtifacts: (input: unknown) => h.move(input),
}));

vi.mock('@/lib/tour-notify', () => ({
  notifyTourCancelled: (input: unknown) => h.notifyCancelled(input),
  notifyTourRescheduled: (input: unknown) => h.notifyRescheduled(input),
}));

vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    update: self,
    delete: self,
    eq: self,
    maybeSingle: () => Promise.resolve({ data: h.tour, error: null }),
    single: () => Promise.resolve({ data: { ...h.tour, ...((chain as { _upd?: Record<string, unknown> })._upd ?? {}) }, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve, reject),
  });
  const origUpdate = chain.update;
  chain.update = (values: Record<string, unknown>) => {
    (chain as { _upd?: Record<string, unknown> })._upd = values;
    return (origUpdate as (v: Record<string, unknown>) => unknown)(values);
  };
  return { supabase: { from: vi.fn(() => chain) } };
});

import { PATCH, DELETE } from '@/app/api/tours/[id]/route';

function patchReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tours/t_1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 't_1' });

beforeEach(() => {
  vi.clearAllMocks();
  h.conflicts.mockResolvedValue(false);
  h.tour = {
    id: 't_1',
    spaceId: 's_1',
    status: 'scheduled',
    startsAt: '2026-07-15T18:00:00.000Z',
    endsAt: '2026-07-15T18:30:00.000Z',
    guestName: 'Sam',
    guestEmail: 'sam@example.com',
    guestPhone: null,
    propertyAddress: null,
    googleEventId: 'gcal_1',
    contactId: null,
  };
});

describe('PATCH /api/tours/[id] lifecycle', () => {
  it('on cancel: drops calendar artifacts and notifies the guest', async () => {
    const res = await PATCH(patchReq({ status: 'cancelled' }), { params });
    expect(res.status).toBe(200);
    expect(h.drop).toHaveBeenCalledWith({
      spaceId: 's_1',
      tourId: 't_1',
      googleEventId: 'gcal_1',
    });
    expect(h.notifyCancelled).toHaveBeenCalledTimes(1);
    expect(h.move).not.toHaveBeenCalled();
  });

  it('on reschedule: refuses an overlapping window and does not move/notify', async () => {
    h.conflicts.mockResolvedValue(true);
    const res = await PATCH(
      patchReq({ startsAt: '2026-07-16T18:00:00.000Z', endsAt: '2026-07-16T18:30:00.000Z' }),
      { params },
    );
    expect(res.status).toBe(409);
    expect(h.move).not.toHaveBeenCalled();
    expect(h.notifyRescheduled).not.toHaveBeenCalled();
  });

  it('on reschedule: moves the calendar event and notifies the guest', async () => {
    const res = await PATCH(
      patchReq({ startsAt: '2026-07-16T18:00:00.000Z', endsAt: '2026-07-16T18:30:00.000Z' }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(h.conflicts).toHaveBeenCalledWith({
      spaceId: 's_1',
      startsAt: '2026-07-16T18:00:00.000Z',
      endsAt: '2026-07-16T18:30:00.000Z',
      excludeTourId: 't_1',
    });
    expect(h.move).toHaveBeenCalledTimes(1);
    expect(h.notifyRescheduled).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/tours/[id]', () => {
  it('drops both calendar systems after the row is gone', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/tours/t_1'), { params });
    expect(res.status).toBe(200);
    expect(h.drop).toHaveBeenCalledWith({
      spaceId: 's_1',
      tourId: 't_1',
      googleEventId: 'gcal_1',
    });
  });
});
