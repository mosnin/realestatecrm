/**
 * Behavioral tests for mirrorTourBookingToCalendar — Composio first,
 * legacy GoogleCalendarToken second, skip when neither is connected.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findCalendarConnectionMock, writeEventThroughMock, createGoogleEventMock } = vi.hoisted(() => ({
  findCalendarConnectionMock: vi.fn(),
  writeEventThroughMock: vi.fn(),
  createGoogleEventMock: vi.fn(),
}));

vi.mock('@/lib/calendar/mirror', () => ({
  findCalendarConnection: findCalendarConnectionMock,
  writeEventThrough: writeEventThroughMock,
}));
vi.mock('@/lib/gcal-helpers', () => ({
  createGoogleEvent: createGoogleEventMock,
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const chain: Record<string, unknown> = {};
    const next = () => Promise.resolve(q.shift() ?? { data: null, error: null });
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => next());
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { mirrorTourBookingToCalendar, rollbackTourBooking } from '@/lib/calendar/mirror-tour';

const input = {
  spaceId: 'space_1',
  tourId: 'tour_1',
  guestName: 'Sam Lee',
  guestEmail: 'sam@example.com',
  startsAt: '2026-07-15T13:00:00.000Z',
  endsAt: '2026-07-15T13:30:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  findCalendarConnectionMock.mockResolvedValue(null);
});

describe('mirrorTourBookingToCalendar', () => {
  it('writes through Composio when that connection is active', async () => {
    findCalendarConnectionMock.mockResolvedValue({
      id: 'ic_1',
      userId: 'clerk_1',
      toolkit: 'googlecalendar',
    });
    writeEventThroughMock.mockResolvedValue({
      mirrorId: 'm1',
      externalEventId: 'gcal_1',
      externalOk: true,
    });

    const result = await mirrorTourBookingToCalendar(input);
    expect(result).toEqual({ attempted: true, externalOk: true, via: 'composio' });
    expect(writeEventThroughMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        sourceTourId: 'tour_1',
        createdBy: 'realtor',
      }),
    );
    expect(createGoogleEventMock).not.toHaveBeenCalled();
  });

  it('reports a failed Composio write so the book route can roll back', async () => {
    findCalendarConnectionMock.mockResolvedValue({
      id: 'ic_1',
      userId: 'clerk_1',
      toolkit: 'googlecalendar',
    });
    writeEventThroughMock.mockResolvedValue({
      mirrorId: 'm1',
      externalEventId: null,
      externalOk: false,
    });

    const result = await mirrorTourBookingToCalendar(input);
    expect(result).toEqual({ attempted: true, externalOk: false, via: 'composio' });
  });

  it('falls back to the legacy token when Composio is not connected', async () => {
    findCalendarConnectionMock.mockResolvedValue(null);
    queueFor('GoogleCalendarToken').push({
      data: { accessToken: 'a', refreshToken: 'r', expiresAt: '2099-01-01T00:00:00.000Z' },
      error: null,
    });
    createGoogleEventMock.mockResolvedValue({ ok: true, googleEventId: 'legacy_1' });

    const result = await mirrorTourBookingToCalendar(input);
    expect(result).toEqual({ attempted: true, externalOk: true, via: 'legacy' });
    expect(writeEventThroughMock).not.toHaveBeenCalled();
    expect(createGoogleEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space_1', title: 'Tour: Sam Lee' }),
    );
  });

  it('skips when nothing is connected', async () => {
    findCalendarConnectionMock.mockResolvedValue(null);
    const result = await mirrorTourBookingToCalendar(input);
    expect(result).toEqual({ attempted: false, reason: 'no_connection' });
    expect(writeEventThroughMock).not.toHaveBeenCalled();
    expect(createGoogleEventMock).not.toHaveBeenCalled();
  });

  it('cancels the tour in-space when rolling back a failed calendar write', async () => {
    const { supabase } = await import('@/lib/supabase');
    await rollbackTourBooking('space_1', 'tour_1');
    expect(supabase.from).toHaveBeenCalledWith('Tour');
    const chain = (supabase.from as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value as {
      update: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
    };
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
    );
    expect(chain.eq).toHaveBeenCalledWith('id', 'tour_1');
    expect(chain.eq).toHaveBeenCalledWith('spaceId', 'space_1');
  });
});
