/**
 * Unit tests for the admin subscription money-mapping (lib/billing/
 * admin-subscription.ts) — the PURE helpers that decide which Stripe price a
 * plan change resolves to and which DB fields we mirror afterward.
 *
 * These lock in that:
 *   - planChangePriceId maps each plan + cadence to the configured Stripe price
 *     (and returns null when unconfigured — caller must refuse, never guess);
 *   - findBasePlanItem picks the BASE plan line item (skipping the per-seat
 *     add-on) regardless of item order, and reports its cadence;
 *   - space/brokerage DB-field mappers match the webhook's reconcile (plan,
 *     planActivatedAt, and seatLimit for brokerages);
 *   - planChangeItems swaps only the named base item's price;
 *   - trialEndUnixInDays produces the right future unix timestamp for comps.
 */

import { describe, it, expect, vi } from 'vitest';

// lib/plans reads price ids at module load — set them before any import so the
// PLANS map has real ids to map against.
vi.hoisted(() => {
  process.env.STRIPE_PRICE_SOLO = 'price_solo_m';
  process.env.STRIPE_PRICE_SOLO_ANNUAL = 'price_solo_y';
  process.env.STRIPE_PRICE_PRO = 'price_pro_m';
  process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_pro_y';
  process.env.STRIPE_PRICE_TEAM = 'price_team_m';
  process.env.STRIPE_PRICE_TEAM_ANNUAL = 'price_team_y';
  process.env.STRIPE_PRICE_TEAM_PLUS = 'price_team_plus_m';
  process.env.STRIPE_PRICE_TEAM_ADDON = 'price_team_addon_m';
});

import {
  planChangePriceId,
  findBasePlanItem,
  spacePlanDbFields,
  brokeragePlanDbFields,
  seatLimitForPlan,
  planChangeItems,
  trialEndUnixInDays,
} from '@/lib/billing/admin-subscription';

function sub(items: Array<{ id: string; priceId: string }>): any {
  return { id: 'sub_1', items: { data: items.map((it) => ({ id: it.id, price: { id: it.priceId } })) } };
}

describe('planChangePriceId — plan + cadence → Stripe price (Fix #2)', () => {
  it('maps space tiers monthly + annual', () => {
    expect(planChangePriceId('solo', 'monthly')).toBe('price_solo_m');
    expect(planChangePriceId('solo', 'annual')).toBe('price_solo_y');
    expect(planChangePriceId('pro', 'monthly')).toBe('price_pro_m');
    expect(planChangePriceId('pro', 'annual')).toBe('price_pro_y');
  });

  it('maps brokerage tiers', () => {
    expect(planChangePriceId('team', 'monthly')).toBe('price_team_m');
    expect(planChangePriceId('team', 'annual')).toBe('price_team_y');
    expect(planChangePriceId('team_plus', 'monthly')).toBe('price_team_plus_m');
  });

  it('returns null when the price for a cadence is not configured (never guess)', () => {
    // team_plus annual env was not set above.
    expect(planChangePriceId('team_plus', 'annual')).toBeNull();
    // free has no price at all.
    expect(planChangePriceId('free', 'monthly')).toBeNull();
  });
});

describe('findBasePlanItem — picks the base plan item, ignores the add-on', () => {
  it('finds the base item + cadence when it is the only item', () => {
    const res = findBasePlanItem(sub([{ id: 'si_base', priceId: 'price_pro_m' }]));
    expect(res).not.toBeNull();
    expect(res!.item.id).toBe('si_base');
    expect(res!.plan).toBe('pro');
    expect(res!.cadence).toBe('monthly');
  });

  it('skips the per-seat add-on line and resolves the base regardless of order', () => {
    // Add-on FIRST, base SECOND — must still resolve the base (team).
    const res = findBasePlanItem(
      sub([
        { id: 'si_addon', priceId: 'price_team_addon_m' },
        { id: 'si_base', priceId: 'price_team_m' },
      ]),
    );
    expect(res!.item.id).toBe('si_base');
    expect(res!.plan).toBe('team');
  });

  it('detects annual cadence from the base price', () => {
    const res = findBasePlanItem(sub([{ id: 'si_base', priceId: 'price_solo_y' }]));
    expect(res!.cadence).toBe('annual');
  });

  it('returns null when no item maps to a configured base price', () => {
    expect(findBasePlanItem(sub([{ id: 'si_x', priceId: 'price_unknown' }]))).toBeNull();
  });
});

describe('DB-field mappers mirror the webhook reconcile', () => {
  const now = new Date('2026-06-17T12:00:00.000Z');

  it('space → plan + planActivatedAt', () => {
    expect(spacePlanDbFields('pro', now)).toEqual({ plan: 'pro', planActivatedAt: now.toISOString() });
  });

  it('brokerage → plan + seatLimit + planActivatedAt (team=5, team_plus=10)', () => {
    expect(brokeragePlanDbFields('team', now)).toEqual({ plan: 'team', seatLimit: 5, planActivatedAt: now.toISOString() });
    expect(brokeragePlanDbFields('team_plus', now)).toEqual({ plan: 'team_plus', seatLimit: 10, planActivatedAt: now.toISOString() });
  });

  it('seatLimitForPlan returns null for non-brokerage plans', () => {
    expect(seatLimitForPlan('solo')).toBeNull();
    expect(seatLimitForPlan(null)).toBeNull();
    expect(seatLimitForPlan('team')).toBe(5);
  });
});

describe('planChangeItems — swaps only the named base item', () => {
  it('produces a single item update referencing the base item id + new price', () => {
    expect(planChangeItems('si_base', 'price_pro_m')).toEqual([{ id: 'si_base', price: 'price_pro_m' }]);
  });
});

describe('trialEndUnixInDays — comp trial_end (Fix #1)', () => {
  it('returns a unix-seconds timestamp `days` in the future', () => {
    const now = new Date('2026-06-17T00:00:00.000Z');
    const ts = trialEndUnixInDays(30, now);
    expect(ts).toBe(Math.floor(now.getTime() / 1000) + 30 * 86400);
  });

  it('supports a 1-year comp', () => {
    const now = new Date('2026-06-17T00:00:00.000Z');
    const ts = trialEndUnixInDays(365, now);
    expect(ts).toBe(Math.floor(now.getTime() / 1000) + 365 * 86400);
  });
});
