/**
 * isoFromLocal / weekDays close out the calendar date helpers. isoFromLocal is
 * what makes a Google Calendar event land on the wall-clock the realtor picked
 * (not UTC) — it must emit the exact date+time the form supplied plus a
 * correctly-signed local timezone offset. weekDays returns the 7 consecutive
 * Sunday-anchored days the week view renders. Pin both; the assertions derive
 * the expected offset from the same clock so they hold in any timezone.
 */

import { describe, it, expect } from 'vitest';
import { isoFromLocal, weekDays, localDayKey, allDayDate } from '@/lib/calendar/date';

describe('isoFromLocal', () => {
  it('preserves the exact wall-clock date + time the form supplied', () => {
    expect(isoFromLocal('2026-06-27', '14:30')).toMatch(/^2026-06-27T14:30:00[+-]\d{2}:\d{2}$/);
  });

  it('appends the machine-local timezone offset (correctly signed)', () => {
    const iso = isoFromLocal('2026-06-27', '09:05');
    // Derive the expected offset from the same local instant
    const local = new Date(2026, 5, 27, 9, 5, 0, 0);
    const offsetMin = -local.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    const expectedOffset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
    expect(iso).toBe(`2026-06-27T09:05:00${expectedOffset}`);
  });

  it('zero-pads single-digit month/day/hour/minute', () => {
    expect(isoFromLocal('2026-01-03', '08:07')).toMatch(/^2026-01-03T08:07:00/);
  });
});

describe('allDayDate', () => {
  it('passes the date-only string through (Google all-day shape)', () => {
    expect(allDayDate('2026-06-27')).toBe('2026-06-27');
  });
});

describe('weekDays', () => {
  it('returns 7 consecutive days starting on the Sunday of that week', () => {
    const days = weekDays(new Date(2026, 5, 27, 10, 0, 0)); // a Saturday
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(0); // Sunday
    expect(days[6].getDay()).toBe(6); // Saturday
    for (let i = 1; i < 7; i++) {
      expect(localDayKey(days[i])).toBe(localDayKey(new Date(days[i - 1].getFullYear(), days[i - 1].getMonth(), days[i - 1].getDate() + 1)));
    }
    // the input day is somewhere in the returned week
    expect(days.some((d) => localDayKey(d) === '2026-06-27')).toBe(true);
  });
});
