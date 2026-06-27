/**
 * sanitizeHref guards every href the tool-UI renders from model/tool output.
 * It allows same-origin relative links (path / ./ / ../ / ? / #) and absolute
 * http(s) URLs, and rejects everything else: protocol-relative //evil.com,
 * control-char injection, javascript:/data:/mailto:/ftp: schemes, and junk.
 * Pin the allow + deny sets — a regression here is a clickable XSS/phishing sink.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHref } from '@/components/tool-ui/shared/media/sanitize-href';

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

describe('sanitizeHref', () => {
  it('returns undefined for empty / whitespace / missing', () => {
    expect(sanitizeHref(undefined)).toBeUndefined();
    expect(sanitizeHref('')).toBeUndefined();
    expect(sanitizeHref('   ')).toBeUndefined();
  });

  it('allows same-origin relative links', () => {
    expect(sanitizeHref('/leads')).toBe('/leads');
    expect(sanitizeHref('./x')).toBe('./x');
    expect(sanitizeHref('../up')).toBe('../up');
    expect(sanitizeHref('?q=1')).toBe('?q=1');
    expect(sanitizeHref('#section')).toBe('#section');
  });

  it('rejects protocol-relative URLs (//evil.com)', () => {
    expect(sanitizeHref('//evil.com')).toBeUndefined();
  });

  it('rejects control-character injection in a relative href', () => {
    expect(sanitizeHref('/ok' + NUL + 'evil')).toBeUndefined();
    expect(sanitizeHref('/tab' + TAB + 'here')).toBeUndefined();
  });

  it('allows http and https absolute URLs (normalized)', () => {
    expect(sanitizeHref('https://example.com/path')).toBe('https://example.com/path');
    expect(sanitizeHref('http://example.com')).toBe('http://example.com/');
  });

  it('rejects dangerous + non-web schemes', () => {
    expect(sanitizeHref('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeHref('data:text/html,<script>')).toBeUndefined();
    expect(sanitizeHref('mailto:a@b.com')).toBeUndefined();
    expect(sanitizeHref('ftp://host/file')).toBeUndefined();
    expect(sanitizeHref('not a url')).toBeUndefined();
  });
});
