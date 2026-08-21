/**
 * Route-level integration test for the tour-slot write-path guard in
 * POST /api/tours/book.
 *
 * The unit test (tests/lib/validate-tour-slot.test.ts) pins the slot-validation
 * logic itself. This test pins the WIRING: that the guard runs on the write
 * path, sits alongside main's atomic conflict check, and short-circuits a bad
 * request BEFORE any Tour is written.
 *
 *   - An off-hours / wrong-weekday slot → 422 and bookTourAtomic is NEVER
 *     called (nothing is booked).
 *   - A valid slot → bookTourAtomic IS called and the tour is created (201).
 *
 * validateTourSlot is mocked so this test is about the integration, not the
 * (separately-tested) availability math.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/space', () => ({
  getSpaceFromSlug: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

const validateTourSlotMock = vi.fn();
vi.mock('@/lib/tours/validate-slot', () => ({
  validateTourSlot: (...a: unknown[]) => validateTourSlotMock(...a),
}));

const bookTourAtomicMock = vi.fn();
vi.mock('@/lib/tour-booking', () => ({
  bookTourAtomic: (...a: unknown[]) => bookTourAtomicMock(...a),
  generateManageToken: () => 'tok_test',
}));

// Email / SMS / notify transports are best-effort and irrelevant here.
vi.mock('@/lib/tour-emails', () => ({ sendTourConfirmation: vi.fn(async () => {}) }));
vi.mock('@/lib/notify', () => ({ notifyNewTour: vi.fn(async () => {}) }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn(async () => true), tourConfirmationSMS: (p: unknown) => p }));
// Calendar write is Phase 3; this file only pins slot-guard wiring. No
// connection → CRM-only book, same as the public route's honest fallback.
vi.mock('@/lib/calendar/mirror-tour', () => ({
  mirrorTourBookingToCalendar: vi.fn(async () => ({ attempted: false, reason: 'no_connection' })),
  rollbackTourBooking: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase', () => {
  // The route touches several tables. We only need:
  //   - SpaceSetting select(tourDuration) .maybeSingle()
  //   - Contact select ... .maybeSingle()  (no existing contact)
  //   - Contact insert(...)               (awaited)
  //   - Tour select('*') ... .single()    (fetch created tour)
  //   - SpaceSetting select(businessName) .maybeSingle()
  function makeChain(table: string): Record<string, unknown> {
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
            propertyAddress: null,
            startsAt: '2026-07-15T13:00:00.000Z',
            endsAt: '2026-07-15T13:30:00.000Z',
            manageToken: 'tok_test',
          },
          error: null,
        }),
      ),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: isInsert ? null : null, error: null }).then(resolve, reject),
    };
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { POST } from '@/app/api/tours/book/route';
import { getSpaceFromSlug } from '@/lib/space';

const mockGetSpaceFromSlug = vi.mocked(getSpaceFromSlug);

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tours/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FUTURE = '2026-07-15T13:00:00.000Z';

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'jane',
    guestName: 'Sam Lee',
    guestEmail: 'sam@example.com',
    startsAt: FUTURE,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Freeze "now" before the requested slot so the "not in the past" check passes.
  vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
  mockGetSpaceFromSlug.mockResolvedValue({ id: 'space_1', slug: 'jane', name: 'Jane Realty' } as never);
  bookTourAtomicMock.mockResolvedValue({ ok: true, tourId: 'tour_1', manageToken: 'tok_test' });
});

describe('POST /api/tours/book — slot-guard wiring', () => {
  it('rejects an invalid (off-hours/wrong-weekday) slot with 422 and never books', async () => {
    validateTourSlotMock.mockResolvedValue({ ok: false, reason: 'Selected time is outside available hours.' });

    const res = await POST(makeReq(baseBody()));

    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/available hours/i);
    // The guard short-circuits before the atomic insert — nothing is booked.
    expect(bookTourAtomicMock).not.toHaveBeenCalled();
  });

  it('books a valid slot (guard passes → atomic insert runs → 201)', async () => {
    validateTourSlotMock.mockResolvedValue({ ok: true });

    const res = await POST(makeReq(baseBody()));

    expect(validateTourSlotMock).toHaveBeenCalledOnce();
    expect(bookTourAtomicMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string };
    expect(json.id).toBe('tour_1');
  });

  it('runs the slot guard before the atomic conflict check (defense in depth)', async () => {
    // Even if the slot would conflict, the window guard must fire first so an
    // off-hours request can't reach the RPC at all.
    const order: string[] = [];
    validateTourSlotMock.mockImplementation(async () => {
      order.push('validate');
      return { ok: false, reason: 'Selected time is not a valid tour slot.' };
    });
    bookTourAtomicMock.mockImplementation(async () => {
      order.push('book');
      return { ok: false, reason: 'conflict' };
    });

    await POST(makeReq(baseBody()));

    expect(order).toEqual(['validate']);
  });
});
