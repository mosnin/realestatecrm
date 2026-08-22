/**
 * Behavioral tests for fetchCalendarBusySlots — the public availability
 * busy lookup. Prefers the Composio calendar connection (same as writes);
 * falls back to the legacy token only when that connection is absent.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findCalendarConnectionMock, executeToolForEntityMock } = vi.hoisted(() => ({
  findCalendarConnectionMock: vi.fn(),
  executeToolForEntityMock: vi.fn(),
}));

vi.mock('@/lib/calendar/mirror', () => ({
  findCalendarConnection: findCalendarConnectionMock,
  PROVIDER_TOOL_SLUGS: {
    googlecalendar: { list: 'GOOGLECALENDAR_EVENTS_LIST', create: 'GOOGLECALENDAR_CREATE_EVENT' },
    outlook_calendar: { list: 'OUTLOOK_CALENDAR_LIST_EVENTS', create: 'OUTLOOK_CALENDAR_CREATE_EVENT' },
  },
}));
vi.mock('@/lib/integrations/composio', () => ({
  executeToolForEntity: executeToolForEntityMock,
  composioConfigured: () => true,
}));
vi.mock('@/lib/crypto', () => ({
  decrypt: (v: string) => v,
  decryptOrPassthrough: (v: string) => v,
  encrypt: (v: string) => v,
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

import { fetchCalendarBusySlots } from '@/lib/calendar/busy-times';

const FROM = new Date('2026-07-01T00:00:00.000Z');
const TO = new Date('2026-07-15T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  findCalendarConnectionMock.mockResolvedValue(null);
});

describe('fetchCalendarBusySlots', () => {
  it('returns [] when no calendar is connected', async () => {
    findCalendarConnectionMock.mockResolvedValue(null);
    const slots = await fetchCalendarBusySlots('space_1', FROM, TO);
    expect(slots).toEqual([]);
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('uses the Composio connection and maps events to busy bands', async () => {
    findCalendarConnectionMock.mockResolvedValue({
      id: 'ic_1',
      userId: 'clerk_1',
      toolkit: 'googlecalendar',
    });
    executeToolForEntityMock.mockResolvedValue({
      successful: true,
      data: {
        items: [
          {
            start: { dateTime: '2026-07-02T13:00:00.000Z' },
            end: { dateTime: '2026-07-02T13:30:00.000Z' },
          },
          {
            status: 'cancelled',
            start: { dateTime: '2026-07-03T13:00:00.000Z' },
            end: { dateTime: '2026-07-03T13:30:00.000Z' },
          },
        ],
      },
    });

    const slots = await fetchCalendarBusySlots('space_1', FROM, TO);

    expect(executeToolForEntityMock).toHaveBeenCalledWith({
      entityId: 'clerk_1',
      slug: 'GOOGLECALENDAR_EVENTS_LIST',
      arguments: expect.objectContaining({
        timeMin: FROM.toISOString(),
        timeMax: TO.toISOString(),
      }),
    });
    expect(slots).toEqual([
      {
        start: Date.parse('2026-07-02T13:00:00.000Z'),
        end: Date.parse('2026-07-02T13:30:00.000Z'),
      },
    ]);
  });

  it('does not fall back to the legacy token when Composio is connected (even if list is empty)', async () => {
    findCalendarConnectionMock.mockResolvedValue({
      id: 'ic_1',
      userId: 'clerk_1',
      toolkit: 'googlecalendar',
    });
    executeToolForEntityMock.mockResolvedValue({ successful: false, error: 'down' });

    const slots = await fetchCalendarBusySlots('space_1', FROM, TO);
    expect(slots).toEqual([]);
    expect(queueFor('GoogleCalendarToken')).toHaveLength(0);
  });

  it('uses the legacy token only when Composio is not connected', async () => {
    findCalendarConnectionMock.mockResolvedValue(null);
    queueFor('GoogleCalendarToken').push({
      data: {
        accessToken: 'tok',
        refreshToken: 'ref',
        expiresAt: '2099-01-01T00:00:00.000Z',
        calendarId: 'primary',
      },
      error: null,
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        calendars: {
          primary: {
            busy: [
              { start: '2026-07-02T13:00:00.000Z', end: '2026-07-02T14:00:00.000Z' },
            ],
          },
        },
      }),
    } as Response);

    try {
      const slots = await fetchCalendarBusySlots('space_1', FROM, TO);
      expect(executeToolForEntityMock).not.toHaveBeenCalled();
      expect(slots).toEqual([
        {
          start: Date.parse('2026-07-02T13:00:00.000Z'),
          end: Date.parse('2026-07-02T14:00:00.000Z'),
        },
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
