/**
 * URL sanitizers — security-sensitive (they gate hrefs and <img src> from
 * user/model-supplied content). These pin that http(s) and same-origin relative
 * paths pass, while javascript:/data:/protocol-relative are blocked.
 */

import { describe, it, expect } from 'vitest';
import { safeHref, safeImageSrc } from '@/lib/utils';

describe('safeHref', () => {
  it('passes http(s) absolute URLs', () => {
    expect(safeHref('https://example.com/x')).toBe('https://example.com/x');
    expect(safeHref('http://example.com')).toBe('http://example.com');
  });

  it('passes same-origin relative paths', () => {
    expect(safeHref('/dashboard')).toBe('/dashboard');
  });

  it('blocks javascript: and data: schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#');
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#');
  });

  it('blocks protocol-relative (off-origin) URLs', () => {
    expect(safeHref('//evil.com')).toBe('#');
    expect(safeHref('  //evil.com')).toBe('#');
  });

  it('returns "#" for null / undefined / blank', () => {
    expect(safeHref(null)).toBe('#');
    expect(safeHref(undefined)).toBe('#');
    expect(safeHref('   ')).toBe('#');
  });

  it('trims surrounding whitespace on a valid URL', () => {
    expect(safeHref('  https://example.com  ')).toBe('https://example.com');
  });
});

describe('safeImageSrc', () => {
  it('passes http(s) and relative image paths', () => {
    expect(safeImageSrc('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(safeImageSrc('/logo.svg')).toBe('/logo.svg');
  });

  it('blocks javascript:, data:, and protocol-relative', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeImageSrc('//evil.com/x.png')).toBeNull();
  });

  it('returns null for null / blank', () => {
    expect(safeImageSrc(null)).toBeNull();
    expect(safeImageSrc('   ')).toBeNull();
  });
});
