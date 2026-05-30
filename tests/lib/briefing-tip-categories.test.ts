import { describe, expect, it } from 'vitest';
import { __tipCategoryInternals } from '@/lib/briefing/tips/tip-categories';

const { computeReplyRate, medianInterArrivalDays, describeFraction, countAsWord } = __tipCategoryInternals;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function iso(daysFromNow: number, hours = 0): string {
  return new Date(Date.now() + daysFromNow * MS_PER_DAY + hours * 60 * 60 * 1000).toISOString();
}

describe('tip categories — computeReplyRate (the receipt math)', () => {
  it('returns zero when there are no sends — the right to say nothing', () => {
    expect(computeReplyRate([], new Map())).toEqual({ rate: 0, sample: 0 });
  });

  it('counts a send as replied when activity lands inside the 72h window', () => {
    const sentAt = iso(-1);
    const activities = new Map([['c1', [iso(-1, 24)]]]); // 24h after send
    const result = computeReplyRate([{ contactId: 'c1', sentAt }], activities);
    expect(result).toEqual({ rate: 100, sample: 1 });
  });

  it('counts a send as NOT replied when activity is outside the 72h window', () => {
    const sentAt = iso(-5);
    const activities = new Map([['c1', [iso(-1)]]]); // 4d after send — too late
    const result = computeReplyRate([{ contactId: 'c1', sentAt }], activities);
    expect(result).toEqual({ rate: 0, sample: 1 });
  });

  it('ignores activity that predates the send — replies must come AFTER', () => {
    const sentAt = iso(-1);
    const activities = new Map([['c1', [iso(-2)]]]); // day before send
    const result = computeReplyRate([{ contactId: 'c1', sentAt }], activities);
    expect(result).toEqual({ rate: 0, sample: 1 });
  });

  it('skips sends with null contactId — uncountable', () => {
    const sentAt = iso(-1);
    const result = computeReplyRate(
      [{ contactId: null, sentAt }, { contactId: 'c1', sentAt }],
      new Map([['c1', [iso(-1, 6)]]]),
    );
    // Only c1 counts; null is skipped entirely.
    expect(result).toEqual({ rate: 100, sample: 1 });
  });

  it('computes mixed rates correctly with rounding', () => {
    const sentAt = iso(-1);
    const sends = [
      { contactId: 'a', sentAt },
      { contactId: 'b', sentAt },
      { contactId: 'c', sentAt },
    ];
    const activities = new Map([['a', [iso(-1, 6)]]]); // only a replied
    expect(computeReplyRate(sends, activities)).toEqual({ rate: 33, sample: 3 });
  });

  it('handles invalid sentAt by returning sample but no reply credit', () => {
    const result = computeReplyRate(
      [{ contactId: 'c1', sentAt: 'not-a-date' }],
      new Map([['c1', [iso(0)]]]),
    );
    // Counted in sample (contactId present) but reply check skipped (NaN sentMs).
    expect(result).toEqual({ rate: 0, sample: 1 });
  });
});

describe('tip categories — medianInterArrivalDays (sample stability)', () => {
  it('returns null for fewer than two arrivals — cannot measure a gap', () => {
    expect(medianInterArrivalDays([])).toBeNull();
    expect(medianInterArrivalDays([iso(-10)])).toBeNull();
  });

  it('computes a single gap correctly with two arrivals', () => {
    const arrivals = [iso(-10), iso(-5)];
    expect(medianInterArrivalDays(arrivals)).toBeCloseTo(5, 1);
  });

  it('returns the middle gap with odd-count gaps', () => {
    // 4 arrivals → 3 gaps of 5, 2, 7 days → sorted 2, 5, 7 → median 5
    const arrivals = [iso(-14), iso(-9), iso(-7), iso(0)];
    expect(medianInterArrivalDays(arrivals)).toBeCloseTo(5, 1);
  });

  it('averages the two middle gaps with even-count gaps', () => {
    // 3 arrivals → 2 gaps of 5, 10 → median = (5+10)/2 = 7.5
    const arrivals = [iso(-15), iso(-10), iso(0)];
    expect(medianInterArrivalDays(arrivals)).toBeCloseTo(7.5, 1);
  });

  it('order-independent — input list can be unsorted', () => {
    const sorted = [iso(-15), iso(-10), iso(0)];
    const shuffled = [iso(-10), iso(0), iso(-15)];
    expect(medianInterArrivalDays(sorted)).toBeCloseTo(
      medianInterArrivalDays(shuffled) ?? 0,
      3,
    );
  });

  it('drops invalid date strings silently', () => {
    const arrivals = ['not-a-date', iso(-10), iso(-5)];
    expect(medianInterArrivalDays(arrivals)).toBeCloseTo(5, 1);
  });
});

describe('tip categories — small renderers (Chippi voice helpers)', () => {
  it('describeFraction rounds to nearest tenth and renders "N in 10"', () => {
    expect(describeFraction(6, 10)).toBe('6 in 10');
    expect(describeFraction(3, 5)).toBe('6 in 10');
    expect(describeFraction(1, 4)).toBe('3 in 10'); // 0.25 → 2.5 → 3
    expect(describeFraction(0, 0)).toBe('0 in 10'); // empty baseline guard
  });

  it('countAsWord renders 0-10 as title-case words', () => {
    expect(countAsWord(0)).toBe('Zero');
    expect(countAsWord(1)).toBe('One');
    expect(countAsWord(6)).toBe('Six');
    expect(countAsWord(10)).toBe('Ten');
  });

  it('countAsWord falls back to digits above 10', () => {
    expect(countAsWord(11)).toBe('11');
    expect(countAsWord(42)).toBe('42');
  });
});
