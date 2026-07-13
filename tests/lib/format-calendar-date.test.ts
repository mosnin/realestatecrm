import { afterEach, describe, expect, it } from 'vitest';
import { formatCalendarDateUtc } from '@/lib/formatting';

const originalTimeZone = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTimeZone;
});

describe('formatCalendarDateUtc', () => {
  it('renders the same business date west of UTC as Vercel renders in UTC', () => {
    process.env.TZ = 'America/Los_Angeles';

    expect(formatCalendarDateUtc('2026-04-29')).toBe('Apr 29, 2026');
    expect(formatCalendarDateUtc('2026-04-29T00:00:00.000Z')).toBe('Apr 29, 2026');
  });

  it('uses the standard empty fallback for missing or invalid values', () => {
    expect(formatCalendarDateUtc(null)).toBe('—');
    expect(formatCalendarDateUtc('not-a-date')).toBe('—');
  });
});
