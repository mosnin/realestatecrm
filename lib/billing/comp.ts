/**
 * Complimentary ("comp") access — platform-admin-granted FREE access for internal
 * team members and demo accounts, fully INDEPENDENT of Stripe.
 *
 * The billing webhook / reconciliation never reads or writes these fields, so
 * granting comp can never interfere with a real subscription (and a real
 * subscription never disturbs comp). Stored on Space."compAccess" /
 * "compExpiresAt" / "compNote" (and the same columns on Brokerage).
 *
 * An account is comped when compAccess is true and the optional expiry hasn't
 * passed. When comped:
 *   - the dashboard access gate lets them in (no subscription required),
 *   - the credit meter treats them as unlimited (never blocked, never charged),
 *   - the plan resolver reports the top tier so demos show every feature.
 *
 * All reads are RESILIENT: if the migration that adds these columns hasn't run
 * yet (or any lookup errors), they fail CLOSED to "not comped" — so shipping this
 * never changes existing access/metering behavior until comp is actually granted.
 */

import { supabase } from '@/lib/supabase';
import { PLANS, type PlanId } from '@/lib/plans';

// The DEFAULT effective plan a comped account reports — the top tier of each
// kind, so an internal demo account sees the full feature set. (Virtual: never
// written to the row, so it can't drift the stored plan or trip Stripe
// reconciliation.) An invite-code redemption can pin a comped Space to a
// SPECIFIC plan instead (Space."compPlan"); resolveCompSpacePlan applies that
// override and falls back here when it's unset (every existing demo comp).
export const COMP_SPACE_PLAN: PlanId = 'pro';
export const COMP_BROKERAGE_PLAN: PlanId = 'team_plus';

/**
 * The plan a comped Space reports. An invite-code redemption stores the granted
 * PlanId on Space."compPlan" so a code that grants the $97 'solo' tier resolves
 * to 'solo' (not the demo default). Anything else — NULL (every demo comp granted
 * before invite codes existed), or a value that isn't a known PlanId — falls back
 * to COMP_SPACE_PLAN, so this can't change today's demo behavior. Pure.
 */
export function resolveCompSpacePlan(compPlan: unknown): PlanId {
  return typeof compPlan === 'string' && compPlan in PLANS
    ? (compPlan as PlanId)
    : COMP_SPACE_PLAN;
}

/** Pure check: is comp currently active for these raw column values? */
export function isCompActive(compAccess: unknown, compExpiresAt: unknown): boolean {
  if (compAccess !== true) return false;
  if (compExpiresAt == null) return true; // granted with no expiry → active until revoked
  const exp = new Date(compExpiresAt as string).getTime();
  if (Number.isNaN(exp)) return true; // unparseable (shouldn't happen) → treat as no-expiry
  return exp > Date.now();
}

/**
 * Resilient lookup of a Space's pinned comp plan (Space."compPlan"). Returns the
 * resolved PlanId — the column's value when it's a known plan, else
 * COMP_SPACE_PLAN. Fails to the default on ANY error (column not present yet, row
 * missing, query error), so resolveBillingAccount keeps working before this
 * branch's migration is applied and never throws on a legacy schema.
 */
export async function getCompSpacePlan(spaceId: string): Promise<PlanId> {
  try {
    const { data, error } = await supabase
      .from('Space')
      .select('compPlan')
      .eq('id', spaceId)
      .maybeSingle();
    if (error || !data) return COMP_SPACE_PLAN;
    return resolveCompSpacePlan((data as { compPlan?: unknown }).compPlan);
  } catch {
    return COMP_SPACE_PLAN;
  }
}

/**
 * Resilient lookup of an account's comp status. Returns false on ANY error —
 * including the columns not existing yet — so the code can ship before the
 * migration is applied without changing today's access/metering behavior.
 */
export async function isAccountComped(table: 'Space' | 'Brokerage', id: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('compAccess, compExpiresAt')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return false;
    return isCompActive(
      (data as { compAccess?: unknown }).compAccess,
      (data as { compExpiresAt?: unknown }).compExpiresAt,
    );
  } catch {
    return false;
  }
}
