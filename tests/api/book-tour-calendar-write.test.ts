/**
 * Public POST /api/tours/book must write the realtor's calendar when one
 * is connected, and must not confirm a tour that never landed there.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mirrorMock, rollbackMock, sendTourConfirmationMock, notifyNewTourMock, advanceMock } = vi.hoisted(() => ({
  mirrorMock: vi.fn(),
  rollbackMock: vi.fn(async () => undefined),
  sendTourConfirmationMock: vi.fn(async () => undefined),
  notifyNewTourMock: vi.fn(async () => undefined),
  advanceMock: vi.fn(async () => ({ ok: true, dealId: 'deal_1', created: true, moved: false })),
}));

vi.mock('@/lib/space', () => ({
  getSpaceFromSlug: vi.fn(async () => ({ id: 'space_1', slug: 'jane', name: 'Jane Realty' })),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/tours/validate-slot', () => ({
  validateTourSlot: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/tour-booking', () => ({
  bookTourAtomic: vi.fn(async () => ({ ok: true, tourId: 'tour_1', manageToken: 'tok_test' })),
  generateManageToken: () => 'tok_test',
}));
vi.mock('@/lib/calendar/mirror-tour', () => ({
  mirrorTourBookingToCalendar: mirrorMock,
  rollbackTourBooking: rollbackMock,
}));
vi.mock('@/lib/deals/advance-from-event', () => ({
  advanceDealFromEvent: advanceMock,
}));
vi.mock('@/lib/tour-emails', () => ({ sendTourConfirmation: sendTourConfirmationMock }));
vi.mock('@/lib/notify', () => ({ notifyNewTour: notifyNewTourMock }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn(async () => true), tourConfirmationSMS: (p: unknown) => p }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(): Record<string, unknown> {
    let isInsert = false;
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => {
        isInsert = true;
        return chain;
      }),
      update: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      single: vi.fn(() =>
        Promise.resolve({
          data: {
            id: 'tour_1',
            guestName: 'Sam Lee',
            guestEmail: 'sam@example.com',
            guestPhone: null,
            propertyAddress: '123 Oak',
            startsAt: '2026-07-15T13:00:00.000Z',
            endsAt: '2026-07-15T13:30:00.000Z',
            manageToken: 'tok_test',
            status: 'scheduled',
          },
          error: null,
        }),
      ),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: isInsert ? null : null, error: null }).then(resolve, reject),
    };
    return chain;
  }
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

import { POST } from '@/app/api/tours/book/route';
import { bookTourAtomic } from '@/lib/tour-booking';

const bookTourAtomicMock = vi.mocked(bookTourAtomic);

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tours/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FUTURE = '2026-07-15T13:00:00.000Z';
const body = {
  slug: 'jane',
  guestName: 'Sam Lee',
  guestEmail: 'sam@example.com',
  propertyAddress: '123 Oak',
  startsAt: FUTURE,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
  bookTourAtomicMock.mockResolvedValue({ ok: true, tourId: 'tour_1', manageToken: 'tok_test' });
  mirrorMock.mockResolvedValue({ attempted: false, reason: 'no_connection' });
});

describe('POST /api/tours/book — calendar write', () => {
  it('writes the connected calendar and confirms when the event lands', async () => {
    mirrorMock.mockResolvedValue({ attempted: true, externalOk: true, via: 'composio' });

    const res = await POST(makeReq(body));
    expect(res.status).toBe(201);
    expect(mirrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        guestEmail: 'sam@example.com',
        startsAt: FUTURE,
        createdBy: 'realtor',
      }),
    );
    const mirrored = mirrorMock.mock.calls[0]?.[0] as { tourId: string };
    expect(mirrored.tourId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(rollbackMock).not.toHaveBeenCalled();
    expect(sendTourConfirmationMock).toHaveBeenCalledOnce();
    expect(advanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        event: 'tour_booked',
        title: 'Sam Lee',
        address: '123 Oak',
      }),
    );
  });

  it('rolls the tour back and returns 502 when the calendar write fails', async () => {
    mirrorMock.mockResolvedValue({ attempted: true, externalOk: false, via: 'composio' });

    const res = await POST(makeReq(body));
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/calendar/i);
    const mirrored = mirrorMock.mock.calls[0]?.[0] as { tourId: string };
    expect(rollbackMock).toHaveBeenCalledWith('space_1', mirrored.tourId);
    expect(sendTourConfirmationMock).not.toHaveBeenCalled();
    expect(notifyNewTourMock).not.toHaveBeenCalled();
    expect(advanceMock).not.toHaveBeenCalled();
  });

  it('still books when no calendar is connected (CRM-only, honest)', async () => {
    mirrorMock.mockResolvedValue({ attempted: false, reason: 'no_connection' });

    const res = await POST(makeReq(body));
    expect(res.status).toBe(201);
    expect(rollbackMock).not.toHaveBeenCalled();
    expect(sendTourConfirmationMock).toHaveBeenCalledOnce();
    expect(advanceMock).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space_1', event: 'tour_booked' }),
    );
  });
});
