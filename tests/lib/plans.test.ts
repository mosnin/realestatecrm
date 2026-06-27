/**
 * Billing plan helpers. These are the single source of truth shared by the
 * server gates (checkout/credits) and the UI, so a drift mis-bills or mis-gates
 * a customer. Pin the env-independent ones exactly, and the env-dependent
 * Stripe lookups at least for their never-falsely-match guards.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveSelfServePlan,
  canBuyTopups,
  creditsForCostUsd,
  addonSeatsForPlan,
  planFromPriceId,
  planIdForStripePrice,
  CREDIT_COGS_BUDGET_USD,
} from '@/lib/plans';

describe('resolveSelfServePlan', () => {
  it('maps only "pro" to pro; everything else floors to solo', () => {
    expect(resolveSelfServePlan('pro')).toBe('pro');
    expect(resolveSelfServePlan('solo')).toBe('solo');
    expect(resolveSelfServePlan('team')).toBe('solo');
    expect(resolveSelfServePlan(null)).toBe('solo');
    expect(resolveSelfServePlan(undefined)).toBe('solo');
    expect(resolveSelfServePlan('garbage')).toBe('solo');
  });
});

describe('canBuyTopups', () => {
  it('allows every paid tier and blocks free / unknown', () => {
    for (const p of ['solo', 'pro', 'team', 'team_plus']) expect(canBuyTopups(p)).toBe(true);
    expect(canBuyTopups('free')).toBe(false);
    expect(canBuyTopups(null)).toBe(false);
    expect(canBuyTopups(undefined)).toBe(false);
    expect(canBuyTopups('enterprise')).toBe(false);
  });
});

describe('creditsForCostUsd', () => {
  it('floors at 1 credit even for a near-free or non-positive turn', () => {
    expect(creditsForCostUsd(0)).toBe(1);
    expect(creditsForCostUsd(-5)).toBe(1);
    expect(creditsForCostUsd(0.0000001)).toBe(1);
  });

  it('charges ceil(cost / budget) once cost exceeds one budget unit', () => {
    expect(creditsForCostUsd(CREDIT_COGS_BUDGET_USD)).toBe(1); // exactly one unit
    expect(creditsForCostUsd(CREDIT_COGS_BUDGET_USD + 0.0001)).toBe(2); // just over -> ceil
    expect(creditsForCostUsd(CREDIT_COGS_BUDGET_USD * 3)).toBe(3);
  });
});

describe('addonSeatsForPlan robustness', () => {
  it('returns 0 for plans without an add-on path, unknown, or null plan', () => {
    expect(addonSeatsForPlan('free', 100)).toBe(0);
    expect(addonSeatsForPlan('solo', 100)).toBe(0);
    expect(addonSeatsForPlan('nope', 100)).toBe(0);
    expect(addonSeatsForPlan(null, 100)).toBe(0);
    expect(addonSeatsForPlan(undefined, 100)).toBe(0);
  });

  it('never goes negative and floors a fractional seat count', () => {
    // Independent of the plan's includedUsers value: 0 seats can't be negative,
    // and a fractional count rounds down to the same integer result.
    expect(addonSeatsForPlan('team', 0)).toBe(0);
    expect(addonSeatsForPlan('team', 2.9)).toBe(addonSeatsForPlan('team', 2));
    expect(addonSeatsForPlan('team', NaN)).toBe(0);
    expect(addonSeatsForPlan('team', -3)).toBe(0);
  });
});

describe('Stripe price reverse-lookup guards', () => {
  it('returns null for empty/missing ids (never matches an unconfigured null price)', () => {
    expect(planFromPriceId(null)).toBeNull();
    expect(planFromPriceId(undefined)).toBeNull();
    expect(planFromPriceId('')).toBeNull();
    expect(planIdForStripePrice(null)).toBeNull();
  });

  it('returns null for an unknown price id', () => {
    expect(planFromPriceId('price_totally_unknown')).toBeNull();
    expect(planIdForStripePrice('price_totally_unknown')).toBeNull();
  });
});
