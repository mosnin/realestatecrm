/**
 * P0 tour-correctness regressions for the agent tools.
 *
 * What these lock in (the audit findings being fixed):
 *
 *   1. schedule_tour goes through the ATOMIC conflict-checked booking path
 *      (bookTourAtomic → book_tour_atomic RPC), never a raw Tour insert.
 *      A conflict must surface as an error and must NOT charge or write the
 *      calendar — i.e. it cannot double-book.
 *
 *   2. reschedule_tour propagates: after the DB update it moves the external
 *      calendar event (updateEventThrough) AND notifies the guest
 *      (notifyTourRescheduled). A failure in either is best-effort and does
 *      NOT fail the reschedule.
 *
 *   3. cancel_tour propagates: after the status flip it deletes the external
 *      calendar event (deleteEventThrough) AND notifies the guest
 *      (notifyTourCancelled), both best-effort.
 *
 * The calendar + email/SMS layers are mocked — we assert the tools CALL them
 * with the right shape, and that throwing layers don't sink the core action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── supabase chain mock ────────────────────────────────────────────────────
// A chainable builder whose terminal (.maybeSingle / await) resolves to a
// per-table queued result. Tests set `tableRows`/`tableError` before calling.

let lookupRow: Record<string, unknown> | null = null;
let lookupError: { message: string } | null = null;
const insertCalls: Array<{ table: string }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const result = { data: lookupRow, error: lookupError };
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => {
        insertCalls.push({ table });
        return chain;
      }),
      update: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      not: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
      single: vi.fn(() => Promise.resolve(result)),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

// ── booking primitive ──────────────────────────────────────────────────────
const bookTourAtomic = vi.fn();
vi.mock('@/lib/tour-booking', () => ({
  bookTourAtomic: (...a: unknown[]) => bookTourAtomic(...a),
  generateManageToken: () => 'tok_test',
}));

// ── calendar mirror ─────────────────────────────────────────────────────────
const findCalendarConnection = vi.fn();
const writeEventThrough = vi.fn();
const updateEventThrough = vi.fn();
const deleteEventThrough = vi.fn();
vi.mock('@/lib/calendar/mirror', () => ({
  findCalendarConnection: (...a: unknown[]) => findCalendarConnection(...a),
  writeEventThrough: (...a: unknown[]) => writeEventThrough(...a),
  updateEventThrough: (...a: unknown[]) => updateEventThrough(...a),
  deleteEventThrough: (...a: unknown[]) => deleteEventThrough(...a),
}));

// ── guest notices ───────────────────────────────────────────────────────────
const notifyTourRescheduled = vi.fn();
const notifyTourCancelled = vi.fn();
vi.mock('@/lib/tour-notify', () => ({
  notifyTourRescheduled: (...a: unknown[]) => notifyTourRescheduled(...a),
  notifyTourCancelled: (...a: unknown[]) => notifyTourCancelled(...a),
}));

// ── legacy GCal (cancel path also hits this) ────────────────────────────────
const deleteGoogleEvent = vi.fn((..._a: unknown[]) => Promise.resolve(true));
vi.mock('@/lib/gcal-helpers', () => ({
  deleteGoogleEvent: (...a: unknown[]) => deleteGoogleEvent(...a),
}));

const tourWindowConflicts = vi.fn(async () => false);
vi.mock('@/lib/tours/conflicts', () => ({
  tourWindowConflicts: (...a: unknown[]) => tourWindowConflicts(...a),
}));

const dropTourCalendarArtifacts = vi.fn(async () => undefined);
vi.mock('@/lib/tours/calendar-propagate', () => ({
  dropTourCalendarArtifacts: (...a: unknown[]) => dropTourCalendarArtifacts(...a),
  moveTourCalendarArtifacts: vi.fn(async () => undefined),
}));

// ── billing meter (assert charge is gated on success) ───────────────────────
const assertCanSpend = vi.fn((..._a: unknown[]) => Promise.resolve());
const chargeWorkflow = vi.fn((..._a: unknown[]) => Promise.resolve());
vi.mock('@/lib/billing/meter', () => ({
  assertCanSpend: (...a: unknown[]) => assertCanSpend(...a),
  chargeWorkflow: (...a: unknown[]) => chargeWorkflow(...a),
  CreditsExhaustedError: class extends Error {},
  SubscriptionDelinquentError: class extends Error {},
}));

import { scheduleTourTool } from '@/lib/ai-tools/tools/schedule-tour';
import { rescheduleTourTool } from '@/lib/ai-tools/tools/reschedule-tour';
import { cancelTourTool } from '@/lib/ai-tools/tools/cancel-tour';
import { deleteTourTool } from '@/lib/ai-tools/tools/delete-tour';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'u_1',
    space: { id: 's_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_1' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  lookupRow = null;
  lookupError = null;
  insertCalls.length = 0;
  vi.clearAllMocks();
  bookTourAtomic.mockReset();
  findCalendarConnection.mockReset();
  updateEventThrough.mockReset();
  deleteEventThrough.mockReset();
  notifyTourRescheduled.mockReset();
  notifyTourCancelled.mockReset();
  tourWindowConflicts.mockReset();
  tourWindowConflicts.mockResolvedValue(false);
  dropTourCalendarArtifacts.mockReset();
  dropTourCalendarArtifacts.mockResolvedValue(undefined);
  deleteGoogleEvent.mockReset();
  deleteGoogleEvent.mockResolvedValue(true);
  assertCanSpend.mockResolvedValue(undefined);
  chargeWorkflow.mockResolvedValue(undefined);
  findCalendarConnection.mockResolvedValue(null);
});

// ── 1. schedule_tour: atomic conflict path ──────────────────────────────────

describe('schedule_tour — atomic conflict path (no double-booking)', () => {
  const args = {
    guestName: 'Sam Lee',
    guestEmail: 'sam@example.com',
    propertyAddress: '123 Oak',
    startsAt: '2026-07-01T17:00:00.000Z',
    endsAt: '2026-07-01T17:30:00.000Z',
  };

  it('routes through bookTourAtomic (never a raw Tour insert)', async () => {
    bookTourAtomic.mockResolvedValue({ ok: true, tourId: 't_new', manageToken: 'tok' });
    const res = await scheduleTourTool.handler(args, makeCtx());
    expect(bookTourAtomic).toHaveBeenCalledTimes(1);
    // The handler must not have inserted into Tour directly.
    expect(insertCalls.some((c) => c.table === 'Tour')).toBe(false);
    expect(res.display).toBe('tours');
  });

  it('returns an error on conflict — and does NOT charge or write the calendar', async () => {
    bookTourAtomic.mockResolvedValue({ ok: false, reason: 'conflict' });
    const res = await scheduleTourTool.handler(args, makeCtx());
    expect(res.display).toBe('error');
    expect(res.summary.toLowerCase()).toMatch(/overlap|available|conflict/);
    // A conflict must not bill the realtor and must not touch the calendar.
    expect(chargeWorkflow).not.toHaveBeenCalled();
    expect(findCalendarConnection).not.toHaveBeenCalled();
    expect(writeEventThrough).not.toHaveBeenCalled();
  });

  it('surfaces a genuine RPC error without charging', async () => {
    bookTourAtomic.mockResolvedValue({ ok: false, reason: 'error', error: new Error('boom') });
    const res = await scheduleTourTool.handler(args, makeCtx());
    expect(res.display).toBe('error');
    expect(res.summary).toMatch(/boom/);
    expect(chargeWorkflow).not.toHaveBeenCalled();
  });

  it('charges only after a successful atomic insert', async () => {
    bookTourAtomic.mockResolvedValue({ ok: true, tourId: 't_ok', manageToken: 'tok' });
    await scheduleTourTool.handler(args, makeCtx());
    expect(chargeWorkflow).toHaveBeenCalledTimes(1);
  });
});

// ── 2. reschedule_tour: calendar + notify propagation ────────────────────────

describe('reschedule_tour — propagates to calendar + guest', () => {
  const rescheduleArgs = {
    tourId: 't_1',
    newStartsAt: '2026-07-02T18:00:00.000Z',
  };

  function seatTour() {
    lookupRow = {
      id: 't_1',
      startsAt: '2026-07-01T17:00:00.000Z',
      endsAt: '2026-07-01T17:30:00.000Z',
      contactId: 'c_1',
      propertyAddress: '123 Oak',
      guestName: 'Sam Lee',
      guestEmail: 'sam@example.com',
      guestPhone: '+15551234567',
      status: 'scheduled',
    };
  }

  it('moves the external calendar event AND notifies the guest', async () => {
    seatTour();
    findCalendarConnection.mockResolvedValue({ id: 'conn', userId: 'u_1', toolkit: 'googlecalendar' });
    updateEventThrough.mockResolvedValue({ externalOk: true });
    notifyTourRescheduled.mockResolvedValue(undefined);

    const res = await rescheduleTourTool.handler(rescheduleArgs, makeCtx());

    expect(res.display).toBe('success');
    expect(updateEventThrough).toHaveBeenCalledTimes(1);
    expect(updateEventThrough.mock.calls[0][0]).toMatchObject({
      spaceId: 's_1',
      sourceTourId: 't_1',
      startsAt: '2026-07-02T18:00:00.000Z',
    });
    expect(notifyTourRescheduled).toHaveBeenCalledTimes(1);
    expect(notifyTourRescheduled.mock.calls[0][0]).toMatchObject({
      tourId: 't_1',
      guestEmail: 'sam@example.com',
      guestPhone: '+15551234567',
    });
  });

  it('is best-effort — a calendar failure does NOT fail the reschedule', async () => {
    seatTour();
    findCalendarConnection.mockResolvedValue({ id: 'conn', userId: 'u_1', toolkit: 'googlecalendar' });
    updateEventThrough.mockRejectedValue(new Error('composio down'));
    notifyTourRescheduled.mockResolvedValue(undefined);

    const res = await rescheduleTourTool.handler(rescheduleArgs, makeCtx());

    expect(res.display).toBe('success');
    // Notify still attempted even though the calendar threw.
    expect(notifyTourRescheduled).toHaveBeenCalledTimes(1);
  });

  it('is best-effort — a notify failure does NOT fail the reschedule', async () => {
    seatTour();
    findCalendarConnection.mockResolvedValue(null);
    notifyTourRescheduled.mockRejectedValue(new Error('resend down'));

    const res = await rescheduleTourTool.handler(rescheduleArgs, makeCtx());
    expect(res.display).toBe('success');
  });

  it('refuses a move that overlaps another tour and does not notify', async () => {
    seatTour();
    tourWindowConflicts.mockResolvedValue(true);

    const res = await rescheduleTourTool.handler(rescheduleArgs, makeCtx());

    expect(res.display).toBe('error');
    expect(res.summary.toLowerCase()).toMatch(/overlap|slot/);
    expect(notifyTourRescheduled).not.toHaveBeenCalled();
    expect(updateEventThrough).not.toHaveBeenCalled();
  });
});

// ── 3. cancel_tour: calendar + notify propagation ────────────────────────────

describe('cancel_tour — propagates to calendar + guest', () => {
  const cancelArgs = { tourId: 't_1', reason: 'guest backed out' };

  function seatTour(extra: Record<string, unknown> = {}) {
    lookupRow = {
      id: 't_1',
      contactId: 'c_1',
      guestName: 'Sam Lee',
      guestEmail: 'sam@example.com',
      guestPhone: '+15551234567',
      propertyAddress: '123 Oak',
      startsAt: '2026-07-01T17:00:00.000Z',
      endsAt: '2026-07-01T17:30:00.000Z',
      status: 'scheduled',
      googleEventId: null,
      ...extra,
    };
  }

  it('deletes the external calendar event AND notifies the guest', async () => {
    seatTour();
    findCalendarConnection.mockResolvedValue({ id: 'conn', userId: 'u_1', toolkit: 'googlecalendar' });
    deleteEventThrough.mockResolvedValue({ externalOk: true });
    notifyTourCancelled.mockResolvedValue(undefined);

    const res = await cancelTourTool.handler(cancelArgs, makeCtx());

    expect(res.display).toBe('success');
    expect(deleteEventThrough).toHaveBeenCalledTimes(1);
    expect(deleteEventThrough.mock.calls[0][0]).toMatchObject({ spaceId: 's_1', sourceTourId: 't_1' });
    expect(notifyTourCancelled).toHaveBeenCalledTimes(1);
    expect(notifyTourCancelled.mock.calls[0][0]).toMatchObject({
      tourId: 't_1',
      guestEmail: 'sam@example.com',
    });
  });

  it('still drops the legacy googleEventId when present', async () => {
    seatTour({ googleEventId: 'gcal_123' });
    findCalendarConnection.mockResolvedValue(null);
    notifyTourCancelled.mockResolvedValue(undefined);

    const res = await cancelTourTool.handler(cancelArgs, makeCtx());
    expect(res.display).toBe('success');
    expect(deleteGoogleEvent).toHaveBeenCalledTimes(1);
    expect(deleteGoogleEvent.mock.calls[0][0]).toMatchObject({ spaceId: 's_1', googleEventId: 'gcal_123' });
  });

  it('is best-effort — a calendar/notify failure does NOT fail the cancel', async () => {
    seatTour();
    findCalendarConnection.mockResolvedValue({ id: 'conn', userId: 'u_1', toolkit: 'googlecalendar' });
    deleteEventThrough.mockRejectedValue(new Error('composio down'));
    notifyTourCancelled.mockRejectedValue(new Error('resend down'));

    const res = await cancelTourTool.handler(cancelArgs, makeCtx());
    expect(res.display).toBe('success');
  });
});

describe('delete_tour — drops both calendar systems', () => {
  it('calls dropTourCalendarArtifacts with the tour id and legacy event id', async () => {
    lookupRow = {
      id: 't_1',
      contactId: 'c_1',
      guestName: 'Sam Lee',
      googleEventId: 'gcal_123',
    };

    const res = await deleteTourTool.handler(
      { tourId: 't_1', reason: 'duplicate booking' },
      makeCtx(),
    );

    expect(res.display).toBe('success');
    expect(dropTourCalendarArtifacts).toHaveBeenCalledTimes(1);
    expect(dropTourCalendarArtifacts.mock.calls[0][0]).toMatchObject({
      spaceId: 's_1',
      tourId: 't_1',
      googleEventId: 'gcal_123',
    });
  });
});
