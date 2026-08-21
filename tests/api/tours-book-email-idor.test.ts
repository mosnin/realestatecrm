/**
 * POST /api/tours/book — email ILIKE wildcard IDOR.
 *
 * The public book path looked up an existing Contact with
 * `.ilike('email', guestEmail)` and then attached the new tour to that row
 * (and could stamp sourceLabel). An unescaped `_` lets `jane_doe@` match
 * `jane.doe@` and write onto someone else's contact.
 *
 * The mock implements ILIKE: an unescaped pattern binds the victim contact;
 * an escaped pattern creates a new contact instead.
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

vi.mock('@/lib/tour-emails', () => ({ sendTourConfirmation: vi.fn(async () => {}) }));
vi.mock('@/lib/notify', () => ({ notifyNewTour: vi.fn(async () => {}) }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn(async () => true), tourConfirmationSMS: (p: unknown) => p }));

const VICTIM_CONTACT = { id: 'contact_victim', email: 'jane.doe@example.com' };

function sqlIlike(value: string, pattern: string): boolean {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) {
      re += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
      continue;
    }
    if (c === '%') {
      re += '.*';
      continue;
    }
    if (c === '_') {
      re += '.';
      continue;
    }
    re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i').test(value);
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    let emailPattern: string | null = null;
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
      ilike: vi.fn((column: string, value: string) => {
        if (table === 'Contact' && column === 'email') emailPattern = value;
        return chain;
      }),
      maybeSingle: vi.fn(() => {
        if (table === 'Contact' && emailPattern !== null && !isInsert) {
          const hit = sqlIlike(VICTIM_CONTACT.email, emailPattern);
          emailPattern = null;
          return Promise.resolve(hit ? { data: { id: VICTIM_CONTACT.id }, error: null } : { data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      single: vi.fn(() =>
        Promise.resolve({
          data: {
            id: 'tour_1',
            guestName: 'Sam Lee',
            guestEmail: 'jane_doe@example.com',
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
  mockGetSpaceFromSlug.mockResolvedValue({ id: 'space_1', slug: 'jane', name: 'Jane Realty' } as never);
  validateTourSlotMock.mockResolvedValue({ ok: true });
  bookTourAtomicMock.mockResolvedValue({ ok: true, tourId: 'tour_1', manageToken: 'tok_test' });
});

describe('POST /api/tours/book — email ILIKE IDOR', () => {
  it('does not attach a booking to another contact whose email `_` would wildcard-match', async () => {
    const res = await POST(
      makeReq({
        slug: 'jane',
        guestName: 'Sam Lee',
        email: undefined,
        guestEmail: 'jane_doe@example.com',
        startsAt: '2026-07-15T13:00:00.000Z',
      }),
    );

    expect(res.status).toBe(201);
    expect(bookTourAtomicMock).toHaveBeenCalledOnce();
    const booked = bookTourAtomicMock.mock.calls[0][0] as { contactId: string | null };
    expect(booked.contactId).not.toBe(VICTIM_CONTACT.id);
  });

  it('still links the tour when the guest email is an exact case-insensitive match', async () => {
    const res = await POST(
      makeReq({
        slug: 'jane',
        guestName: 'Jane Doe',
        guestEmail: 'Jane.Doe@example.com',
        startsAt: '2026-07-15T13:00:00.000Z',
      }),
    );

    expect(res.status).toBe(201);
    const booked = bookTourAtomicMock.mock.calls[0][0] as { contactId: string | null };
    expect(booked.contactId).toBe(VICTIM_CONTACT.id);
  });
});
