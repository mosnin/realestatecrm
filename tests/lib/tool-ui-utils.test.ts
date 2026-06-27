/**
 * tool-UI display + navigation helpers. formatCount abbreviates big numbers
 * (K/M) for compact chips; getDomain strips www for source labels;
 * resolveSafeNavigationHref picks the FIRST sanitized candidate from a fallback
 * list (so a poisoned primary href degrades to a safe secondary instead of
 * navigating). Pin the thresholds, the www-strip + parse-fail, and the
 * first-safe selection. (formatRelativeTime reads the clock — out of scope.)
 */

import { describe, it, expect } from 'vitest';
import { formatCount, getDomain } from '@/components/tool-ui/shared/utils';
import { resolveSafeNavigationHref } from '@/components/tool-ui/shared/media/safe-navigation';

describe('formatCount', () => {
  it('passes small counts through and abbreviates K / M at the thresholds', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1_000)).toBe('1.0K');
    expect(formatCount(1_500)).toBe('1.5K');
    expect(formatCount(999_999)).toBe('1000.0K'); // just under the M cutoff
    expect(formatCount(1_000_000)).toBe('1.0M');
    expect(formatCount(2_500_000)).toBe('2.5M');
  });
});

describe('getDomain', () => {
  it('returns the hostname with a leading www stripped', () => {
    expect(getDomain('https://www.example.com/path?q=1')).toBe('example.com');
    expect(getDomain('https://sub.example.com')).toBe('sub.example.com');
    expect(getDomain('http://example.com')).toBe('example.com');
  });

  it('returns empty string for an unparseable URL', () => {
    expect(getDomain('not a url')).toBe('');
    expect(getDomain('')).toBe('');
  });
});

describe('resolveSafeNavigationHref', () => {
  it('returns the first candidate that survives sanitizeHref', () => {
    expect(resolveSafeNavigationHref('javascript:alert(1)', '/safe')).toBe('/safe');
    expect(resolveSafeNavigationHref(null, undefined, 'https://x.com')).toBe('https://x.com/');
  });

  it('skips unsafe / nullish candidates and returns undefined when none are safe', () => {
    expect(resolveSafeNavigationHref('//evil.com', 'not a url', null)).toBeUndefined();
    expect(resolveSafeNavigationHref()).toBeUndefined();
  });

  it('prefers an earlier safe candidate over a later one', () => {
    expect(resolveSafeNavigationHref('/first', 'https://second.com')).toBe('/first');
  });
});
