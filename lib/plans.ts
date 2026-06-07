/**
 * Pricing V2 — the single source of truth for plan tiers, workflow credit
 * costs, and top-up packs. Every billing/metering call site imports from here
 * so tiers + credit prices can't drift across the app.
 *
 * See docs/PRICING_V2_PLAN.md for the model and the locked decisions. Stripe
 * price IDs are read from env (null when unset, so the module is safe to import
 * before Stripe is configured — checkout guards on a missing id).
 */

export type PlanId = 'free' | 'solo' | 'pro' | 'team' | 'team_plus';

/** Where a plan's credit balance lives: solo/pro on the Space, team on the Brokerage. */
export type AccountType = 'space' | 'brokerage';

export interface PlanDef {
  id: PlanId;
  label: string;
  /** Display price in USD/month (annual handled by a separate Stripe price). */
  priceMonthly: number;
  /** Seats included before per-user add-ons apply. */
  includedUsers: number;
  /** Recurring monthly credit grant (0 for Free — it gets a one-time grant). */
  monthlyCredits: number;
  /** One-time grant on signup (Free tier's 100, never-expiring credits). */
  oneTimeCredits?: number;
  /** Which entity owns the balance for this plan. */
  account: AccountType;
  stripePriceMonthly: string | null;
  stripePriceAnnual: string | null;
  /** Per-user expansion above includedUsers (Team / Team Plus). */
  addUser?: { priceMonthly: number; credits: number };
}

const env = (k: string): string | null => process.env[k] ?? null;

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    label: 'Free',
    priceMonthly: 0,
    includedUsers: 1,
    monthlyCredits: 0,
    oneTimeCredits: 100,
    account: 'space',
    stripePriceMonthly: null,
    stripePriceAnnual: null,
  },
  solo: {
    id: 'solo',
    label: 'Solo',
    priceMonthly: 97,
    includedUsers: 1,
    monthlyCredits: 1500,
    account: 'space',
    stripePriceMonthly: env('STRIPE_PRICE_SOLO'),
    stripePriceAnnual: env('STRIPE_PRICE_SOLO_ANNUAL'),
  },
  pro: {
    id: 'pro',
    label: 'Pro Performer',
    priceMonthly: 197,
    includedUsers: 1,
    monthlyCredits: 4000,
    account: 'space',
    stripePriceMonthly: env('STRIPE_PRICE_PRO'),
    stripePriceAnnual: env('STRIPE_PRICE_PRO_ANNUAL'),
  },
  team: {
    id: 'team',
    label: 'Team',
    priceMonthly: 497,
    includedUsers: 5,
    monthlyCredits: 12000,
    account: 'brokerage',
    stripePriceMonthly: env('STRIPE_PRICE_TEAM'),
    stripePriceAnnual: env('STRIPE_PRICE_TEAM_ANNUAL'),
    addUser: { priceMonthly: 79, credits: 1500 },
  },
  team_plus: {
    id: 'team_plus',
    label: 'Team Plus',
    priceMonthly: 897,
    includedUsers: 10,
    monthlyCredits: 25000,
    account: 'brokerage',
    stripePriceMonthly: env('STRIPE_PRICE_TEAM_PLUS'),
    stripePriceAnnual: env('STRIPE_PRICE_TEAM_PLUS_ANNUAL'),
    addUser: { priceMonthly: 69, credits: 2000 },
  },
};

/**
 * Credit cost per premium workflow (docs/PRICING_V2_PLAN.md §4.4). The key is
 * the canonical `workflow` string written to CreditTxn.workflow.
 */
export const WORKFLOW_CREDIT_COST = {
  pipeline_audit: 50,
  followup_sequence: 40,
  lead_qualification: 25,
  tour_booking: 15,
  daily_briefing: 10,
  call_prep: 3,
  lead_score: 1,
} as const;

export type Workflow = keyof typeof WORKFLOW_CREDIT_COST;

/**
 * The pipeline audit's token cost scales with pipeline size, but its credit
 * price is flat (50). To hold margin, one 50-credit run rescores at most this
 * many active leads; larger pipelines run additional batches (each 50 credits).
 * See the unit-economics decision in docs/PRICING_V2_PLAN.md §3.
 */
export const PIPELINE_AUDIT_LEAD_CAP = 100;

/** One-time credit packs (mode=payment in Stripe). 30-day rollover. */
export const TOPUPS = {
  starter: { id: 'starter', label: 'Starter refill', credits: 1000, price: 29, stripePrice: env('STRIPE_PRICE_TOPUP_STARTER') },
  growth: { id: 'growth', label: 'Growth refill', credits: 3000, price: 69, stripePrice: env('STRIPE_PRICE_TOPUP_GROWTH') },
  power: { id: 'power', label: 'Power refill', credits: 8000, price: 149, stripePrice: env('STRIPE_PRICE_TOPUP_POWER') },
} as const;

export type TopupId = keyof typeof TOPUPS;

/** Credit lots roll over for 30 days (Free's one-time grant never expires). */
export const CREDIT_ROLLOVER_DAYS = 30;
