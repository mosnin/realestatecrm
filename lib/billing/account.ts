/**
 * Billing-account resolution (docs/PRICING_V2_PLAN.md §4.1).
 *
 * One question, one answer: for a given space, which entity owns the plan +
 * credit balance? Solo/Pro draw from the Space; Team/Team Plus pool credits at
 * the Brokerage. Every metering/grant call site goes through here so the
 * space-vs-brokerage choice lives in exactly one place.
 *
 * Service-role bypasses RLS — callers must pass a `spaceId` resolved from a
 * trusted server context (the authed workspace), never raw client input.
 */

import { supabase } from '@/lib/supabase';
import type { PlanId } from '@/lib/plans';
import type { BillingAccount } from '@/lib/billing/credits';
import { isAccountComped, getCompSpacePlan, COMP_BROKERAGE_PLAN } from '@/lib/billing/comp';

export interface BillingContext {
  account: BillingAccount;
  /** The plan that governs grants/limits for this account. */
  plan: PlanId;
  /** Live Stripe subscription status of the FUNDING account (space or pooled
   *  brokerage). Used with subscriptionPeriodEnd to refuse lapsed paid access.
   *  null when the account never subscribed. */
  subscriptionStatus: string | null;
  /** Persisted end of the current Stripe billing/trial period. */
  subscriptionPeriodEnd: string | null;
  /** True when the account has admin-granted complimentary (free) access —
   *  unlimited usage, no Stripe required. Independent of subscriptionStatus. */
  isComped: boolean;
}

const BROKERAGE_PLANS = new Set<string>(['team', 'team_plus']);

/**
 * Resolve the billing account funding a space's credit spend.
 * - If the space belongs to a brokerage on a pooled (team) plan → that
 *   brokerage's pool.
 * - Otherwise → the space's own balance (free/solo/pro).
 */
export async function resolveBillingAccount(spaceId: string): Promise<BillingContext> {
  const { data: space, error } = await supabase
    .from('Space')
    .select('id, plan, brokerageId, ownerId, stripeSubscriptionStatus, stripePeriodEnd')
    .eq('id', spaceId)
    .maybeSingle();
  if (error) throw error;
  if (!space) throw new Error(`resolveBillingAccount: space ${spaceId} not found`);

  // Complimentary access overrides Stripe entirely: the space funds itself, with
  // no spend gate, at its comp plan — Space.compPlan when an invite code pinned
  // one (e.g. the $97 'solo' tier), else the demo default (COMP_SPACE_PLAN).
  // Checked FIRST so a comped account never routes into (or drains) a brokerage
  // pool. Both reads are resilient: isAccountComped is false if the comp columns
  // aren't present yet, and getCompSpacePlan falls back to the default if the
  // compPlan column isn't present yet — so this ships safely before the migration.
  if (await isAccountComped('Space', space.id as string)) {
    return {
      account: { type: 'space', id: space.id as string },
      plan: await getCompSpacePlan(space.id as string),
      subscriptionStatus: (space.stripeSubscriptionStatus as string) ?? null,
      subscriptionPeriodEnd: (space.stripePeriodEnd as string) ?? null,
      isComped: true,
    };
  }

  if (space.brokerageId) {
    const { data: brokerage } = await supabase
      .from('Brokerage')
      .select('id, plan, stripeSubscriptionStatus, stripePeriodEnd')
      .eq('id', space.brokerageId)
      .maybeSingle();
    if (brokerage && BROKERAGE_PLANS.has(brokerage.plan as string)) {
      // SECURITY (money routing): only pool at the brokerage if the space's
      // owner is a VERIFIED member of it. `Space.brokerageId` is a loosely-set
      // field — without this check a realtor could point their space at any
      // team brokerage and drain its shared credit pool through metered work.
      const { data: membership } = await supabase
        .from('BrokerageMembership')
        .select('userId')
        .eq('brokerageId', space.brokerageId)
        .eq('userId', space.ownerId)
        .maybeSingle();
      if (membership) {
        const brokerageComped = await isAccountComped('Brokerage', brokerage.id as string);
        return {
          account: { type: 'brokerage', id: brokerage.id as string },
          plan: brokerageComped ? COMP_BROKERAGE_PLAN : (brokerage.plan as PlanId),
          subscriptionStatus: (brokerage.stripeSubscriptionStatus as string) ?? null,
          subscriptionPeriodEnd: (brokerage.stripePeriodEnd as string) ?? null,
          isComped: brokerageComped,
        };
      }
    }
  }

  return {
    account: { type: 'space', id: space.id as string },
    plan: ((space.plan as string) ?? 'free') as PlanId,
    subscriptionStatus: (space.stripeSubscriptionStatus as string) ?? null,
    subscriptionPeriodEnd: (space.stripePeriodEnd as string) ?? null,
    isComped: false,
  };
}
