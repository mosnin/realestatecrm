import { describe, it, expect } from 'vitest';
import { isCompActive } from '@/lib/billing/comp';

/**
 * The pure "is comp currently active?" rule that the access gates, plan resolver,
 * and credit meter all share. (DB lookups are covered by the route/integration
 * tests; here we lock the decision logic.)
 */
describe('isCompActive', () => {
  it('is false unless compAccess is strictly boolean true', () => {
    expect(isCompActive(false, null)).toBe(false);
    expect(isCompActive(undefined, null)).toBe(false);
    expect(isCompActive(null, null)).toBe(false);
    expect(isCompActive(0, null)).toBe(false);
    expect(isCompActive('true', null)).toBe(false);
  });

  it('is true when granted with no expiry', () => {
    expect(isCompActive(true, null)).toBe(true);
    expect(isCompActive(true, undefined)).toBe(true);
  });

  it('honors a future expiry (active) and a past expiry (inactive)', () => {
    expect(isCompActive(true, new Date(Date.now() + 60_000).toISOString())).toBe(true);
    expect(isCompActive(true, new Date(Date.now() - 60_000).toISOString())).toBe(false);
  });

  it('accepts a Date object as well as an ISO string', () => {
    expect(isCompActive(true, new Date(Date.now() + 60_000))).toBe(true);
    expect(isCompActive(true, new Date(Date.now() - 60_000))).toBe(false);
  });

  it('treats an unparseable expiry as no-expiry (granted wins)', () => {
    expect(isCompActive(true, 'not-a-date')).toBe(true);
  });
});
