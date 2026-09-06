import { describe, expect, it } from 'vitest';
import { endOfLocalDay } from '@/lib/calendar/local-day';
describe('Workspace calendar day', () => {
  it.each([
    ['2026-03-08T05:00:00Z', 'America/New_York', '2026-03-09T03:59:59.999Z'],
    ['2026-11-01T04:00:00Z', 'America/New_York', '2026-11-02T04:59:59.999Z'],
    ['2026-09-06T23:00:00Z', 'America/Los_Angeles', '2026-09-07T06:59:59.999Z'],
    ['2026-09-06T17:00:00Z', 'Asia/Kolkata', '2026-09-06T18:29:59.999Z'],
  ])('keeps %s in the correct day for %s', (now, zone, end) => {
    expect(endOfLocalDay(new Date(now), zone).toISOString()).toBe(end);
  });
});
