import { describe, expect, it } from 'vitest';
import { toE164 } from '@/lib/phone';

describe('toE164', () => {
  it('normalizes formatted and bare 10-digit US numbers', () => {
    expect(toE164('(415) 555-0123')).toBe('+14155550123');
    expect(toE164('415-555-0123')).toBe('+14155550123');
    expect(toE164('4155550123')).toBe('+14155550123');
  });

  it('does not double-prefix a NANP number that already has the country digit', () => {
    expect(toE164('14155550123')).toBe('+14155550123');
    expect(toE164('1 415 555 0123')).toBe('+14155550123');
    expect(toE164('+1 415 555 0123')).toBe('+14155550123');
    expect(toE164('+14155550123')).toBe('+14155550123');
  });

  it('preserves international numbers that already have +', () => {
    expect(toE164('+442071234567')).toBe('+442071234567');
  });

  it('rejects junk', () => {
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164('12345')).toBeNull();
    expect(toE164('+1234567890123456')).toBeNull();
  });
});
