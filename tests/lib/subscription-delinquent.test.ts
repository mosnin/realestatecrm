import { describe, it, expect } from 'vitest';
import {
  canAccessWorkspace,
  hasCurrentSubscription,
  isPremiumAccessBlocked,
  isSubscriptionDelinquent,
} from '@/lib/api-auth';

/**
 * Dunning gate decision: which subscription states pause premium AI. The danger
 * is over-blocking — if 'inactive'/'trialing'/'active' ever slipped into the
 * delinquent set, free, trial, or paying customers would be locked out of the
 * AI. This pins the exact, narrow set that gets gated.
 */
describe('isSubscriptionDelinquent', () => {
  it('gates only a lapsed PAID subscription', () => {
    expect(isSubscriptionDelinquent('past_due')).toBe(true);
    expect(isSubscriptionDelinquent('canceled')).toBe(true);
    expect(isSubscriptionDelinquent('unpaid')).toBe(true);
  });

  it('never gates free / trial / active / unknown', () => {
    expect(isSubscriptionDelinquent('inactive')).toBe(false); // free / never subscribed
    expect(isSubscriptionDelinquent('trialing')).toBe(false);
    expect(isSubscriptionDelinquent('active')).toBe(false);
    expect(isSubscriptionDelinquent(null)).toBe(false);
    expect(isSubscriptionDelinquent(undefined)).toBe(false);
  });
});

describe('period-aware subscription entitlement', () => {
  const now = new Date('2026-07-13T12:00:00.000Z');

  it('accepts current active/trialing periods', () => {
    expect(hasCurrentSubscription('trialing', '2026-07-14T12:00:00.000Z', now)).toBe(true);
    expect(hasCurrentSubscription('active', '2026-07-13T13:00:00.000Z', now)).toBe(true);
  });

  it('rejects expired trials and grants active renewals a one-day webhook grace', () => {
    expect(hasCurrentSubscription('trialing', '2026-07-13T11:59:59.000Z', now)).toBe(false);
    expect(hasCurrentSubscription('active', '2026-07-12T13:00:00.000Z', now)).toBe(true);
    expect(hasCurrentSubscription('active', '2026-07-12T11:59:59.000Z', now)).toBe(false);
  });

  it('fails closed for missing period data and blocks stale premium access', () => {
    expect(hasCurrentSubscription('active', null, now)).toBe(false);
    expect(isPremiumAccessBlocked('trialing', '2026-04-24T21:29:40.000Z', now)).toBe(true);
    expect(isPremiumAccessBlocked('inactive', null, now)).toBe(false);
  });
});

describe('canAccessWorkspace — Free CRM vs lapsed paid', () => {
  const now = new Date('2026-07-13T12:00:00.000Z');

  it('lets never-subscribed Free spaces into the CRM', () => {
    expect(
      canAccessWorkspace({
        status: 'inactive',
        periodEnd: null,
        hasSubscriptionHistory: false,
        now,
      }),
    ).toBe(true);
  });

  it('lets current trial and paid periods in', () => {
    expect(
      canAccessWorkspace({
        status: 'trialing',
        periodEnd: '2026-07-14T12:00:00.000Z',
        hasSubscriptionHistory: true,
        now,
      }),
    ).toBe(true);
    expect(
      canAccessWorkspace({
        status: 'active',
        periodEnd: '2026-08-13T12:00:00.000Z',
        hasSubscriptionHistory: true,
        now,
      }),
    ).toBe(true);
  });

  it('sends a used-trial / canceled paid relationship to billing', () => {
    expect(
      canAccessWorkspace({
        status: 'canceled',
        periodEnd: '2026-07-01T12:00:00.000Z',
        hasSubscriptionHistory: true,
        now,
      }),
    ).toBe(false);
    expect(
      canAccessWorkspace({
        status: 'inactive',
        periodEnd: null,
        hasSubscriptionHistory: true,
        now,
      }),
    ).toBe(false);
  });
});
