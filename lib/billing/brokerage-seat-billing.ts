/**
 * Brokerage per-seat billing (Fix #1).
 *
 * The brokerage subscription is billed as a FLAT base bundle plus a separate
 * PER-UNIT add-on line item for seats above the plan's includedUsers:
 *
 *   base item  — STRIPE_PRICE_TEAM / STRIPE_PRICE_TEAM_PLUS ($497 / $897 flat).
 *                Quantity is ALWAYS 1: it's the bundle price, NOT per-seat.
 *   addon item — STRIPE_PRICE_TEAM_ADDON / STRIPE_PRICE_TEAM_PLUS_ADDON
 *                ($79 / $69 per seat). Quantity = active members − includedUsers.
 *
 * This module keeps the add-on item's quantity in lockstep with the active
 * BrokerageMembership count whenever a member is added (join / invite-accept) or
 * removed (offboard / delete), and seeds it at checkout.
 *
 * IMPORTANT (Stripe price-config dependency): the base price is configured as a
 * FLAT bundle, so we must NOT set the base item's quantity to the seat count —
 * that would bill $497 × N. Per-seat money only works once a SEPARATE per-unit
 * add-on price object exists in Stripe and its id is wired to
 * STRIPE_PRICE_TEAM_ADDON / STRIPE_PRICE_TEAM_PLUS_ADDON. Until then this
 * helper no-ops the add-on item and logs a single warning (the seat COUNT is
 * still capped by checkSeatCapacity; only the incremental CHARGE is deferred).
 */

import Stripe from 'stripe';
import { supabase } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import { PLANS, addonSeatsForPlan, type PlanId } from '@/lib/plans';

/** Brokerage plans that carry a per-seat add-on. */
function isBrokeragePlan(plan: string | null | undefined): plan is 'team' | 'team_plus' {
  return plan === 'team' || plan === 'team_plus';
}

/**
 * Resolve the add-on (per-unit) Stripe price id for a plan, picking the
 * monthly or annual variant to match the subscription's base price cadence.
 * Returns null when no add-on price is configured for this env (the flagged
 * price-config dependency) — callers then no-op the seat charge.
 */
function addonPriceIdForPlan(plan: 'team' | 'team_plus', baseIsAnnual: boolean): string | null {
  const addUser = PLANS[plan].addUser;
  if (!addUser) return null;
  return baseIsAnnual ? addUser.stripePriceAnnual : addUser.stripePriceMonthly;
}

/** Is this price id the ANNUAL variant of any plan's base price? Used to keep
 *  the add-on cadence aligned with the base item. */
function priceIsAnnualBase(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  for (const p of Object.values(PLANS)) {
    if (p.stripePriceAnnual && p.stripePriceAnnual === priceId) return true;
  }
  return false;
}

/** Count active members (BrokerageMembership rows) for a brokerage. Returns
 *  null on infra error so the caller can skip rather than send a wrong (e.g. 0)
 *  quantity to Stripe and accidentally credit the customer a removed seat. */
async function countMembers(brokerageId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('BrokerageMembership')
      .select('*', { count: 'exact', head: true })
      .eq('brokerageId', brokerageId);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export interface SeatSyncResult {
  /** 'updated' when a Stripe write happened; 'noop' when nothing needed doing;
   *  'skipped' when we deliberately did not act (no active sub, no add-on price,
   *  infra error). Never throws — seat sync must not break member add/remove. */
  status: 'updated' | 'noop' | 'skipped';
  reason?: string;
  /** The add-on quantity we converged the subscription to (when known). */
  addonQuantity?: number;
}

/**
 * Sync a brokerage subscription's per-seat add-on quantity to its current
 * active member count. Best-effort + idempotent: re-running with the same member
 * count is a no-op, and a missing subscription / add-on price / infra blip is a
 * safe skip (logged, not thrown). Callers fire-and-forget after the membership
 * write has committed.
 *
 * @param brokerageId  the brokerage whose seats changed
 * @param prorationBehavior  Stripe proration on the quantity change. Defaults to
 *   'create_prorations' — adding a seat mid-cycle charges a prorated top-up and
 *   removing one issues a prorated credit, the fair "pay for what you use" model
 *   for a per-seat product. (The base bundle is untouched, so this only ever
 *   prorates the incremental per-seat line.)
 */
export async function syncBrokerageSeatBilling(
  brokerageId: string,
  prorationBehavior: Stripe.SubscriptionUpdateParams.ProrationBehavior = 'create_prorations',
): Promise<SeatSyncResult> {
  try {
    // Load the brokerage's live billing state.
    const { data: brokerage, error } = await supabase
      .from('Brokerage')
      .select('id, plan, stripeSubscriptionId, stripeSubscriptionStatus')
      .eq('id', brokerageId)
      .maybeSingle();

    if (error || !brokerage) {
      return { status: 'skipped', reason: 'brokerage-not-found' };
    }

    const subId = brokerage.stripeSubscriptionId as string | null;
    const status = brokerage.stripeSubscriptionStatus as string | null;

    // No subscription yet (or a terminal/inactive one) → nothing to bill. The
    // seat count is still capped by checkSeatCapacity; the quantity will be
    // seeded at checkout (syncBrokerageSeatBillingForSubscription) and re-synced
    // on the next membership change once a sub exists.
    if (!subId) return { status: 'skipped', reason: 'no-subscription' };
    if (status !== 'active' && status !== 'trialing' && status !== 'past_due') {
      return { status: 'skipped', reason: `sub-status-${status ?? 'unknown'}` };
    }

    if (!isBrokeragePlan(brokerage.plan)) {
      return { status: 'skipped', reason: `non-seat-plan-${brokerage.plan ?? 'unknown'}` };
    }

    const members = await countMembers(brokerageId);
    if (members === null) {
      return { status: 'skipped', reason: 'member-count-failed' };
    }

    let stripe: Stripe;
    try {
      stripe = getStripe();
    } catch {
      return { status: 'skipped', reason: 'stripe-not-configured' };
    }

    const subscription = await stripe.subscriptions.retrieve(subId);
    return syncBrokerageSeatBillingForSubscription(
      stripe,
      subscription,
      brokerage.plan,
      members,
      prorationBehavior,
    );
  } catch (e) {
    // Never let seat billing break the member add/remove flow that triggered it.
    logger.error('[seat-billing] sync failed (member change still applied)', { brokerageId }, e);
    return { status: 'skipped', reason: 'exception' };
  }
}

/**
 * Core converge step against an already-fetched subscription. Adds, updates, or
 * removes the per-seat add-on line item so its quantity equals the billable
 * add-on seats for the plan. Shared by the membership-change path
 * (syncBrokerageSeatBilling) and the checkout path (which has the sub in hand).
 */
export async function syncBrokerageSeatBillingForSubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  plan: 'team' | 'team_plus',
  activeMemberCount: number,
  prorationBehavior: Stripe.SubscriptionUpdateParams.ProrationBehavior = 'create_prorations',
): Promise<SeatSyncResult> {
  const desiredAddonQty = addonSeatsForPlan(plan, activeMemberCount);

  // Find the base item to infer billing cadence (monthly vs annual) so the
  // add-on item we attach matches it.
  const baseItem = subscription.items.data.find((it) => {
    const id = it.price?.id;
    return id === PLANS[plan].stripePriceMonthly || id === PLANS[plan].stripePriceAnnual;
  }) ?? subscription.items.data[0];
  const baseIsAnnual = priceIsAnnualBase(baseItem?.price?.id);

  const addonPriceId = addonPriceIdForPlan(plan, baseIsAnnual);

  // The flagged price-config dependency: per-seat charge can't be applied
  // without a per-unit add-on price object. Warn once and no-op the CHARGE (the
  // seat is still allowed + counted; only the incremental bill is deferred until
  // the price is configured).
  if (!addonPriceId) {
    if (desiredAddonQty > 0) {
      logger.warn(
        '[seat-billing] per-seat add-on price not configured — seats added past the included count are NOT being billed. Configure STRIPE_PRICE_TEAM_ADDON / STRIPE_PRICE_TEAM_PLUS_ADDON (a per-unit Stripe price).',
        { subscriptionId: subscription.id, plan, desiredAddonQty },
      );
    }
    return { status: 'skipped', reason: 'addon-price-not-configured', addonQuantity: desiredAddonQty };
  }

  // Is the add-on line already on the subscription?
  const existingAddon = subscription.items.data.find((it) => it.price?.id === addonPriceId);
  const currentQty = existingAddon?.quantity ?? 0;

  // Idempotent: already at the right quantity (including absent == 0).
  if (currentQty === desiredAddonQty && (desiredAddonQty > 0) === !!existingAddon) {
    return { status: 'noop', addonQuantity: desiredAddonQty };
  }

  const items: Stripe.SubscriptionUpdateParams.Item[] = [];
  if (existingAddon) {
    if (desiredAddonQty > 0) {
      items.push({ id: existingAddon.id, quantity: desiredAddonQty });
    } else {
      // Dropped back to/below the included seats — remove the add-on line.
      items.push({ id: existingAddon.id, deleted: true });
    }
  } else if (desiredAddonQty > 0) {
    items.push({ price: addonPriceId, quantity: desiredAddonQty });
  }

  if (items.length === 0) {
    return { status: 'noop', addonQuantity: desiredAddonQty };
  }

  await stripe.subscriptions.update(subscription.id, {
    items,
    proration_behavior: prorationBehavior,
  });

  return { status: 'updated', addonQuantity: desiredAddonQty };
}
