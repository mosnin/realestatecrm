import Stripe from 'stripe';
import { PLANS, type PlanId } from '@/lib/plans';
import { logger } from '@/lib/logger';

let _stripe: Stripe | undefined;
let _pricesValidated = false;

/** Paid tiers that MUST have a monthly Stripe price wired up. Free has none by
 *  design (no charge). If any of these is missing, a real customer's invoice
 *  webhook can't map its price back to a plan → the grant is skipped (Fix #5),
 *  so surface the misconfiguration loudly at startup instead of at charge time. */
const PRICED_TIERS: PlanId[] = ['solo', 'pro', 'team', 'team_plus'];

/**
 * Validate that every paid PLANS tier has its monthly Stripe price id
 * configured. Logged once (CRITICAL) so a missing env var is caught on the
 * first Stripe call in an environment, not when a Pro/Team customer is charged
 * and silently under-granted. Best-effort: never throws (a transient logging or
 * env issue must not take down all Stripe-backed routes).
 */
function validatePlanPrices(): void {
  if (_pricesValidated) return;
  _pricesValidated = true;
  try {
    const missing = PRICED_TIERS.filter((id) => !PLANS[id].stripePriceMonthly);
    if (missing.length > 0) {
      logger.error(
        '[stripe] CRITICAL: paid plan tiers are missing their monthly Stripe price id — their invoices will not map to a plan and credit grants will be SKIPPED. Set the STRIPE_PRICE_* env vars.',
        { missingTiers: missing },
      );
    }
  } catch {
    /* never let validation/logging break Stripe init */
  }
}

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable');
  }

  validatePlanPrices();
  _stripe = new Stripe(key);
  return _stripe;
}

/**
 * Pick the Stripe price id for a space tier. Pure (prices injected) so the
 * money-mapping is unit-testable and can't silently regress.
 * - Solo: its own monthly price, falling back to the legacy single-price env
 *   (STRIPE_PRICE_ID) so existing prod keeps charging the right Solo price
 *   until STRIPE_PRICE_SOLO is set.
 * - Pro: its own monthly price only — there was never a legacy Pro price, so a
 *   missing one returns null (the caller refuses checkout rather than silently
 *   charging the Solo price, the bug this replaces).
 */
export function pickSpacePriceId(
  plan: 'solo' | 'pro',
  prices: { soloMonthly: string | null; proMonthly: string | null; legacy: string | null },
): string | null {
  const direct = plan === 'pro' ? prices.proMonthly : prices.soloMonthly;
  if (direct) return direct;
  return plan === 'solo' ? prices.legacy : null;
}
