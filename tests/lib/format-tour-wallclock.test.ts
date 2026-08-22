/**
 * Guest-facing tour times must render in the workspace timezone, not the
 * serverless host TZ (UTC on Vercel). A 18:00Z slot in America/New_York
 * (EDT, UTC-4) is 2:00 PM — not 6:00 PM.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOUR_TIMEZONE,
  formatTourDate,
  formatTourShortDate,
  formatTourTime,
  resolveTourTimezone,
} from '@/lib/tours/format-wallclock';

const SLOT = '2026-07-15T18:00:00.000Z'; // 2:00 PM EDT

describe('formatTourTime / formatTourDate', () => {
  it('renders a New York summer slot as 2:00 PM, not UTC 6:00 PM', () => {
    expect(formatTourTime(SLOT, 'America/New_York')).toBe('2:00 PM');
    expect(formatTourShortDate(SLOT, 'America/New_York')).toBe('Jul 15');
    expect(formatTourDate(SLOT, 'America/New_York')).toMatch(/Wednesday, July 15, 2026/);
  });

  it('renders the same instant as 11:00 AM in Los Angeles', () => {
    expect(formatTourTime(SLOT, 'America/Los_Angeles')).toBe('11:00 AM');
  });

  it('falls back to America/New_York for missing or invalid timezones', () => {
    expect(resolveTourTimezone(null)).toBe(DEFAULT_TOUR_TIMEZONE);
    expect(resolveTourTimezone('Not/AZone')).toBe(DEFAULT_TOUR_TIMEZONE);
    expect(formatTourTime(SLOT, 'Not/AZone')).toBe(formatTourTime(SLOT, 'America/New_York'));
  });
});
