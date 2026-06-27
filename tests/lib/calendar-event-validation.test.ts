/**
 * validateCreatePayload is the pure, no-throw gate in front of calendar event
 * creation: it normalizes a loosely-typed request body into {startsAt, endsAt,
 * attendees...} or returns an explanatory error. It guards the realtor's
 * calendar from malformed events — title required/bounded, valid dates/times,
 * end-after-start, all-day rendered as midnight→next-midnight (end EXCLUSIVE),
 * and attendee emails validated + capped. Pin each rejection and each happy path.
 * ISO offset is server-TZ-dependent, so assert the date/time PREFIX, not the offset.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCreatePayload,
  type CreateEventBody,
} from '@/lib/calendar/event-validation';

const timed: CreateEventBody = {
  title: 'Showing at 12 Oak',
  startDate: '2026-07-01',
  startTime: '09:00',
  endDate: '2026-07-01',
  endTime: '10:00',
};

describe('validateCreatePayload — rejections', () => {
  it('requires a non-empty, bounded title', () => {
    expect(validateCreatePayload({ ...timed, title: '   ' })).toEqual({
      ok: false,
      error: 'Title is required.',
    });
    expect(validateCreatePayload({ ...timed, title: 'x'.repeat(251) })).toEqual({
      ok: false,
      error: 'Title too long.',
    });
  });

  it('requires valid start/end dates', () => {
    expect(validateCreatePayload({ ...timed, startDate: '07/01/2026' }).ok).toBe(false);
    expect(validateCreatePayload({ ...timed, endDate: 'nope' })).toEqual({
      ok: false,
      error: 'End date invalid.',
    });
  });

  it('requires valid times and end-after-start for timed events', () => {
    expect(validateCreatePayload({ ...timed, startTime: '9am' })).toEqual({
      ok: false,
      error: 'Start time required.',
    });
    expect(validateCreatePayload({ ...timed, endTime: '08:00' })).toEqual({
      ok: false,
      error: 'End must be after start.',
    });
  });

  it('rejects all-day with end before start', () => {
    expect(
      validateCreatePayload({ title: 'Trip', allDay: true, startDate: '2026-07-05', endDate: '2026-07-01' }),
    ).toEqual({ ok: false, error: 'End date is before start.' });
  });

  it('validates and caps attendees', () => {
    expect(validateCreatePayload({ ...timed, attendees: ['ok@x.com', 'bad'] })).toEqual({
      ok: false,
      error: 'Invalid email: bad',
    });
    expect(validateCreatePayload({ ...timed, attendees: [42] })).toEqual({
      ok: false,
      error: 'Invalid attendee.',
    });
    const tooMany = Array.from({ length: 51 }, (_, i) => `a${i}@x.com`);
    expect(validateCreatePayload({ ...timed, attendees: tooMany })).toEqual({
      ok: false,
      error: 'Too many attendees.',
    });
  });
});

describe('validateCreatePayload — happy paths', () => {
  it('normalizes a timed event (ISO prefix, trimmed title, null description)', () => {
    const result = validateCreatePayload(timed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Showing at 12 Oak');
    expect(result.value.description).toBeNull();
    expect(result.value.allDay).toBe(false);
    expect(result.value.startsAt).toMatch(/^2026-07-01T09:00:00[+-]\d{2}:\d{2}$/);
    expect(result.value.endsAt).toMatch(/^2026-07-01T10:00:00[+-]\d{2}:\d{2}$/);
    expect(result.value.attendees).toEqual([]);
  });

  it('renders an all-day event as midnight → next-day-midnight (end exclusive)', () => {
    const result = validateCreatePayload({
      title: 'Vacation',
      allDay: true,
      startDate: '2026-07-01',
      endDate: '2026-07-01',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.allDay).toBe(true);
    expect(result.value.startsAt).toMatch(/^2026-07-01T00:00:00/);
    expect(result.value.endsAt).toMatch(/^2026-07-02T00:00:00/); // exclusive next day
  });

  it('keeps valid attendees and skips empty strings', () => {
    const result = validateCreatePayload({ ...timed, attendees: ['a@x.com', '  ', 'b@y.com'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attendees).toEqual([{ email: 'a@x.com' }, { email: 'b@y.com' }]);
  });
});
