/**
 * getClientIp feeds rate-limit keys, so a malformed or oversized value would
 * bloat Redis storage or let an attacker fragment their own limit bucket. Pin
 * the contract: only the FIRST X-Forwarded-For entry is trusted (the proxy-set
 * one), it's trimmed, structurally-valid IPv4/IPv6 pass, and anything missing,
 * oversized, or non-IP collapses to the safe 'unknown' bucket.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getClientIp, checkRateLimit } from '@/lib/rate-limit';

const req = (xff: string | null) => ({
  headers: { get: (name: string) => (name === 'x-forwarded-for' ? xff : null) },
});

describe('getClientIp', () => {
  it('returns a valid IPv4 from the first XFF entry', () => {
    expect(getClientIp(req('203.0.113.7'))).toBe('203.0.113.7');
  });

  it('returns a valid IPv6 address', () => {
    expect(getClientIp(req('2001:db8::1'))).toBe('2001:db8::1');
    expect(getClientIp(req('::1'))).toBe('::1');
  });

  it('uses only the first (proxy-set) entry and trims whitespace', () => {
    expect(getClientIp(req('203.0.113.7, 10.0.0.1, 192.168.1.1'))).toBe('203.0.113.7');
    expect(getClientIp(req('  203.0.113.7  , 10.0.0.1'))).toBe('203.0.113.7');
  });

  it('falls back to "unknown" when the header is missing or empty', () => {
    expect(getClientIp(req(null))).toBe('unknown');
    expect(getClientIp(req(''))).toBe('unknown');
    expect(getClientIp(req('   '))).toBe('unknown');
  });

  it('rejects an oversized value (key-bloat defense)', () => {
    expect(getClientIp(req('1'.repeat(46)))).toBe('unknown');
  });

  it('rejects values that are not structurally an IP', () => {
    expect(getClientIp(req('not-an-ip'))).toBe('unknown');
    expect(getClientIp(req('203.0.113.7; DROP TABLE'))).toBe('unknown');
    expect(getClientIp(req('<script>alert(1)</script>'))).toBe('unknown');
  });
});

// Regression guard for the fail-OPEN bug: when Upstash/KV env vars are absent,
// the no-op redis proxy returns 0 for `incr`, which previously made
// `0 <= max` always true — silently disabling every rate limit. checkRateLimit
// must instead fail CLOSED to the bounded in-memory limiter and actually block.
describe('checkRateLimit fails closed when Redis is unconfigured', () => {
  const savedUrl = process.env.KV_REST_API_URL;
  const savedToken = process.env.KV_REST_API_TOKEN;

  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });
  afterEach(() => {
    if (savedUrl !== undefined) process.env.KV_REST_API_URL = savedUrl;
    if (savedToken !== undefined) process.env.KV_REST_API_TOKEN = savedToken;
  });

  it('allows up to max, then blocks — not allow-all', async () => {
    // Unique key per run so module-level memStore state doesn't bleed between tests.
    const key = `test:fail-closed:${Date.now()}:${Math.random()}`;
    const r1 = await checkRateLimit(key, 2, 60);
    const r2 = await checkRateLimit(key, 2, 60);
    const r3 = await checkRateLimit(key, 2, 60);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false); // would be `true` under the old fail-open bug
  });
});
