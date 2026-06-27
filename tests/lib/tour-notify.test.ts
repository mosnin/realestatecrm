/**
 * notifyTourRescheduled / notifyTourCancelled tell a guest their tour moved or
 * vanished. Two guarantees matter: (1) no-op cleanly when there's no email AND
 * no phone on file (don't even look up the business or call a sender), and
 * (2) best-effort — a flaky Resend/Telnyx is logged but never thrown, so it
 * can't fail the core DB update the caller already did. Mock the deps and pin
 * the channel routing + the never-throw posture.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  sendTourRescheduled: vi.fn(async () => undefined),
  sendTourCancelled: vi.fn(async () => undefined),
  sendSMS: vi.fn(async () => undefined),
  tourRescheduledSMS: vi.fn(() => ({ to: 'x', body: 'r' })),
  tourCancelledSMS: vi.fn(() => ({ to: 'x', body: 'c' })),
  fromSpy: vi.fn(),
}));

vi.mock('@/lib/tour-emails', () => ({
  sendTourRescheduled: h.sendTourRescheduled,
  sendTourCancelled: h.sendTourCancelled,
}));
vi.mock('@/lib/sms', () => ({
  sendSMS: h.sendSMS,
  tourRescheduledSMS: h.tourRescheduledSMS,
  tourCancelledSMS: h.tourCancelledSMS,
}));
vi.mock('@/lib/supabase', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: { businessName: 'Acme', name: 'Acme', slug: 'acme' } }),
  };
  return { supabase: { from: (...a: unknown[]) => (h.fromSpy(...a), chain) } };
});

import { notifyTourRescheduled, notifyTourCancelled } from '@/lib/tour-notify';

const base = {
  spaceId: 'sp1',
  guestName: 'Sam',
  propertyAddress: '1 Main',
  startsAt: '2026-07-01T17:00:00Z',
  endsAt: '2026-07-01T17:30:00Z',
  tourId: 't1',
};

beforeEach(() => vi.clearAllMocks());

describe('tour-notify no-op guard', () => {
  it('does nothing when there is no email AND no phone', async () => {
    await notifyTourRescheduled({ ...base, guestEmail: null, guestPhone: null });
    await notifyTourCancelled({ ...base, guestEmail: null, guestPhone: null });
    expect(h.fromSpy).not.toHaveBeenCalled(); // never even resolves the business
    expect(h.sendTourRescheduled).not.toHaveBeenCalled();
    expect(h.sendSMS).not.toHaveBeenCalled();
  });
});

describe('tour-notify channel routing', () => {
  it('sends email only when an email is on file', async () => {
    await notifyTourRescheduled({ ...base, guestEmail: 'a@b.com', guestPhone: null });
    expect(h.sendTourRescheduled).toHaveBeenCalledTimes(1);
    expect(h.sendSMS).not.toHaveBeenCalled();
  });

  it('sends SMS only when a phone is on file', async () => {
    await notifyTourCancelled({ ...base, guestEmail: null, guestPhone: '+15555550123' });
    expect(h.sendSMS).toHaveBeenCalledTimes(1);
    expect(h.sendTourCancelled).not.toHaveBeenCalled();
  });
});

describe('tour-notify is best-effort (never throws)', () => {
  it('swallows a throwing email sender', async () => {
    h.sendTourRescheduled.mockRejectedValueOnce(new Error('resend down'));
    await expect(
      notifyTourRescheduled({ ...base, guestEmail: 'a@b.com', guestPhone: null }),
    ).resolves.toBeUndefined();
  });

  it('swallows a throwing SMS sender', async () => {
    h.sendSMS.mockRejectedValueOnce(new Error('telnyx down'));
    await expect(
      notifyTourCancelled({ ...base, guestEmail: null, guestPhone: '+15555550123' }),
    ).resolves.toBeUndefined();
  });
});
