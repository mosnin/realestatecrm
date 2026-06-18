/**
 * Admin subscription helpers — the money-mapping for platform-admin billing
 * actions (plan change, comp, cancel), kept PURE + unit-tested so the Stripe
 * price a plan resolves to (and the DB fields we mirror) can never silently
 * drift from the webhook's reconcile.
 *
 * WHY this exists: plan is a REAL DB column (Space.plan free|solo|pro,
 * Brokerage.plan starter|team|team_plus|enterprise) that the Stripe webhook
 * reconciles FROM the live subscription price (planFromPriceId). So any admin
 * billing change MUST move the Stripe subscription first; if we only wrote the
 * DB, the next webhook would overwrite it. These helpers compute the EXACT same
 * mapping the webhook uses (lib/plans.planFromPriceId + the seatLimit map) so
 * the DB mirror we write after the Stripe call agrees with what the next webhook
 * would write.
 */

import Stripe from 'stripe';
import { PLANS, type PlanId } from '@/lib/plans';

/** Billing cadence for a subscription item's price. */
export type Cadence = 'monthly' | 'annual';

/** Plans an admin can switch a SPACE between (self-serve realtor tiers). */
export const SPACE_PLAN_CHANGE_IDS = ['solo', 'pro'] as const;
export type SpacePlanChangeId = (typeof SPACE_PLAN_CHANGE_IDS)[number];

/** Plans an admin can switch a BROKERAGE between. */
export const BROKERAGE_PLAN_CHANGE_IDS = ['team', 'team_plus'] as const;
export type BrokeragePlanChangeId = (typeof BROKERAGE_PLAN_CHANGE_IDS)[number];

export function isSpacePlanChangeId(v: unknown): v is SpacePlanChangeId {
  return v === 'solo' || v === 'pro';
}
export function isBrokeragePlanChangeId(v: unknown): v is BrokeragePlanChangeId {
  return v === 'team' || v === 'team_plus';
}

/**
 * The Stripe BASE price id for a target plan + cadence, read from the single
 * source of truth (lib/plans.PLANS). Pure (prices injected via PLANS at module
 * load) so it's unit-testable and matches checkout / the webhook exactly.
 * Returns null when the env price isn't configured — the caller must refuse the
 * change rather than guess (mirrors checkout's "no fake annual" rule).
 */
export function planChangePriceId(plan: PlanId, cadence: Cadence): string | null {
  const def = PLANS[plan];
  if (!def) return null;
  return cadence === 'annual' ? def.stripePriceAnnual : def.stripePriceMonthly;
}

/**
 * Find the subscription's BASE plan line item (the one whose price maps to a
 * configured plan via PLANS) — NOT the per-seat add-on. Returns the Stripe
 * subscription item plus the detected cadence, or null when no item matches a
 * configured base price (env not wired / legacy sub). We scan ALL items so the
 * add-on line (which never matches a base price) is skipped regardless of order,
 * exactly like the webhook's planFromSubscriptionItems.
 */
export function findBasePlanItem(
  sub: Stripe.Subscription,
): { item: Stripe.SubscriptionItem; plan: PlanId; cadence: Cadence } | null {
  for (const item of sub.items?.data ?? []) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    for (const p of Object.values(PLANS)) {
      if (p.stripePriceMonthly && p.stripePriceMonthly === priceId) {
        return { item, plan: p.id, cadence: 'monthly' };
      }
      if (p.stripePriceAnnual && p.stripePriceAnnual === priceId) {
        return { item, plan: p.id, cadence: 'annual' };
      }
    }
  }
  return null;
}

/**
 * Map a brokerage plan → seat limit, from PLANS (team = 5, team_plus = 10).
 * Mirrors the webhook's seatLimitForPlan so an admin plan change writes the same
 * seatLimit the next webhook would. Unknown plans → null (no cap).
 */
export function seatLimitForPlan(plan: string | null | undefined): number | null {
  if (plan === 'team' || plan === 'team_plus') return PLANS[plan].includedUsers;
  return null;
}

/**
 * The DB columns to mirror on a Space after moving its Stripe subscription to
 * `plan`. Matches what the webhook writes on a plan change (plan +
 * planActivatedAt). Pure (now injected) so it's testable.
 */
export function spacePlanDbFields(
  plan: SpacePlanChangeId,
  now: Date = new Date(),
): { plan: SpacePlanChangeId; planActivatedAt: string } {
  return { plan, planActivatedAt: now.toISOString() };
}

/**
 * The DB columns to mirror on a Brokerage after moving its Stripe subscription
 * to `plan`. Matches the webhook (plan + seatLimit + planActivatedAt). Pure.
 */
export function brokeragePlanDbFields(
  plan: BrokeragePlanChangeId,
  now: Date = new Date(),
): { plan: BrokeragePlanChangeId; seatLimit: number | null; planActivatedAt: string } {
  return { plan, seatLimit: seatLimitForPlan(plan), planActivatedAt: now.toISOString() };
}

/**
 * Build the Stripe `subscriptions.update` items array for a plan change: swap the
 * BASE item's price to `newPriceId`, leaving every other line (e.g. the per-seat
 * add-on) untouched. Stripe replaces only the line we name by item id.
 */
export function planChangeItems(
  baseItemId: string,
  newPriceId: string,
): Stripe.SubscriptionUpdateParams.Item[] {
  return [{ id: baseItemId, price: newPriceId }];
}

/**
 * A unix-seconds `trial_end` exactly `days` in the future from `now`. Used by
 * the comp flow: setting a Stripe subscription's trial_end to a real future date
 * is the mechanism that makes Stripe AND our DB agree the customer isn't billed
 * until then (the previous code wrote a far-future period to the DB only, which
 * Stripe never honored → surprise re-bill).
 */
export function trialEndUnixInDays(days: number, now: Date = new Date()): number {
  const ms = now.getTime() + days * 24 * 60 * 60 * 1000;
  return Math.floor(ms / 1000);
}
