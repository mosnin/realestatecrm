/**
 * Tests for `lib/calendar/tour-sync.ts` — the INBOUND half of the calendar
 * mirror (the two-way sync fix).
 *
 * The mirror is write-only; this module reads external calendar changes back
 * onto the mapped Tour. What we lock in:
 *
 *   1. An external DELETE cancels the mapped tour AND notifies the guest.
 *   2. An external MOVE updates the tour's time AND notifies the guest.
 *   3. An RSVP change is recorded on the tour (externalResponseStatus).
 *   4. IDEMPOTENT: re-applying a delete to an already-cancelled tour is a
 *      no-op (no second cancel, no second notify); re-recording the same RSVP
 *      is a no-op.
 *   5. ONLY MAPPED TOURS: an event with no CalendarEventMirror row → no-op
 *      (we never touch a tour we didn't mirror).
 *   6. SPACE-SCOPED: every Tour / mirror query is filtered by the connection's
 *      spaceId, so a cross-space event id can't reach another tenant's tour.
 *
 * The supabase client + the guest-notify helpers are mocked; we assert the
 * module calls them with the right shape and that the mapping/space-scoping is
 * enforced. The notify helpers are the SAME ones the agent's cancel/reschedule
 * tools use (reuse, not a parallel path).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── guest notices (reused from the agent tour tools) ─────────────────────────
const notifyTourCancelled = vi.fn<(arg: Record<string, unknown>) => Promise<void>>(
  async () => undefined,
);
const notifyTourRescheduled = vi.fn<(arg: Record<string, unknown>) => Promise<void>>(
  async () => undefined,
);
vi.mock('@/lib/tour-notify', () => ({
  notifyTourCancelled: (a: Record<string, unknown>) => notifyTourCancelled(a),
  notifyTourRescheduled: (a: Record<string, unknown>) => notifyTourRescheduled(a),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── supabase mock ────────────────────────────────────────────────────────────
// A chainable builder. Per (table, op) the test seats a result via `seat()`.
// Every chain call is recorded on `chainLog` so we can assert space-scoping
// (the .eq('spaceId', ...) filter) and which mutation ran.
//
// op resolution: 'select' if .select() was called and the chain is read
// (terminated by .maybeSingle); 'update'/'delete'/'insert' otherwise. We key
// the queued results by `${table}:${op}` and pop in call order.

type Term = { data: unknown; error: unknown };

interface ChainRecord {
  table: string;
  ops: string[]; // method names in call order
  args: Array<[string, unknown[]]>;
}

const state: {
  queued: Map<string, Term[]>;
  log: ChainRecord[];
} = { queued: new Map(), log: [] };

function seat(key: string, term: Term) {
  const arr = state.queued.get(key) ?? [];
  arr.push(term);
  state.queued.set(key, arr);
}

function popResult(table: string, ops: string[]): Term {
  // Mutation if any of update/delete/insert present; else select.
  const isMutation = ops.some((o) => o === 'update' || o === 'delete' || o === 'insert');
  const op = isMutation
    ? (ops.find((o) => o === 'update' || o === 'delete' || o === 'insert') as string)
    : 'select';
  const key = `${table}:${op}`;
  const arr = state.queued.get(key);
  if (arr && arr.length) return arr.shift() as Term;
  return { data: null, error: null };
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const rec: ChainRecord = { table, ops: [], args: [] };
    state.log.push(rec);
    const chain: Record<string, unknown> = {};
    const passthrough = [
      'select', 'eq', 'neq', 'is', 'in', 'not', 'order', 'limit',
      'gte', 'lte', 'update', 'delete', 'insert', 'upsert',
    ];
    for (const m of passthrough) {
      chain[m] = vi.fn((...a: unknown[]) => {
        rec.ops.push(m);
        rec.args.push([m, a]);
        return chain;
      });
    }
    const term = () => Promise.resolve(popResult(table, rec.ops));
    chain.maybeSingle = vi.fn(term);
    chain.single = vi.fn(term);
    chain.then = (r: (v: Term) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve(popResult(table, rec.ops)).then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { syncCalendarEventToTour, extractExternalEventId } from '@/lib/calendar/tour-sync';

const SPACE = 'space-1';
const PROVIDER = 'googlecalendar' as const;

function seatMirror(row: { id: string; sourceTourId: string | null } | null) {
  seat('CalendarEventMirror:select', { data: row, error: null });
}
function seatTour(row: Record<string, unknown> | null) {
  seat('Tour:select', { data: row, error: null });
}
function baseTour(extra: Record<string, unknown> = {}) {
  return {
    id: 'tour-1',
    status: 'scheduled',
    startsAt: '2026-07-01T17:00:00.000Z',
    endsAt: '2026-07-01T17:30:00.000Z',
    guestName: 'Sam Lee',
    guestEmail: 'sam@example.com',
    guestPhone: '+15551234567',
    propertyAddress: '123 Oak',
    externalResponseStatus: null,
    ...extra,
  };
}

/** All .eq([col, val]) pairs across every chain that touched `table`. */
function eqPairs(table: string): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const rec of state.log) {
    if (rec.table !== table) continue;
    for (const [m, a] of rec.args) {
      if (m === 'eq') out.push([a[0] as string, a[1]]);
    }
  }
  return out;
}

beforeEach(() => {
  state.queued = new Map();
  state.log = [];
  vi.clearAllMocks();
  notifyTourCancelled.mockResolvedValue(undefined);
  notifyTourRescheduled.mockResolvedValue(undefined);
});

// ── extractExternalEventId (payload-shape robustness) ────────────────────────

describe('extractExternalEventId', () => {
  it('reads event_id, eventId, id, and nested event.id', () => {
    expect(extractExternalEventId({ event_id: 'a' })).toBe('a');
    expect(extractExternalEventId({ eventId: 'b' })).toBe('b');
    expect(extractExternalEventId({ id: 'c' })).toBe('c');
    expect(extractExternalEventId({ event: { id: 'd' } })).toBe('d');
  });
  it('returns null when no id field is present', () => {
    expect(extractExternalEventId({ summary: 'no id here' })).toBeNull();
    expect(extractExternalEventId({})).toBeNull();
  });
});

// ── 1. external DELETE → cancel + notify ─────────────────────────────────────

describe('external delete → cancels the mapped tour', () => {
  it('cancels the tour and notifies the guest', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour());
    // The conditional cancel update returns the claimed row.
    seat('Tour:update', { data: { id: 'tour-1' }, error: null });
    seat('CalendarEventMirror:delete', { data: null, error: null });

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      payload: { event_id: 'gcal_evt_1', summary: 'Tour: Sam Lee' },
    });

    expect(res.action).toBe('cancelled');
    expect(res.tourId).toBe('tour-1');

    // The Tour update flipped status to cancelled.
    const tourUpdate = state.log.find((r) => r.table === 'Tour' && r.ops.includes('update'));
    expect(tourUpdate).toBeTruthy();
    const updateArg = tourUpdate!.args.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    expect(updateArg.status).toBe('cancelled');

    // Guest was told — best-effort notice with the tour's details.
    expect(notifyTourCancelled).toHaveBeenCalledTimes(1);
    expect(notifyTourCancelled.mock.calls[0][0]).toMatchObject({
      spaceId: SPACE,
      tourId: 'tour-1',
      guestEmail: 'sam@example.com',
      guestPhone: '+15551234567',
    });
    expect(notifyTourRescheduled).not.toHaveBeenCalled();
  });

  it('is SPACE-SCOPED: every Tour + mirror query filters by spaceId', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour());
    seat('Tour:update', { data: { id: 'tour-1' }, error: null });
    seat('CalendarEventMirror:delete', { data: null, error: null });

    await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      payload: { event_id: 'gcal_evt_1' },
    });

    // The mirror lookup, tour lookup, tour update, AND mirror delete all carry
    // the spaceId filter.
    expect(eqPairs('CalendarEventMirror')).toContainEqual(['spaceId', SPACE]);
    expect(eqPairs('Tour')).toContainEqual(['spaceId', SPACE]);
    // And the mirror lookup is keyed on this space's provider+event id.
    expect(eqPairs('CalendarEventMirror')).toContainEqual(['externalProvider', PROVIDER]);
    expect(eqPairs('CalendarEventMirror')).toContainEqual(['externalEventId', 'gcal_evt_1']);
  });
});

// ── 2. external MOVE → reschedule + notify ───────────────────────────────────

describe('external move → updates the tour time', () => {
  it('updates start/end and notifies the guest', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour());
    seat('Tour:update', { data: null, error: null });
    seat('CalendarEventMirror:update', { data: null, error: null });

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER',
      payload: {
        event_id: 'gcal_evt_1',
        start_datetime: '2026-07-02T18:00:00.000Z',
        end_datetime: '2026-07-02T18:30:00.000Z',
      },
    });

    expect(res.action).toBe('rescheduled');
    const tourUpdate = state.log.find((r) => r.table === 'Tour' && r.ops.includes('update'));
    const updateArg = tourUpdate!.args.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    expect(updateArg.startsAt).toBe('2026-07-02T18:00:00.000Z');
    expect(updateArg.endsAt).toBe('2026-07-02T18:30:00.000Z');

    expect(notifyTourRescheduled).toHaveBeenCalledTimes(1);
    expect(notifyTourRescheduled.mock.calls[0][0]).toMatchObject({
      spaceId: SPACE,
      tourId: 'tour-1',
      startsAt: '2026-07-02T18:00:00.000Z',
    });
    expect(notifyTourCancelled).not.toHaveBeenCalled();
  });

  it('preserves the original duration when the move payload has no end', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour()); // 30-minute tour
    seat('Tour:update', { data: null, error: null });
    seat('CalendarEventMirror:update', { data: null, error: null });

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER',
      payload: { event_id: 'gcal_evt_1', start_datetime: '2026-07-02T18:00:00.000Z' },
    });

    expect(res.action).toBe('rescheduled');
    const tourUpdate = state.log.find((r) => r.table === 'Tour' && r.ops.includes('update'));
    const updateArg = tourUpdate!.args.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    // 30 min preserved.
    expect(updateArg.endsAt).toBe('2026-07-02T18:30:00.000Z');
  });

  it('does NOT move (no-op) when the new time equals the current time to the minute', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour({ startsAt: '2026-07-01T17:00:00.000Z' }));

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER',
      // Same minute, different seconds — must be treated as "no move".
      payload: { event_id: 'gcal_evt_1', start_datetime: '2026-07-01T17:00:30.000Z' },
    });

    expect(res.action).toBe('noop');
    expect(notifyTourRescheduled).not.toHaveBeenCalled();
    expect(state.log.some((r) => r.table === 'Tour' && r.ops.includes('update'))).toBe(false);
  });
});

// ── 3. RSVP → recorded on the tour ───────────────────────────────────────────

describe('external RSVP → recorded on the tour', () => {
  it('records the response status (no notify, no auto-cancel on decline)', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour({ externalResponseStatus: null }));
    seat('Tour:update', { data: null, error: null });

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER',
      payload: { event_id: 'gcal_evt_1', responseStatus: 'declined' },
    });

    expect(res.action).toBe('rsvp_recorded');
    const tourUpdate = state.log.find((r) => r.table === 'Tour' && r.ops.includes('update'));
    const updateArg = tourUpdate!.args.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    expect(updateArg.externalResponseStatus).toBe('declined');
    // A decline is a signal, not a deletion — the tour is NOT cancelled here.
    expect(notifyTourCancelled).not.toHaveBeenCalled();
    expect(notifyTourRescheduled).not.toHaveBeenCalled();
  });
});

// ── 4. Idempotency ───────────────────────────────────────────────────────────

describe('idempotent re-apply', () => {
  it('delete on an already-cancelled tour is a no-op (no re-notify)', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour({ status: 'cancelled' }));

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      payload: { event_id: 'gcal_evt_1' },
    });

    expect(res.action).toBe('noop');
    expect(res.reason).toBe('terminal_cancelled');
    expect(notifyTourCancelled).not.toHaveBeenCalled();
    // No Tour mutation attempted.
    expect(state.log.some((r) => r.table === 'Tour' && r.ops.includes('update'))).toBe(false);
  });

  it('delete on a completed tour does not override the realtor outcome', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour({ status: 'completed' }));

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      payload: { event_id: 'gcal_evt_1' },
    });

    expect(res.action).toBe('noop');
    expect(res.reason).toBe('terminal_completed');
    expect(notifyTourCancelled).not.toHaveBeenCalled();
  });

  it('the cancel-race loser (no row claimed) does not double-notify', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour({ status: 'scheduled' }));
    // Conditional update matched NO row — another delivery already cancelled it
    // between our read and write.
    seat('Tour:update', { data: null, error: null });

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      payload: { event_id: 'gcal_evt_1' },
    });

    expect(res.action).toBe('noop');
    expect(res.reason).toBe('already_cancelled');
    expect(notifyTourCancelled).not.toHaveBeenCalled();
  });

  it('re-recording the SAME rsvp is a no-op', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour({ externalResponseStatus: 'accepted' }));

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER',
      payload: { event_id: 'gcal_evt_1', responseStatus: 'accepted' },
    });

    expect(res.action).toBe('noop');
    expect(res.reason).toBe('rsvp_unchanged');
    expect(state.log.some((r) => r.table === 'Tour' && r.ops.includes('update'))).toBe(false);
  });
});

// ── 5. Only mapped tours ─────────────────────────────────────────────────────

describe('only affects tours with an external mapping', () => {
  it('no mirror row → clean no-op (never touches a tour)', async () => {
    seatMirror(null); // event isn't a Chippi tour mirror

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      payload: { event_id: 'someones_personal_event' },
    });

    expect(res.action).toBe('noop');
    expect(res.reason).toBe('no_mapped_tour');
    expect(notifyTourCancelled).not.toHaveBeenCalled();
    // We never queried the Tour table — the mapping bailed first.
    expect(state.log.some((r) => r.table === 'Tour')).toBe(false);
  });

  it('mirror row exists but the tour is gone → no-op', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-gone' });
    seatTour(null); // tour deleted

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      payload: { event_id: 'gcal_evt_1' },
    });

    expect(res.action).toBe('noop');
    expect(res.reason).toBe('no_mapped_tour');
    expect(notifyTourCancelled).not.toHaveBeenCalled();
  });

  it('no event id in the payload → no-op (cannot map)', async () => {
    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      payload: { summary: 'no id at all' },
    });

    expect(res.action).toBe('noop');
    expect(res.reason).toBe('no_event_id');
    // Never even hit the DB.
    expect(state.log.length).toBe(0);
  });
});

// ── 6. Best-effort (never throws) ────────────────────────────────────────────

describe('best-effort posture', () => {
  it('a notify failure does not change the cancelled outcome', async () => {
    seatMirror({ id: 'mir-1', sourceTourId: 'tour-1' });
    seatTour(baseTour());
    seat('Tour:update', { data: { id: 'tour-1' }, error: null });
    seat('CalendarEventMirror:delete', { data: null, error: null });
    notifyTourCancelled.mockRejectedValueOnce(new Error('resend down'));

    const res = await syncCalendarEventToTour({
      spaceId: SPACE,
      provider: PROVIDER,
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      payload: { event_id: 'gcal_evt_1' },
    });

    // Cancel still reported success — the notice is best-effort.
    expect(res.action).toBe('cancelled');
  });
});
