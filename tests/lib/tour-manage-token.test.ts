/**
 * generateManageToken mints the 256-bit secret that lets a guest manage their
 * tour without an account, so its entropy is security-relevant. The subtle
 * failure mode is the per-byte hex padding: drop the padStart and a byte like
 * 0x05 renders as "5" not "05", silently shortening the token and shrinking
 * the keyspace. Pin the exact length (64 hex chars), the charset, and that
 * many draws are all full-length and unique.
 */

import { describe, it, expect } from 'vitest';
import { generateManageToken } from '@/lib/tour-booking';

describe('generateManageToken', () => {
  it('is exactly 64 lowercase hex chars (256 bits)', () => {
    const t = generateManageToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps every byte zero-padded — every draw is full length', () => {
    // 500 draws: if padStart were dropped, a low byte would shorten some.
    for (let i = 0; i < 500; i++) {
      expect(generateManageToken()).toHaveLength(64);
    }
  });

  it('does not collide across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateManageToken());
    expect(seen.size).toBe(1000);
  });
});
