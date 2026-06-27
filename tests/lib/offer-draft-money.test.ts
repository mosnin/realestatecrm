/**
 * fmtMoney formats the dollar figures the offer-drafting tools inline into a
 * realtor-reviewable draft (offer price, counter, credits). It must show whole
 * USD with thousands separators, round fractional cents away, and emit an empty
 * string for null/undefined so callers can inline it without a stray "$0".
 * Pin those — a misformatted figure in an offer draft is an embarrassing leak.
 */

import { describe, it, expect } from 'vitest';
import { fmtMoney, DRAFT_EXPIRY_DAYS } from '@/lib/ai-tools/tools/offer-draft-shared';

describe('fmtMoney', () => {
  it('returns an empty string for null / undefined', () => {
    expect(fmtMoney(null)).toBe('');
    expect(fmtMoney(undefined)).toBe('');
  });

  it('formats whole USD with thousands separators', () => {
    expect(fmtMoney(0)).toBe('$0');
    expect(fmtMoney(500000)).toBe('$500,000');
    expect(fmtMoney(1250000)).toBe('$1,250,000');
  });

  it('rounds away fractional cents (whole dollars only)', () => {
    expect(fmtMoney(1234.56)).toBe('$1,235');
    expect(fmtMoney(99.4)).toBe('$99');
  });

  it('formats negatives (a credit / concession) with a sign', () => {
    expect(fmtMoney(-5000)).toBe('-$5,000');
  });
});

describe('DRAFT_EXPIRY_DAYS', () => {
  it('is the 7-day window matching the Python draft path', () => {
    expect(DRAFT_EXPIRY_DAYS).toBe(7);
  });
});
