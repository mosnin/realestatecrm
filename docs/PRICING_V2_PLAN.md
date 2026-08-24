# Pricing V2

This is the locked model that `lib/plans.ts` and `lib/billing/*` implement.
Stripe price IDs live in env. Display prices in this file are USD.

## 1. Plans

| Id | Label | USD / month | Included seats | Monthly credits | Account | Self-serve |
|---|---|---:|---:|---:|---|---|
| `free` | Free | 0 | 1 | 0 (100 one-time, never expire) | Space | Yes |
| `solo` | Solo | 97 | 1 | 3,000 | Space | Yes |
| `pro` | Pro Performer | 197 | 1 | 8,000 | Space | Yes |
| `team` | Team | 497 | 5 | 24,000 | Brokerage | No — `/demo` |
| `team_plus` | Team Plus | 897 | 10 | 50,000 | Brokerage | No — `/demo` |

Team / Team Plus add-on seats: $79 / 3,000 credits (Team), $69 / 4,000 credits
(Team Plus), billed as a **separate** per-unit Stripe line. The base price is
flat quantity 1. `isAnnualAvailable()` is false unless **both** the base annual
price and the annual add-on price exist — otherwise we would under-bill seats.

`resolveSelfServePlan()` maps anything that is not `pro` to `solo`.

## 2. Where the balance lives

`lib/billing/account.ts`: Solo/Pro spend on the Space; Team/Team Plus pool at
the Brokerage. Complimentary and platform-admin spaces are unlimited (usage
still recorded).

## 3. Unit economics

`CREDIT_COGS_BUDGET_USD = 0.0065`. One credit may cover that much model COGS.
Full-allotment burn must keep ≥ 60% gross margin on every tier. The binding
tier is the Team Plus add-on seat.

`creditsForCostUsd(cost) = max(1, ceil(cost / 0.0065))`. The SQL trigger on
`ChatUsage` must stay in sync with this helper.

`/admin/agent-stats` compares ChatUsage.costUsd to the pro-rated grant
budget. The cleanup cron Sentry-warns when a paid space burns more than
3× that daily budget (`lib/billing/cost-vs-credits.ts`).

Pipeline audit is 50 credits per 100 active leads (`PIPELINE_AUDIT_LEAD_CAP`).

## 4. Credits

### 4.1 Account

Resolved only from a trusted server `spaceId`. Never from the client.

### 4.2 Grants

Paid plans: recurring monthly grant. Free: one-time 100, `expiresAt = null`.
Unused lots roll over **30 days** (`CREDIT_ROLLOVER_DAYS`). Marketing copy must
match this number.

### 4.3 Ledger

Append-only lots + transactions. Balance = Σ remaining on non-expired lots.
Spend is FIFO, oldest-expiring first (`spend_credits` RPC). Service-role
bypasses RLS — the `account` argument is the tenant boundary.

### 4.4 Workflow prices

From `WORKFLOW_CREDIT_COST`:

| Workflow | Credits |
|---|---:|
| pipeline_audit | 50 |
| followup_sequence | 40 |
| lead_qualification | 25 |
| tour_booking | 15 |
| daily_briefing | 10 |
| call_prep | 3 |
| lead_score | 1 |
| chat_turn | 1 |

`assertCanSpend` runs before work; `chargeWorkflow` runs after success.
`CREDITS_ENFORCED` is ON unless exactly `false`. Infra errors in the gate
fail open (log + allow) so a DB blip cannot lock a paying customer — page
on those warn logs at scale.

## 5. Top-ups

One-time Stripe `mode=payment`. Free cannot buy them. Packs:

| Id | Credits | USD |
|---|---:|---:|
| starter | 800 | 29 |
| growth | 2,000 | 69 |
| power | 4,500 | 149 |

Counts were sized so each pack clears 60% margin at worst-case COGS without
changing the live Stripe dollar amounts.

## 6. Checkout and webhooks

Plan + cadence come from the **live subscription price** via
`planFromPriceId()`, not from `metadata.plan` stamped at checkout (that goes
stale on portal changes).

## 7. Display FX

Marketing can show pinned rates in `lib/i18n/currency.ts`. Checkout still
charges USD until local Stripe `currency_options` ship. Re-pin rates
deliberately; never live FX.
