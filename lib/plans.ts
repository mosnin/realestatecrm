/**
 * Plan tiers — the single source of truth for pricing. Every surface that
 * shows a plan name or price (pricing page, subscribe, billing pages, admin
 * MRR) imports from here so the numbers can't drift across the app.
 *
 * There is NO free tier — every plan is paid, entered through a 7-day Stripe
 * trial (card collected at checkout).
 *
 * Stripe price IDs are read from env and are null until the corresponding
 * product is created in Stripe — the module is safe to import before billing
 * is configured (checkout guards on a missing id). Solo falls back to the
 * legacy STRIPE_PRICE_ID so existing deployments keep working until the new
 * products exist.
 */

export type PlanId = 'solo' | 'pro' | 'team' | 'team_plus';

/** Which entity owns the subscription: solo/pro bill the Space, team tiers the Brokerage. */
export type AccountType = 'space' | 'brokerage';

export interface PlanDef {
  id: PlanId;
  label: string;
  /** Display price in USD/month (annual handled by a separate Stripe price). */
  priceMonthly: number;
  /** Seats included before per-user add-ons apply. */
  includedUsers: number;
  /** Which entity owns the subscription for this plan. */
  account: AccountType;
  stripePriceMonthly: string | null;
  stripePriceAnnual: string | null;
  /** Per-user expansion above includedUsers (Team / Team Plus). */
  addUser?: { priceMonthly: number };
}

const env = (k: string): string | null => process.env[k] ?? null;

export const PLANS: Record<PlanId, PlanDef> = {
  solo: {
    id: 'solo',
    label: 'Solo',
    priceMonthly: 97,
    includedUsers: 1,
    account: 'space',
    stripePriceMonthly: env('STRIPE_PRICE_SOLO'),
    stripePriceAnnual: env('STRIPE_PRICE_SOLO_ANNUAL'),
  },
  pro: {
    id: 'pro',
    label: 'Pro Performer',
    priceMonthly: 197,
    includedUsers: 1,
    account: 'space',
    stripePriceMonthly: env('STRIPE_PRICE_PRO'),
    stripePriceAnnual: env('STRIPE_PRICE_PRO_ANNUAL'),
  },
  team: {
    id: 'team',
    label: 'Team',
    priceMonthly: 497,
    includedUsers: 5,
    account: 'brokerage',
    stripePriceMonthly: env('STRIPE_PRICE_TEAM'),
    stripePriceAnnual: env('STRIPE_PRICE_TEAM_ANNUAL'),
    addUser: { priceMonthly: 79 },
  },
  team_plus: {
    id: 'team_plus',
    label: 'Team Plus',
    priceMonthly: 897,
    includedUsers: 10,
    account: 'brokerage',
    stripePriceMonthly: env('STRIPE_PRICE_TEAM_PLUS'),
    stripePriceAnnual: env('STRIPE_PRICE_TEAM_PLUS_ANNUAL'),
    addUser: { priceMonthly: 69 },
  },
};

/** The tier a self-serve signup lands on (the /subscribe commit moment). */
export const ENTRY_PLAN: PlanId = 'solo';

/**
 * Reverse lookup: which plan does a Stripe price id belong to? Lets the
 * webhook derive the ACTIVE plan from the live subscription's price instead of
 * metadata stamped once at checkout (which goes stale on a portal-driven plan
 * change). Returns null for unknown ids (e.g. price envs unset) so callers can
 * fall back to metadata / the stored plan.
 */
export function planIdForStripePrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const p of Object.values(PLANS)) {
    if (p.stripePriceMonthly === priceId || p.stripePriceAnnual === priceId) return p.id;
  }
  return null;
}
