import { describe, expect, it } from 'vitest';
import { normalizeBrowserUrl, browserUrlStorageKey } from '@/components/chippi/browser-url';

describe('normalizeBrowserUrl', () => {
  it('passes through full http(s) URLs, preserving path and query', () => {
    expect(normalizeBrowserUrl('https://example.com/listings?page=2')).toBe(
      'https://example.com/listings?page=2',
    );
    expect(normalizeBrowserUrl('http://example.com')).toBe('http://example.com/');
  });

  it('prepends https:// when no scheme is given', () => {
    expect(normalizeBrowserUrl('example.com')).toBe('https://example.com/');
    expect(normalizeBrowserUrl('www.zillow.com/homes')).toBe('https://www.zillow.com/homes');
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeBrowserUrl('  example.com  ')).toBe('https://example.com/');
  });

  it('treats host:port input as a host, not a scheme', () => {
    expect(normalizeBrowserUrl('localhost:3000')).toBe('https://localhost:3000/');
    expect(normalizeBrowserUrl('example.com:8080/admin')).toBe('https://example.com:8080/admin');
  });

  it('rejects javascript: and data: schemes outright, in any casing', () => {
    expect(normalizeBrowserUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeBrowserUrl('JavaScript:alert(1)')).toBeNull();
    expect(normalizeBrowserUrl('  javascript:alert(1)')).toBeNull();
    expect(normalizeBrowserUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(normalizeBrowserUrl('DATA:text/html,x')).toBeNull();
  });

  it('rejects every other non-http(s) scheme', () => {
    expect(normalizeBrowserUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeBrowserUrl('vbscript:msgbox(1)')).toBeNull();
    expect(normalizeBrowserUrl('about:blank')).toBeNull();
    expect(normalizeBrowserUrl('blob:https://example.com/uuid')).toBeNull();
    expect(normalizeBrowserUrl('mailto:someone@example.com')).toBeNull();
    expect(normalizeBrowserUrl('ftp://example.com/file')).toBeNull();
  });

  it('rejects empty, whitespace-only, and implausible-host input', () => {
    expect(normalizeBrowserUrl('')).toBeNull();
    expect(normalizeBrowserUrl('   ')).toBeNull();
    expect(normalizeBrowserUrl('hello')).toBeNull();
    expect(normalizeBrowserUrl('hello world')).toBeNull();
  });

  it('allows localhost as a bare host despite having no dot', () => {
    expect(normalizeBrowserUrl('localhost')).toBe('https://localhost/');
    expect(normalizeBrowserUrl('http://localhost:8787/dev')).toBe('http://localhost:8787/dev');
  });
});

describe('browserUrlStorageKey', () => {
  it('scopes the persisted URL per space slug', () => {
    expect(browserUrlStorageKey('acme')).toBe('chippi-browser-url:acme');
    expect(browserUrlStorageKey('acme')).not.toBe(browserUrlStorageKey('other'));
  });
});
