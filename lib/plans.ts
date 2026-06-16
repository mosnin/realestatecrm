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
  /**
   * Per-user expansion above includedUsers (Team / Team Plus).
   *
   * `stripePrice*` is the Stripe price id for ONE add-on seat — it MUST be a
   * per-unit ("licensed", quantity-billed) price so the subscription can carry
   * a second line item whose quantity = active members − includedUsers (see
   * lib/billing/brokerage-seat-billing.ts). It is intentionally separate from
   * the plan's base `stripePriceMonthly` (a FLAT bundle price — $497/$897 — that
   * always bills quantity 1). Null until the per-seat price object is created in
   * Stripe and the env var is set; seat billing no-ops + warns while unset.
   */
  addUser?: {
    priceMonthly: number;
    credits: number;
    stripePriceMonthly: string | null;
    stripePriceAnnual: string | null;
  };
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
    monthlyCredits: 3000,
    account: 'space',
    stripePriceMonthly: env('STRIPE_PRICE_SOLO'),
    stripePriceAnnual: env('STRIPE_PRICE_SOLO_ANNUAL'),
  },
  pro: {
    id: 'pro',
    label: 'Pro Performer',
    priceMonthly: 197,
    includedUsers: 1,
    monthlyCredits: 8000,
    account: 'space',
    stripePriceMonthly: env('STRIPE_PRICE_PRO'),
    stripePriceAnnual: env('STRIPE_PRICE_PRO_ANNUAL'),
  },
  team: {
    id: 'team',
    label: 'Team',
    priceMonthly: 497,
    includedUsers: 5,
    monthlyCredits: 24000,
    account: 'brokerage',
    stripePriceMonthly: env('STRIPE_PRICE_TEAM'),
    stripePriceAnnual: env('STRIPE_PRICE_TEAM_ANNUAL'),
    addUser: {
      priceMonthly: 79,
      credits: 3000,
      stripePriceMonthly: env('STRIPE_PRICE_TEAM_ADDON'),
      stripePriceAnnual: env('STRIPE_PRICE_TEAM_ADDON_ANNUAL'),
    },
  },
  team_plus: {
    id: 'team_plus',
    label: 'Team Plus',
    priceMonthly: 897,
    includedUsers: 10,
    monthlyCredits: 50000,
    account: 'brokerage',
    stripePriceMonthly: env('STRIPE_PRICE_TEAM_PLUS'),
    stripePriceAnnual: env('STRIPE_PRICE_TEAM_PLUS_ANNUAL'),
    addUser: {
      priceMonthly: 69,
      credits: 4000,
      stripePriceMonthly: env('STRIPE_PRICE_TEAM_PLUS_ADDON'),
      stripePriceAnnual: env('STRIPE_PRICE_TEAM_PLUS_ADDON_ANNUAL'),
    },
  },
};

/** The self-serve tiers a buyer can pick and check out on their own (no sales).
 *  Solo/Pro live on the Space; Team/Team Plus are brokerage-scoped and go
 *  through /demo, so they are intentionally NOT self-serve here. */
export type SelfServePlanId = 'solo' | 'pro';

/**
 * Normalize an untrusted plan hint (URL param, sessionStorage, request body)
 * to a self-serve Space tier. Anything that isn't 'pro' resolves to 'solo' —
 * the historical default for direct visitors and the safe fallback when the
 * chosen plan is lost across a redirect. Pure, so the resolution is identical
 * on the marketing CTA, the onboarding write, and the subscribe display.
 */
export function resolveSelfServePlan(raw: unknown): SelfServePlanId {
  return raw === 'pro' ? 'pro' : 'solo';
}

/**
 * Billable add-on seats for a brokerage plan: members beyond the plan's
 * includedUsers. Pure + clamped to ≥ 0, so it's the single source of truth for
 * BOTH the per-seat Stripe quantity (lib/billing/brokerage-seat-billing.ts) and
 * the per-seat credit grant (lib/billing/grants.ts → grantMonthlyCredits's
 * addonUsers). Plans without an add-on path (or unknown ids) yield 0 — they bill
 * a flat bundle with no per-seat line. Non-finite/negative seat counts clamp to
 * 0 (never invent a negative or NaN quantity to send to Stripe).
 */
export function addonSeatsForPlan(plan: PlanId | string | null | undefined, activeSeatCount: number): number {
  const def = plan && plan in PLANS ? PLANS[plan as PlanId] : undefined;
  if (!def?.addUser) return 0;
  const seats = Number.isFinite(activeSeatCount) ? Math.floor(activeSeatCount) : 0;
  return Math.max(0, seats - def.includedUsers);
}

/**
 * Is ANNUAL billing actually purchasable for a plan in this environment?
 *
 * True only when the plan's annual BASE price id is configured. For the
 * brokerage tiers (team / team_plus) the per-seat add-on is billed on a
 * SEPARATE annual price (addUser.stripePriceAnnual); if a plan has an add-on
 * path but its annual add-on price is unset, a brokerage with seats past the
 * included count couldn't be charged its annual per-seat line — so we treat
 * annual as unavailable for that plan rather than offer a half-priced annual
 * that silently under-bills seats.
 *
 * Pure (reads only the env-derived PLANS ids), so the SERVER gate (checkout)
 * and the UI gate (marketing toggle / in-app cadence picker) use one source of
 * truth and can never show an annual option that checkout would refuse.
 */
export function isAnnualAvailable(planId: PlanId | string | null | undefined): boolean {
  const def = planId && planId in PLANS ? PLANS[planId as PlanId] : undefined;
  if (!def) return false;
  if (!def.stripePriceAnnual) return false;
  // A plan with a per-seat add-on must also have its ANNUAL add-on price wired
  // up, else annual seats can't be billed (see addUser doc above).
  if (def.addUser && !def.addUser.stripePriceAnnual) return false;
  return true;
}

/**
 * Reverse lookup: which plan does a Stripe price id belong to? The webhook uses
 * this to derive the ACTIVE plan from the live subscription's price, instead of
 * a `metadata.plan` that's stamped once at checkout and goes STALE on a
 * portal-driven plan change (Solo↔Pro / Team↔Team Plus). Returns null when the
 * id isn't a known plan price (e.g. price ids unset in this env) so callers can
 * fall back to metadata / the stored plan.
 */
export function planIdForStripePrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const p of Object.values(PLANS)) {
    if (p.stripePriceMonthly === priceId || p.stripePriceAnnual === priceId) return p.id;
  }
  return null;
}

/**
 * Which plans may purchase one-time credit top-ups. Only the FREE tier is
 * blocked (it has no paid relationship — a top-up would be the first charge with
 * no subscription, and the product intent is "top up your plan", not "pay-as-you
 * -go without a plan"). Every paid tier (solo/pro/team/team_plus) is allowed;
 * Team/Team Plus top-ups pool at the brokerage balance (resolveBillingAccount).
 * The marketing FAQ ("buy a one-time top-up anytime") matches this.
 *
 * Single source of truth shared by the server gate (credits/checkout) and the
 * client UI (buy-credits) so they can't disagree. Pure.
 */
export function canBuyTopups(plan: PlanId | string | null | undefined): boolean {
  return plan === 'solo' || plan === 'pro' || plan === 'team' || plan === 'team_plus';
}

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
  // One Chippi chat/agent turn (the in-app assistant). Flat 1 credit — a turn's
  // blended token COGS sits at or below a lead-score's, so it clears the spec's
  // "COGS ≤ 40% of credit retail" bar, and 1/turn leaves Solo ~1,500 turns/mo
  // (~50/day) — generous for normal use while still hard-capping runaway
  // automation. Raise this (not the plan price) if a chat model gets pricier.
  chat_turn: 1,
} as const;

export type Workflow = keyof typeof WORKFLOW_CREDIT_COST;

/**
 * The pipeline audit's token cost scales with pipeline size, but its credit
 * price is flat (50). To hold margin, one 50-credit run rescores at most this
 * many active leads; larger pipelines run additional batches (each 50 credits).
 * See the unit-economics decision in docs/PRICING_V2_PLAN.md §3.
 */
export const PIPELINE_AUDIT_LEAD_CAP = 100;

/**
 * One-time credit packs (mode=payment in Stripe). 30-day rollover.
 *
 * Credit counts are sized to hold ≥60% gross margin at worst-case burn — every
 * credit can cost up to $0.013 of model COGS (the model-aware metering budget),
 * so a credit must retail ≥ $0.013 / 0.40 = $0.0325 to clear 60%. The previous
 * counts (1000/3000/8000) priced credits at $0.029/$0.023/$0.0186 — 55%/43%/30%
 * margin, the Power pack a guaranteed loss at full burn.
 *
 * We cut the credit counts rather than raise the dollar prices: the $ amount is
 * the live Stripe price id, so raising it would need new Stripe price objects
 * and risk a display-vs-charge mismatch. Trimming the granted credits keeps the
 * existing $29/$69/$149 charges and is consistent the moment it ships. Per-credit
 * value still rewards the larger pack (Starter $0.0363 → Power $0.0331/cr), and
 * all three clear 60%: Starter 64.1%, Growth 62.3%, Power 60.7%.
 */
export const TOPUPS = {
  starter: { id: 'starter', label: 'Starter refill', credits: 800, price: 29, stripePrice: env('STRIPE_PRICE_TOPUP_STARTER') },
  growth: { id: 'growth', label: 'Growth refill', credits: 2000, price: 69, stripePrice: env('STRIPE_PRICE_TOPUP_GROWTH') },
  power: { id: 'power', label: 'Power refill', credits: 4500, price: 149, stripePrice: env('STRIPE_PRICE_TOPUP_POWER') },
} as const;

export type TopupId = keyof typeof TOPUPS;

/** Credit lots roll over for 30 days (Free's one-time grant never expires). */
export const CREDIT_ROLLOVER_DAYS = 30;

/**
 * USD of token COGS that ONE credit is allowed to cover — the calibration for
 * model-aware chat/agent metering. Chosen so that consuming a plan's FULL
 * monthly credit allotment still leaves >= 60% gross margin on every tier:
 *
 *   margin@full = 1 - (monthlyCredits * CREDIT_COGS_BUDGET_USD) / planPrice
 *
 * The binding tier is the Team Plus add-on seat ($69 / 4,000 credits → max
 * $0.01725/credit for exactly 60%). $0.0065 holds >= 62% on every tier, leaving
 * a buffer for model-price-estimate / provider-markup error.
 *
 * Halved from the original $0.013 the moment the monthly allotments doubled and
 * the model lineup moved to the far cheaper DeepSeek / Tencent / qwen set: with
 * credits 2x and the budget 1/2x, worst-case margins are UNCHANGED while real
 * usage roughly doubles (actual model COGS sits well under the budget).
 *
 * The DB trigger (supabase/migrations/..._meter_chat_usage_credits.sql, then
 * ..._recalibrate_credit_budget.sql) is the enforcement point (charges
 * credits/turn = max(1, ceil(costUsd / this)) off each ChatUsage row); this
 * constant + helper are the TS-side source of truth for estimation/display.
 * Keep the two in sync.
 */
export const CREDIT_COGS_BUDGET_USD = 0.0065;

/** Credits a turn costs given its actual token COGS (model-aware). Floor of 1
 *  so even a near-free turn costs a credit. Mirrors the SQL trigger. */
export function creditsForCostUsd(costUsd: number): number {
  return Math.max(1, Math.ceil((costUsd > 0 ? costUsd : 0) / CREDIT_COGS_BUDGET_USD));
}
