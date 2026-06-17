import { describe, it, expect } from 'vitest';
import { formatPhoneAsTyped } from '@/lib/utils';

describe('formatPhoneAsTyped', () => {
  it('returns empty string for empty input', () => {
    expect(formatPhoneAsTyped('')).toBe('');
    expect(formatPhoneAsTyped('abc')).toBe('');
  });

  it('formats progressively as digits arrive', () => {
    expect(formatPhoneAsTyped('5')).toBe('(5');
    expect(formatPhoneAsTyped('512')).toBe('(512');
    expect(formatPhoneAsTyped('5125')).toBe('(512) 5');
    expect(formatPhoneAsTyped('512555')).toBe('(512) 555');
    expect(formatPhoneAsTyped('5125550')).toBe('(512) 555-0');
  });

  it('formats a full 10-digit US number', () => {
    expect(formatPhoneAsTyped('5125550100')).toBe('(512) 555-0100');
  });

  it('formats an 11-digit number with country code', () => {
    expect(formatPhoneAsTyped('15125550100')).toBe('+1 (512) 555-0100');
  });

  it('strips non-digit characters before formatting', () => {
    expect(formatPhoneAsTyped('(512) 555-0100')).toBe('(512) 555-0100');
    expect(formatPhoneAsTyped('512.555.0100')).toBe('(512) 555-0100');
  });

  it('caps at 11 digits', () => {
    expect(formatPhoneAsTyped('151255501009999')).toBe('+1 (512) 555-0100');
  });

  it('is idempotent — re-formatting an already-formatted value is stable', () => {
    const once = formatPhoneAsTyped('5125550100');
    expect(formatPhoneAsTyped(once)).toBe(once);
  });
});
