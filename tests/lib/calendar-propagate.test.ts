/**
 * drop/moveTourCalendarArtifacts must touch BOTH calendar systems:
 *   - legacy Tour.googleEventId via gcal-helpers
 *   - Composio CalendarEventMirror via delete/updateEventThrough
 *
 * A throw from either side must not reject the helper.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  deleteGoogleEvent: vi.fn(async (_input?: unknown) => true),
  updateGoogleEvent: vi.fn(async (_input?: unknown) => true),
  findCalendarConnection: vi.fn(async (_spaceId?: unknown) => ({
    id: 'conn',
    userId: 'u_1',
    toolkit: 'googlecalendar',
  })),
  deleteEventThrough: vi.fn(async (_input?: unknown) => ({ externalOk: true })),
  updateEventThrough: vi.fn(async (_input?: unknown) => ({ externalOk: true })),
  tourUpdate: vi.fn(() => ({
    eq: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  })),
}));

vi.mock('@/lib/gcal-helpers', () => ({
  deleteGoogleEvent: (input: unknown) => h.deleteGoogleEvent(input),
  updateGoogleEvent: (input: unknown) => h.updateGoogleEvent(input),
}));
vi.mock('@/lib/calendar/mirror', () => ({
  findCalendarConnection: (spaceId: unknown) => h.findCalendarConnection(spaceId),
  deleteEventThrough: (input: unknown) => h.deleteEventThrough(input),
  updateEventThrough: (input: unknown) => h.updateEventThrough(input),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ update: h.tourUpdate }),
  },
}));

import {
  dropTourCalendarArtifacts,
  moveTourCalendarArtifacts,
} from '@/lib/tours/calendar-propagate';

beforeEach(() => {
  vi.clearAllMocks();
  h.deleteGoogleEvent.mockResolvedValue(true);
  h.updateGoogleEvent.mockResolvedValue(true);
  h.deleteEventThrough.mockResolvedValue({ externalOk: true });
  h.updateEventThrough.mockResolvedValue({ externalOk: true });
  h.findCalendarConnection.mockResolvedValue({
    id: 'conn',
    userId: 'u_1',
    toolkit: 'googlecalendar',
  });
});

describe('dropTourCalendarArtifacts', () => {
  it('deletes the legacy GCal event AND the Composio mirror', async () => {
    await dropTourCalendarArtifacts({
      spaceId: 's_1',
      tourId: 't_1',
      googleEventId: 'gcal_1',
    });

    expect(h.deleteGoogleEvent).toHaveBeenCalledWith({
      spaceId: 's_1',
      googleEventId: 'gcal_1',
    });
    expect(h.deleteEventThrough).toHaveBeenCalledWith({
      spaceId: 's_1',
      connection: expect.objectContaining({ id: 'conn' }),
      sourceTourId: 't_1',
    });
  });

  it('still drops the Composio event when there is no legacy id', async () => {
    await dropTourCalendarArtifacts({ spaceId: 's_1', tourId: 't_1' });
    expect(h.deleteGoogleEvent).not.toHaveBeenCalled();
    expect(h.deleteEventThrough).toHaveBeenCalledTimes(1);
  });

  it('does not throw when Composio is down', async () => {
    h.deleteEventThrough.mockRejectedValue(new Error('composio down'));
    await expect(
      dropTourCalendarArtifacts({ spaceId: 's_1', tourId: 't_1', googleEventId: 'g' }),
    ).resolves.toBeUndefined();
  });
});

describe('moveTourCalendarArtifacts', () => {
  it('patches the legacy event AND the Composio mirror', async () => {
    await moveTourCalendarArtifacts({
      spaceId: 's_1',
      tourId: 't_1',
      googleEventId: 'gcal_1',
      startsAt: '2026-07-16T18:00:00.000Z',
      endsAt: '2026-07-16T18:30:00.000Z',
    });

    expect(h.updateGoogleEvent).toHaveBeenCalledWith({
      spaceId: 's_1',
      googleEventId: 'gcal_1',
      startsAt: '2026-07-16T18:00:00.000Z',
      endsAt: '2026-07-16T18:30:00.000Z',
    });
    expect(h.updateEventThrough).toHaveBeenCalledWith({
      spaceId: 's_1',
      connection: expect.objectContaining({ id: 'conn' }),
      sourceTourId: 't_1',
      startsAt: '2026-07-16T18:00:00.000Z',
      endsAt: '2026-07-16T18:30:00.000Z',
    });
  });
});
