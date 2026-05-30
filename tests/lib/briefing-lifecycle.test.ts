import { describe, expect, it } from 'vitest';
import { formatProgress, formatLastOpened, DWELL_MS } from '@/components/chippi/use-brief-lifecycle';

describe('briefing lifecycle — receipt formatting', () => {
  describe('formatProgress', () => {
    it('returns "Quiet today" when there are no cards', () => {
      expect(formatProgress(0, null)).toBe('Quiet today');
    });

    it('singularizes one card', () => {
      expect(formatProgress(1, null)).toBe('1 card');
    });

    it('pluralizes more than one', () => {
      expect(formatProgress(3, null)).toBe('3 cards');
    });

    it('appends "opened" when the realtor has tapped at least one card', () => {
      expect(formatProgress(5, '2026-05-30T07:11:00Z')).toBe('5 cards · opened');
    });

    it("keeps the receipt in the realtor's vocabulary — never enum or product jargon", () => {
      // Guard against drift toward 'acted on', 'actioned', 'engaged', etc.
      // The receipt is one breath of prose; jargon kills it.
      expect(formatProgress(5, '2026-05-30T07:11:00Z')).not.toMatch(
        /acted on|actioned|engaged|interacted/i,
      );
    });
  });

  describe('formatLastOpened', () => {
    it('returns null when seenAt is null', () => {
      expect(formatLastOpened(null)).toBeNull();
    });

    it('formats short local time with a / p suffix', () => {
      // Specific UTC date — local time will vary by test environment TZ
      // but the suffix should always be "a" or "p", never "AM" or "PM".
      const result = formatLastOpened('2026-05-30T13:11:00Z');
      expect(result).not.toBeNull();
      expect(result).not.toMatch(/AM|PM/i);
      expect(result).toMatch(/^[0-9]{1,2}:[0-9]{2}[ap]$/);
    });

    it('returns null for malformed timestamps', () => {
      expect(formatLastOpened('not-a-date')).toBeNull();
    });
  });

  describe('DWELL_MS', () => {
    it('is 60 seconds — the lifecycle agent calibration', () => {
      expect(DWELL_MS).toBe(60_000);
    });
  });
});
