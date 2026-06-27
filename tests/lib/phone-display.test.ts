/**
 * formatPhoneDisplay — prettifies STORED US phone numbers for display while
 * passing anything non-US through untouched (so it never mangles an
 * international number the way the as-typed formatter would).
 */

import { describe, it, expect } from 'vitest';
import { formatPhoneDisplay } from '@/lib/utils';

describe('formatPhoneDisplay', () => {
  it('formats a US 10-digit number', () => {
    expect(formatPhoneDisplay('4155550123')).toBe('(415) 555-0123');
  });

  it('formats a US 11-digit (+1) number, incl. E.164', () => {
    expect(formatPhoneDisplay('14155550123')).toBe('+1 (415) 555-0123');
    expect(formatPhoneDisplay('+14155550123')).toBe('+1 (415) 555-0123');
  });

  it('normalizes a messy-but-US number', () => {
    expect(formatPhoneDisplay('(415) 555.0123')).toBe('(415) 555-0123');
  });

  it('passes a non-US / international number through untouched (no mangling)', () => {
    expect(formatPhoneDisplay('+44 20 7123 4567')).toBe('+44 20 7123 4567');
    expect(formatPhoneDisplay('+33 1 23 45 67 89')).toBe('+33 1 23 45 67 89');
  });

  it('leaves an extension or odd shape alone', () => {
    expect(formatPhoneDisplay('415-555-0123 x42')).toBe('415-555-0123 x42');
  });

  it('returns empty for null / blank', () => {
    expect(formatPhoneDisplay(null)).toBe('');
    expect(formatPhoneDisplay(undefined)).toBe('');
    expect(formatPhoneDisplay('   ')).toBe('');
  });
});
