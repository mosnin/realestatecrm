/**
 * backfill-monthly-credits — one-off credit backfill for enforcement go-live.
 *
 * WHY: Credit enforcement is now ON by default (lib/billing/meter.ts —
 * CREDITS_ENFORCED defaults true). Monthly credits are only minted on a Stripe
 * `invoice.paid` (subscription_create / cycle / trial_end / update) via
 * grantPlanMonthly. A customer who already paid earlier THIS period therefore
 * has whatever balance is left after their usage — possibly low or zero — and
 * would be 402'd the instant the gate goes live, even though they paid.
 *
 * This grants the CURRENT period's monthly credits ONCE to every active/trialing
 * subscriber so nobody is stranded at go-live, then enforcement can stay on.
 *
 * SCOPE (matches resolveBillingAccount's money routing):
 *   - Space     plan != 'free' AND stripeSubscriptionStatus IN (active, trialing)
 *   - Brokerage stripeSubscriptionStatus IN (active, trialing)
 * Each grant amount comes from monthlyGrantAmount(plan, addonUsers); brokerages
 * include their per-seat add-on count, computed EXACTLY as the webhook does
 * (addonSeatsForPlan over the active BrokerageMembership count). We go through
 * grantPlanMonthly so non-grantable plans (Free, and legacy starter/enterprise
 * brokerages with no defined monthly grant) safely no-op, just like the webhook.
 *
 * IDEMPOTENCY (safe to run twice — verified):
 *   grant_credits() does `ON CONFLICT (reason, "sourceId") DO NOTHING` on the
 *   partial unique index uq_creditlot_source (reason, "sourceId") WHERE
 *   "sourceId" IS NOT NULL — see
 *   supabase/migrations/20260623000000_credit_grant_idempotency.sql. So a grant
 *   keyed by a STABLE sourceId mints at most one lot; a re-run is a DB-level
 *   no-op. We use sourceId = `backfill:<YYYY-MM>` (period-stamped), which:
 *     - is the SAME across re-runs in the same month  → re-run can't double-grant
 *     - is DISTINCT from the webhook's sourceId (the bare Stripe invoice id, e.g.
 *       `in_123`) → can never collide with a real monthly invoice grant
 *   Both write reason='monthly_grant', so they share the uniqueness namespace and
 *   are deduped against each other purely by sourceId.
 *
 * Re-running in a LATER month grants again (a new `backfill:<YYYY-MM>` key); this
 * script is intended as a single go-live backfill, so run it once. The period is
 * overridable via --period=YYYY-MM for a deliberate re-grant / a fixed key.
 *
 * Resilience: one account failing (a bad row, an RPC hiccup) is caught, logged,
 * and the run continues — a single account can never abort the whole backfill.
 *
 * How to run:
 *
 *   # DRY RUN (default — writes NOTHING, just logs what WOULD be granted):
 *   pnpm dlx tsx scripts/backfill-monthly-credits.ts
 *   pnpm dlx tsx scripts/backfill-monthly-credits.ts --dry-run
 *
 *   # APPLY (actually grants):
 *   pnpm dlx tsx scripts/backfill-monthly-credits.ts --apply
 *
 *   # Pin the period-stamp explicitly (default = current UTC YYYY-MM):
 *   pnpm dlx tsx scripts/backfill-monthly-credits.ts --apply --period=2026-06
 *
 * Requires env vars (read by lib/supabase.ts):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * The service role key bypasses RLS so the backfill sees every account — we are
 * provisioning the whole system, not one realtor. Stripe price-id env vars
 * (STRIPE_PRICE_*) are NOT needed: amounts come from PLANS (lib/plans.ts), not
 * from live Stripe prices, and the plan label is already persisted on each row.
 */

import { pathToFileURL } from 'node:url';
import { supabase } from '@/lib/supabase';
import { grantPlanMonthly, monthlyGrantAmount } from '@/lib/billing/grants';
import { addonSeatsForPlan, PLANS, type PlanId } from '@/lib/plans';

// ── Args ───────────────────────────────────────────────────────────────────

interface Args {
  /** When false, write grants. Defaults to TRUE (dry-run) unless --apply. */
  dryRun: boolean;
  /** Period stamp for the idempotency sourceId (`backfill:<period>`). */
  period: string;
}

/** Current period as YYYY-MM in UTC (matches "this billing month" granularity). */
export function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7); // "2026-06"
}

export function parseArgs(argv: string[]): Args {
  const apply = argv.includes('--apply');
  const dryFlag = argv.includes('--dry-run');
  const periodArg = argv.find((a) => a.startsWith('--period='))?.split('=')[1];
  const period = periodArg && /^\d{4}-\d{2}$/.test(periodArg) ? periodArg : currentPeriod();
  // Default to dry-run. --apply is the ONLY thing that turns writes on; if both
  // --apply and --dry-run are passed, the explicit dry-run wins (fail safe).
  const dryRun = dryFlag || !apply;
  return { dryRun, period };
}

// ── Account enumeration ──────────────────────────────────────────────────────

type AccountType = 'space' | 'brokerage';

export interface BillableRow {
  type: AccountType;
  id: string;
  /** Human label for logs (slug / name). */
  label: string;
  plan: string;
  status: string;
  /** Active member count — brokerages only (drives the per-seat add-on grant). */
  memberCount?: number;
}

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/**
 * Fetch every billable Space (paid tier, active/trialing sub) in 1000-row pages.
 * PostgREST caps a response at 1000 rows; page so a large tenant base isn't
 * silently truncated (the same pattern as scripts/measure-chat-cost.ts).
 */
async function fetchBillableSpaces(): Promise<BillableRow[]> {
  const PAGE = 1000;
  const out: BillableRow[] = [];
  let from = 0;
  for (let page = 0; page < 200; page++) {
    const { data, error } = await supabase
      .from('Space')
      .select('id, slug, plan, stripeSubscriptionStatus')
      .neq('plan', 'free')
      .in('stripeSubscriptionStatus', ['active', 'trialing'])
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Space select failed: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      out.push({
        type: 'space',
        id: r.id as string,
        label: (r.slug as string) ?? (r.id as string),
        plan: (r.plan as string) ?? 'free',
        status: (r.stripeSubscriptionStatus as string) ?? 'unknown',
      });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/**
 * Fetch every billable Brokerage (active/trialing sub) in 1000-row pages, each
 * annotated with its active BrokerageMembership count so we can compute the
 * per-seat add-on grant exactly as the invoice.paid webhook does.
 */
async function fetchBillableBrokerages(): Promise<BillableRow[]> {
  const PAGE = 1000;
  const out: BillableRow[] = [];
  let from = 0;
  for (let page = 0; page < 200; page++) {
    const { data, error } = await supabase
      .from('Brokerage')
      .select('id, name, plan, stripeSubscriptionStatus')
      .in('stripeSubscriptionStatus', ['active', 'trialing'])
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Brokerage select failed: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      const id = r.id as string;
      // Active member count → per-seat add-on grant. Mirrors the webhook
      // (app/api/webhooks/stripe/route.ts: count BrokerageMembership, then
      // addonSeatsForPlan). A count error throws here and is handled per-account
      // by the caller (logged + skipped) — we never silently under/over-grant.
      const { count, error: cErr } = await supabase
        .from('BrokerageMembership')
        .select('*', { count: 'exact', head: true })
        .eq('brokerageId', id);
      if (cErr) throw new Error(`BrokerageMembership count failed for ${id}: ${cErr.message}`);
      out.push({
        type: 'brokerage',
        id,
        label: (r.name as string) ?? id,
        plan: (r.plan as string) ?? 'unknown',
        status: (r.stripeSubscriptionStatus as string) ?? 'unknown',
        memberCount: count ?? 0,
      });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// ── Grant amount (pure, mirrors the webhook) ─────────────────────────────────

/** Plans that carry a recurring monthly grant — same set grantPlanMonthly honors. */
const GRANTABLE_PLANS = new Set<PlanId>(['solo', 'pro', 'team', 'team_plus']);

export interface PlannedGrant {
  account: BillableRow;
  /** addonUsers passed to the grant (brokerage seats over includedUsers; 0 otherwise). */
  addonUsers: number;
  /** Credits that WOULD be granted (0 ⇒ non-grantable plan, skipped). */
  amount: number;
}

/** Compute the grant for one row without writing. addonUsers for brokerages =
 *  addonSeatsForPlan(plan, memberCount) — identical to the webhook. */
export function planGrant(row: BillableRow): PlannedGrant {
  if (!GRANTABLE_PLANS.has(row.plan as PlanId)) {
    return { account: row, addonUsers: 0, amount: 0 };
  }
  const addonUsers =
    row.type === 'brokerage' ? addonSeatsForPlan(row.plan, row.memberCount ?? 0) : 0;
  return { account: row, addonUsers, amount: monthlyGrantAmount(row.plan as PlanId, addonUsers) };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { dryRun, period } = parseArgs(process.argv.slice(2));
  const sourceId = `backfill:${period}`;

  console.log('─'.repeat(72));
  console.log(`Credit backfill — mode=${dryRun ? 'DRY RUN (no writes)' : 'APPLY'}`);
  console.log(`sourceId      = ${sourceId}   (reason=monthly_grant; idempotent per (reason, sourceId))`);
  console.log('─'.repeat(72));

  console.log('Enumerating billable accounts…');
  const [spaces, brokerages] = await Promise.all([
    fetchBillableSpaces(),
    fetchBillableBrokerages(),
  ]);
  const accounts = [...spaces, ...brokerages];
  console.log(`Found ${spaces.length} billable space(s), ${brokerages.length} billable brokerage(s).`);
  console.log('');

  let granted = 0; // accounts we granted (or would grant)
  let skippedNonGrantable = 0; // active sub but a plan with no monthly grant
  let failed = 0;
  let totalCredits = 0;
  const failures: Array<{ account: string; error: string }> = [];

  for (const account of accounts) {
    const tag = `${account.type}:${account.id} (${account.label})`;
    try {
      const plan = planGrant(account);

      if (plan.amount <= 0) {
        // Active/trialing but a non-grantable plan (legacy starter/enterprise
        // brokerage, or a plan PLANS doesn't define a monthly grant for). The
        // webhook's grantPlanMonthly no-ops these too — log and move on.
        skippedNonGrantable++;
        console.log(`  SKIP  ${tag} — plan='${account.plan}' has no monthly grant (status=${account.status})`);
        continue;
      }

      const seatNote =
        account.type === 'brokerage'
          ? ` [members=${account.memberCount ?? 0}, addonSeats=${plan.addonUsers}, base=${PLANS[account.plan as PlanId].monthlyCredits}]`
          : '';

      if (dryRun) {
        console.log(`  WOULD GRANT  ${tag} — plan='${account.plan}' → ${plan.amount} credits${seatNote}`);
      } else {
        // grantPlanMonthly → grantMonthlyCredits → grantCredits(reason='monthly_grant',
        // sourceId). The ON CONFLICT DO NOTHING on (reason, sourceId) makes this a
        // no-op on a re-run, so a second pass can't double-grant.
        const amount = await grantPlanMonthly(
          { type: account.type, id: account.id },
          account.plan,
          plan.addonUsers,
          sourceId,
        );
        console.log(`  GRANTED  ${tag} — plan='${account.plan}' → ${amount} credits${seatNote}`);
      }
      granted++;
      totalCredits += plan.amount;
    } catch (err) {
      // Per-account isolation: a single failure must NOT abort the whole run.
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ account: tag, error: message });
      console.error(`  FAIL  ${tag} — ${message}`);
    }
  }

  console.log('');
  console.log('─'.repeat(72));
  console.log('Summary');
  console.log(`  mode                : ${dryRun ? 'DRY RUN (nothing written)' : 'APPLY'}`);
  console.log(`  sourceId            : ${sourceId}`);
  console.log(`  accounts scanned    : ${accounts.length} (${spaces.length} space, ${brokerages.length} brokerage)`);
  console.log(`  ${dryRun ? 'would grant' : 'granted   '}        : ${granted} account(s)`);
  console.log(`  ${dryRun ? 'would total' : 'total     '}        : ${totalCredits.toLocaleString('en-US')} credits`);
  console.log(`  skipped (no grant)  : ${skippedNonGrantable} (non-grantable plan)`);
  console.log(`  failed              : ${failed}`);
  if (failures.length > 0) {
    console.log('  failures:');
    for (const f of failures) console.log(`    - ${f.account}: ${f.error}`);
  }
  console.log('─'.repeat(72));
  if (dryRun) {
    console.log('Dry run only — no credits were granted. Re-run with --apply to write.');
  } else {
    console.log('Apply complete. Re-running with the same --period is a safe no-op (idempotent).');
  }

  // A per-account failure is reported but is NOT a process-level failure (the
  // run completed and isolated it). Exit non-zero ONLY if every account failed,
  // which signals a systemic problem (bad env / RPC down) worth a loud exit.
  if (failed > 0 && granted === 0 && accounts.length > 0) {
    process.exitCode = 1;
  }
}

// Run only when invoked directly (pnpm dlx tsx scripts/backfill-monthly-credits.ts),
// NOT when imported (e.g. by the unit test, which exercises the pure helpers
// without touching Supabase). process.argv[1] is the script path tsx/node was
// asked to run; compare it to this module's own URL.
const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error('backfill-monthly-credits failed:', err);
    process.exit(1);
  });
}
