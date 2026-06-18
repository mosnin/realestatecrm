/**
 * Tour reminder sender — the P0 "reminders never send" fix.
 *
 * What these lock in:
 *   - A due tour actually triggers a guest email + SMS (the old route only
 *     RETURNED the list; nothing sent).
 *   - Idempotency: the send is CLAIMED via a conditional column stamp; if the
 *     claim loses the race (update touches no row), the reminder is skipped —
 *     no double-send.
 *   - Best-effort: a send failure doesn't throw out of the run.
 *
 * The email/SMS transports are mocked; supabase is a scripted mock that lets
 * each test control the tour query result and the claim outcome.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Scripted state the mock reads.
let tourQueryResult: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null };
let claimWins = true; // whether the conditional claim update returns a row

const sendTourReminder = vi.fn((..._a: unknown[]) => Promise.resolve());
const sendSMS = vi.fn((..._a: unknown[]) => Promise.resolve(true));

vi.mock('@/lib/tour-emails', () => ({
  sendTourReminder: (...a: unknown[]) => sendTourReminder(...a),
}));
vi.mock('@/lib/sms', () => ({
  sendSMS: (...a: unknown[]) => sendSMS(...a),
  tourReminderSMS: (p: unknown) => p, // pass-through; we assert on the call
}));

vi.mock('@/lib/supabase', () => {
  // The sender issues several queries per run:
  //   1. Tour select (the due-tours list) — terminal via await (.then)
  //   2. SpaceSetting select .in(...) — await
  //   3. Space select .in(...) — await
  //   4. per-tour Tour update ... .maybeSingle()  ← the claim
  // We disambiguate the claim (an update→maybeSingle) by tracking whether
  // `.update()` was called on this chain.
  function makeChain(table: string): Record<string, unknown> {
    let isUpdate = false;
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      update: vi.fn(() => {
        isUpdate = true;
        return chain;
      }),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      in: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() =>
        Promise.resolve(
          isUpdate
            ? { data: claimWins ? { id: 'claimed' } : null, error: null }
            : { data: null, error: null },
        ),
      ),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        // Non-terminal awaits: the Tour list, SpaceSetting, Space.
        let payload: { data: unknown; error: unknown };
        if (table === 'Tour') payload = tourQueryResult;
        else if (table === 'SpaceSetting') payload = { data: [{ spaceId: 's_1', businessName: 'Jane Realty' }], error: null };
        else if (table === 'Space') payload = { data: [{ id: 's_1', name: 'Jane Realty', slug: 'jane' }], error: null };
        else payload = { data: [], error: null };
        return Promise.resolve(payload).then(resolve, reject);
      },
    };
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { runTourReminders } from '@/lib/tour-reminders';

function dueTour(overrides: Record<string, unknown> = {}) {
  // Starts ~2h out → a "24h" reminder by default.
  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  return {
    id: 't_1',
    guestName: 'Sam Lee',
    guestEmail: 'sam@example.com',
    guestPhone: '+15551234567',
    propertyAddress: '123 Oak',
    startsAt,
    endsAt: new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    spaceId: 's_1',
    manageToken: 'tok',
    contactId: 'c_1',
    reminder24SentAt: null,
    reminder1hSentAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  tourQueryResult = { data: [], error: null };
  claimWins = true;
  vi.clearAllMocks();
  sendTourReminder.mockResolvedValue(undefined);
  sendSMS.mockResolvedValue(true);
});

describe('runTourReminders', () => {
  it('no due tours → sends nothing', async () => {
    tourQueryResult = { data: [], error: null };
    const res = await runTourReminders();
    expect(res.processed).toBe(0);
    expect(sendTourReminder).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('a due tour → sends email + SMS to the guest', async () => {
    tourQueryResult = { data: [dueTour()], error: null };
    const res = await runTourReminders();
    expect(res.processed).toBe(1);
    expect(sendTourReminder).toHaveBeenCalledTimes(1);
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(res.reminders[0]).toMatchObject({ tourId: 't_1', type: '24h', delivered: { email: true, sms: true } });
  });

  it('idempotent — when the claim loses the race, the reminder is skipped (no double-send)', async () => {
    tourQueryResult = { data: [dueTour()], error: null };
    claimWins = false; // another cron tick already stamped the column
    const res = await runTourReminders();
    expect(res.processed).toBe(0);
    expect(sendTourReminder).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('skips a tour whose 24h reminder was already stamped (cheap pre-check)', async () => {
    tourQueryResult = { data: [dueTour({ reminder24SentAt: new Date().toISOString() })], error: null };
    const res = await runTourReminders();
    expect(res.processed).toBe(0);
    expect(sendTourReminder).not.toHaveBeenCalled();
  });

  it('best-effort — an email failure still records the send and does not throw', async () => {
    tourQueryResult = { data: [dueTour({ guestPhone: null })], error: null };
    sendTourReminder.mockRejectedValue(new Error('resend down'));
    const res = await runTourReminders();
    expect(res.processed).toBe(1);
    expect(res.reminders[0].delivered.email).toBe(false);
  });

  it('a tour within the hour gets a 1h reminder', async () => {
    const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    tourQueryResult = { data: [dueTour({ startsAt: soon })], error: null };
    const res = await runTourReminders();
    expect(res.reminders[0].type).toBe('1h');
  });
});
