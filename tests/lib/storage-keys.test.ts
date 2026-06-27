/**
 * The storage key/URL helpers are the single source of truth for object key
 * shapes. buildKey normalizes prefix + segments into a clean key; getPublicUrl
 * percent-encodes a key into a public URL and publicUrlToKey is its inverse
 * (decoding back to the original key). A drift between encode/decode means a
 * stored file can't be located. Pin the round-trip, the encoding of special
 * chars, slash preservation, and the non-matching-URL null.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildKey, getPublicUrl, publicUrlToKey, STORAGE_PREFIXES } from '@/lib/storage';

const ENV = { WASABI_BUCKET: process.env.WASABI_BUCKET, WASABI_PUBLIC_BASE_URL: process.env.WASABI_PUBLIC_BASE_URL };

beforeAll(() => {
  process.env.WASABI_BUCKET = 'test-bucket';
  process.env.WASABI_PUBLIC_BASE_URL = 'https://cdn.example.com';
});
afterAll(() => {
  if (ENV.WASABI_BUCKET === undefined) delete process.env.WASABI_BUCKET;
  else process.env.WASABI_BUCKET = ENV.WASABI_BUCKET;
  if (ENV.WASABI_PUBLIC_BASE_URL === undefined) delete process.env.WASABI_PUBLIC_BASE_URL;
  else process.env.WASABI_PUBLIC_BASE_URL = ENV.WASABI_PUBLIC_BASE_URL;
});

describe('buildKey', () => {
  it('joins the prefix + segments with single slashes, dropping empties', () => {
    expect(buildKey('dealDocuments', 'deal_1', 'offer.pdf')).toBe('deal-documents/deal_1/offer.pdf');
    expect(buildKey('files', '', 'a', '', 'b')).toBe('files/a/b'); // empty segments dropped
    expect(buildKey('studio')).toBe(STORAGE_PREFIXES.studio); // prefix only
  });
});

describe('getPublicUrl <-> publicUrlToKey round-trip', () => {
  it('encodes a key into a URL and decodes it back', () => {
    const key = 'deal-documents/deal_1/offer.pdf';
    const url = getPublicUrl(key);
    expect(url).toBe('https://cdn.example.com/deal-documents/deal_1/offer.pdf');
    expect(publicUrlToKey(url)).toBe(key);
  });

  it('percent-encodes special chars but preserves slashes as hierarchy', () => {
    const key = 'property-photos/123 Main St/front view.jpg';
    const url = getPublicUrl(key);
    expect(url).toContain('123%20Main%20St'); // space encoded
    expect(url).toContain('front%20view.jpg');
    expect(url).not.toContain('%2F'); // slashes NOT encoded
    expect(publicUrlToKey(url)).toBe(key); // decodes back exactly
  });

  it('returns null for a URL that does not match a configured base', () => {
    expect(publicUrlToKey('https://evil.com/deal-documents/x.pdf')).toBeNull();
    expect(publicUrlToKey('not a url')).toBeNull();
  });
});
