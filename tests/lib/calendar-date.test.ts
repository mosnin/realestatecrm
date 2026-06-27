/**
 * The calendar date helpers do the wall-clock math the month/week grid renders
 * with (local timezone, no date-fns). The invariants are load-bearing for the
 * grid: localDayKey/parseLocalDayKey round-trip a day, weeks are Sunday-anchored,
 * the month view is always a stable 42-cell (6×7) grid starting on a Sunday, and
 * addDays/addMonths roll over correctly. Constructed from LOCAL components so the
 * assertions hold in any timezone.
 */

import { describe, it, expect } from 'vitest';
import {
  localDayKey,
  parseLocalDayKey,
  startOfLocalDay,
  addDays,
  addMonths,
  startOfWeek,
  startOfMonth,
  monthGridDays,
} from '@/lib/calendar/date';

const d = (y: number, m: number, day: number) => new Date(y, m, day, 9, 30, 0); // 9:30am local

describe('localDayKey / parseLocalDayKey', () => {
  it('formats YYYY-MM-DD zero-padded and round-trips to the same day', () => {
    expect(localDayKey(d(2026, 5, 27))).toBe('2026-06-27'); // month is 0-based -> June
    expect(localDayKey(d(2026, 0, 3))).toBe('2026-01-03'); // padding
    const key = '2026-06-27';
    expect(localDayKey(parseLocalDayKey(key))).toBe(key);
  });

  it('parses to local noon (DST-safe)', () => {
    expect(parseLocalDayKey('2026-03-08').getHours()).toBe(12);
  });
});

describe('startOfLocalDay', () => {
  it('zeroes the time but keeps the calendar day', () => {
    const s = startOfLocalDay(d(2026, 5, 27));
    expect([s.getHours(), s.getMinutes(), s.getSeconds()]).toEqual([0, 0, 0]);
    expect(localDayKey(s)).toBe('2026-06-27');
  });
});

describe('addDays / addMonths', () => {
  it('adds and subtracts days across a month boundary', () => {
    expect(localDayKey(addDays(d(2026, 5, 30), 1))).toBe('2026-07-01');
    expect(localDayKey(addDays(d(2026, 5, 1), -1))).toBe('2026-05-31');
  });

  it('adds months, rolling year overflow', () => {
    expect(localDayKey(startOfMonth(addMonths(d(2026, 11, 15), 1)))).toBe('2027-01-01');
  });

  it('does not mutate its input', () => {
    const base = d(2026, 5, 27);
    const before = base.getTime();
    addDays(base, 5);
    addMonths(base, 5);
    expect(base.getTime()).toBe(before);
  });
});

describe('startOfWeek / monthGridDays', () => {
  it('anchors the week on Sunday', () => {
    expect(startOfWeek(d(2026, 5, 27)).getDay()).toBe(0);
  });

  it('returns a stable 42-cell grid starting on a Sunday that contains the 1st', () => {
    const grid = monthGridDays(d(2026, 5, 15));
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(0); // first cell is a Sunday
    expect(grid.some((g) => localDayKey(g) === '2026-06-01')).toBe(true); // the 1st is in the grid
    // consecutive days, one apart
    expect(localDayKey(addDays(grid[0], 1))).toBe(localDayKey(grid[1]));
  });
});
