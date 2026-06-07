# PRICING_V2_PLAN.md

Implementation plan for the **Chippi V2 three-layer pricing model** (see the
product spec: Free / Solo / Pro Performer / Team / Team Plus + brokerage
expansion + performance pricing, built on a per-workflow **credit** currency).

> Status: **PLAN — not yet built.** This is the grounded blueprint. Every
> "today" claim below is cited to a file so it's checkable. Nothing here ships
> until the open decisions (esp. unit economics) are resolved and the Stripe
> products are created. Migrations carry the same gate as the rest of the repo:
> validate a from-empty `supabase db reset` before merge.

---

## 1. Where we are today (grounded)

| Area | Today | File |
|---|---|---|
| Stripe client | Optional, gated on `STRIPE_SECRET_KEY` | `lib/stripe.ts` |
| Billing columns (Space) | `stripeCustomerId/SubscriptionId/Status/PeriodEnd`, `trialUsedAt` | `supabase/migrations/20260324300000_stripe_billing.sql`, `…_trial_tracking.sql` |
| Billing columns (Brokerage) | same + `plan (starter\|team\|enterprise)`, `seatLimit (5\|15\|null)` | `supabase/migrations/20260509000000_brokerage_billing.sql` |
| Checkout | One flat price per context; **`quantity: 1` hardcoded** | `app/api/billing/checkout/route.ts:151,312` |
| Webhook | Updates status/plan/seatLimit; Redis idempotency; anti-poisoning guards | `app/api/webhooks/stripe/route.ts` |
| Access gating | `status IN (active,trialing)` in both layouts | `app/s/[slug]/layout.tsx`, `app/broker/layout.tsx` |
| Seat counting | members + non-expired pending invites; `checkSeatCapacity()` | `lib/brokerage-seats.ts` |
| Usage metering | **Daily TOKEN budget for autonomous runs only** (Redis `agent:budget:{space}:{date}`) + `ChatUsage` token log | `agent/security/budget.py`, `lib/usage/today-token-usage.ts` |
| Close → commission | Auto `CommissionLedger` row on `Deal.status='won'` (DB trigger) | `supabase/migrations/20260507000000_commission_ledger.sql` |

**Verified gaps (the work):**
- ❌ No **credit** currency, balance, ledger, allocation, rollover, or top-ups.
- ❌ No per-account **plan tier** on `Space` (only `Brokerage.plan`). No Free tier.
- ❌ No **seat/usage-based Stripe billing** — `quantity` is always 1, so Layer 2 auto-expand and Layer 3 metered closes are unbuilt.
- ❌ No **attribution chain** (score → sequence → close). Only a weak `deal_advanced` correlation signal (`app/api/cron/draft-outcomes/route.ts`).
- ❌ Three sold workflows **don't exist in code**: full pipeline audit (rescore-all), call prep, and *multi-touch sequences* (today `set_followup` schedules a single follow-up).

---

## 2. The model (from the spec)

- **Layer 1 — Platform tiers:** Free $0 (1 user, **100 one-time** credits, no expiry), Solo $97 (1, 1,500/mo), Pro Performer $197 (1, 4,000/mo), Team $497 (5, 12,000/mo, +$79/user +1,500cr), Team Plus $897 (10, 25,000/mo, +$69/user +2,000cr).
- **Layer 2 — Brokerage expansion:** auto-expanding per-agent price bands (10–24 → $69/mo, 25–49 → $59, 50–99 → $49, 100–199 → $39, 200+ custom; annual ≈ 18–20% less).
- **Layer 3 — Performance pricing (100+ agents, on request):** base from $3,497/mo + **$49 per attributed close** (a lead Chip scored, sequenced, and the agent closed).
- **Credits** are spent per premium workflow: audit 50, follow-up sequence 40, qualification 25, tour 15, briefing 10, call prep 3, score update 1. Paid-plan credits **roll over 30 days**; top-ups (1k/$29, 3k/$69, 8k/$149) are one-time, also 30-day rollover.

---

## 3. Open decisions (resolve before/while building)

1. **Unit economics (BLOCKING).** A credit is an abstraction over real LLM/compute cost. Model each workflow's actual token spend × the plan's monthly grant and confirm margin at each tier. If a Solo user can spend 1,500 credits on 30 audits that each cost more in tokens than the credit price implies, the plan loses money. **This determines whether the credit costs/grants in the spec are final.** Owner decision — not derivable from code.
2. **Pooling boundary.** Solo/Pro = per-`Space` balance. Team/Team Plus = pooled per-`Brokerage`. Need one resolver: "which billing account funds this space's spend?" (a broker_owner's personal space vs. the brokerage pool).
3. **Rollover mechanics.** "Roll over 30 days" → grants carry an `expiresAt`; balance = sum of non-expired credit lots (FIFO debit, expire oldest first). Confirm: does an unused monthly grant extend 30 days past *its* issue, or 30 days past period end? (Plan assumes per-lot `expiresAt = issuedAt + 30d`.)
4. **Refund-on-failure.** If a metered workflow errors after debit, auto-refund the credits. (Plan: debit on success, or debit-then-refund-on-throw.)
5. **Free-tier abuse.** 100 non-expiring credits per account with no card — bound by account creation (Clerk) + one Space per user (already enforced). Acceptable?
6. **Annual billing.** Spec: "billed upfront, credits allocated monthly." Stripe annual price + monthly credit grant cron (not on invoice). Confirm.
7. **Migration of current subscribers.** Existing Solo (`STRIPE_PRICE_ID`) and brokerage `starter/team/enterprise` subs must map to the new tiers. Need a mapping + backfill.

---

## 4. Architecture

### 4.1 Billing account abstraction
Introduce a single concept: a **billing account** = the entity that owns a plan + credit balance. It is either a `Space` (Free/Solo/Pro) or a `Brokerage` (Team/Team Plus). One helper `lib/billing/account.ts → resolveBillingAccount(spaceId) → { type, id, plan }` so every debit/grant/gate goes through one resolver. This avoids scattering `space vs brokerage` branching across the metering call sites.

### 4.2 Plan tiers — `lib/plans.ts` (single source of truth)
```ts
// One table the whole app reads. Mirrors STRIPE_PRICE_* env + DB plan enum.
export const PLANS = {
  free:      { stripePrice: null,                 includedUsers: 1,  monthlyCredits: 0,     oneTimeCredits: 100 },
  solo:      { stripePrice: env.STRIPE_PRICE_SOLO,        includedUsers: 1,  monthlyCredits: 1500 },
  pro:       { stripePrice: env.STRIPE_PRICE_PRO,         includedUsers: 1,  monthlyCredits: 4000 },
  team:      { stripePrice: env.STRIPE_PRICE_TEAM,        includedUsers: 5,  monthlyCredits: 12000, addUser: { price: 79, credits: 1500 } },
  team_plus: { stripePrice: env.STRIPE_PRICE_TEAM_PLUS,   includedUsers: 10, monthlyCredits: 25000, addUser: { price: 69, credits: 2000 } },
} as const;
```
- DB: add `plan text NOT NULL DEFAULT 'free'` to `Space` (CHECK `free|solo|pro`); extend `Brokerage.plan` CHECK to add `team|team_plus` (+ the expansion is Layer 2). Replace `seatLimit` semantics with `includedUsers` from `PLANS`.
- `lib/env.ts`: add `STRIPE_PRICE_{SOLO,PRO,TEAM,TEAM_PLUS}` + the top-up + annual price IDs, with boot validation (today even the brokerage IDs are read raw from `process.env`).
- Checkout: pick price by requested tier; portal/cancel unchanged; webhook writes `plan` and fires the monthly credit grant.
- Free tier: no Stripe sub. Gate features by `plan` + grant the one-time 100 credits on space creation.

### 4.3 The credit ledger (the core primitive — Phase 1)
**Append-only ledger + cached balance.** Append-only is the audit trail; the cached integer is for fast reads/gating.
```sql
CREATE TABLE "CreditLot" (              -- a grant or top-up that can expire
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountType" text NOT NULL CHECK ("accountType" IN ('space','brokerage')),
  "accountId"   text NOT NULL,
  amount        integer NOT NULL,       -- credits granted in this lot
  remaining     integer NOT NULL,       -- decremented as spent (FIFO)
  reason        text NOT NULL,          -- 'monthly_grant'|'topup'|'free_signup'|'addon_user'
  "expiresAt"   timestamptz,            -- null = never (Free tier 100)
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "CreditTxn" (              -- every debit (and refund), for audit
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountType" text NOT NULL,
  "accountId"   text NOT NULL,
  delta         integer NOT NULL,       -- negative = spend, positive = refund
  workflow      text NOT NULL,          -- 'pipeline_audit'|'followup_sequence'|…
  "spaceId"     text,                   -- who actually spent (for team breakdown)
  "userId"      text,
  metadata      jsonb,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);
-- Indexes: (accountType, accountId, expiresAt) on CreditLot; (accountType, accountId, createdAt) on CreditTxn.
```
- **Grant:** on `invoice.payment_succeeded` (webhook), insert a `CreditLot` (`monthly_grant`, `expiresAt = now()+30d`) sized by `PLANS[plan].monthlyCredits` (+ add-on users). Annual plans: a monthly cron grants instead (since invoice fires yearly).
- **Balance:** `SUM(remaining)` over non-expired lots. Cache on the account row (`creditBalance int`) updated transactionally; the lots are the truth.
- **Debit:** `spendCredits(account, workflow, ctx)` — FIFO across non-expired lots, writes a `CreditTxn`, decrements `remaining`, fails closed (HTTP 402 / tool refusal) if insufficient. **Service-role bypasses RLS — the account scoping in this helper is the only boundary; never debit without resolving the account from a trusted server context.**
- **Refund:** wrap the workflow; on throw after debit, write a positive `CreditTxn` + restore `remaining`.
- **Top-ups:** one-time Stripe Checkout (mode=payment) → webhook inserts a `CreditLot` (`topup`, `+30d`).

### 4.4 Premium workflows → metering hook points
Build decision: **build the 3 missing workflows** so the credit menu isn't selling vapor.

| Workflow | Credits | Status | Hook point |
|---|---|---|---|
| Lead score update | 1 | ✅ exists | `app/api/contacts/[id]/rescore/route.ts`, `app/api/agent/rescore-contact/route.ts` |
| Call prep | 3 | ❌ **build** | New agent tool `call_prep` + route; debit on generate |
| Daily AI briefing | 10 | ✅ exists | `app/api/cron/daily-briefing/route.ts` (debit per brief composed) |
| Tour booking | 15 | ✅ exists | `lib/ai-tools/tools/schedule-tour.ts` |
| Lead qualification | 25 | ✅ exists (intake→score) | `app/api/public/apply/route.ts` scoring path / agent rescore |
| Follow-up *sequence* | 40 | ⚠️ **build** (only single `set_followup` today) | extend `lib/ai-tools/tools/set-followup.ts` → multi-touch sequence; debit per sequence |
| Full pipeline audit | 50 | ❌ **build** (no rescore-all) | New `pipeline_audit` tool + batch rescore + top-5 surfacing; debit per run |

Each hook calls `spendCredits()` **before** doing the work (or debit→refund-on-fail). For agent tools, the debit lives in the tool handler (after approval, before execution).

### 4.5 Layer 2 — brokerage auto-expand
- Move brokerage subscription to **`quantity = active agent count`** (the count already exists in `lib/brokerage-seats.ts`) with a Stripe **graduated/tiered price** encoding the $69→$59→$49… bands. Adjust quantity (with proration) on member add/remove; reconcile in the webhook. Replaces the hard `seatLimit` caps with metered seats.
- Annual: separate annual graduated price IDs.

### 4.6 Layer 3 — performance pricing (defer; manual first)
- New `AttributionEvent` table linking `agentRunId/toolName/contactId/dealId/actionAt → close`, fed by `AgentMemory.sourceRunId` + `DealActivity` + the `won` trigger. Define "attributed close" precisely (scored within N days → sequenced → closed) — **causation is fuzzy; ship a manual report first**, bill `$49/close` via Stripe metered usage only once the definition is trusted. Lowest priority; spec already gates it to "100+ agents, on request."

---

## 5. Phased build order

- **Phase 0 — Tiers + billing account.** `lib/plans.ts`, `Space.plan` migration, `Brokerage.plan` extension, env price IDs + validation, checkout/webhook tier routing, Free-tier gating. *(Stripe products must exist first.)*
- **Phase 1 — Credit ledger.** `CreditLot`/`CreditTxn` migration, `lib/billing/account.ts` + `lib/billing/credits.ts` (`grant/spend/refund/balance`), monthly grant on webhook + annual cron, balance UI (header/settings), top-up checkout. Wire `spendCredits()` into the **4 existing** workflows.
- **Phase 2 — Missing workflows.** Build `pipeline_audit`, `call_prep`, multi-touch `followup_sequence`; meter each.
- **Phase 3 — Layer 2 seat metering.** Stripe graduated price + quantity sync + proration; retire `seatLimit` caps.
- **Phase 4 — Layer 3 attribution.** `AttributionEvent`, manual report, then metered Stripe usage.

Phases 0–1 are the foundation everything else needs; do them first.

## 6. Stripe setup checklist (owner, before Phase 0 ships)
- Products + monthly **and** annual recurring prices: Solo, Pro, Team (+ per-seat add-on), Team Plus (+ add-on), brokerage graduated seat price (bands), Layer-3 base + metered-usage price.
- One-time prices: Starter/Growth/Power top-ups.
- Set the resulting price IDs as `STRIPE_PRICE_*` env vars in Vercel + Modal secrets.

## 7. Risks
- **Unit economics** (decision #1) — the whole model's viability.
- **Credit accounting correctness** — money-adjacent; the ledger must be transactional and auditable (hence append-only lots + txns).
- **Migrating live subscribers** without double-charging or access loss.
- **Service-role + app-layer scoping** — a missing account filter in `spendCredits` is a cross-tenant credit leak with no DB safety net.
- **Selling unbuilt features** — mitigated by the Phase-2 decision to build the 3 missing workflows before metering them.

---

_Companion maps that grounded this plan live in the session that authored it; every "today" claim above is cited to a file and should be re-verified against the code before each phase begins._
