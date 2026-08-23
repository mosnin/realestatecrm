'use client';

/**
 * BrokerageSubscribe — self-serve Team / Team Plus checkout for the brokerage
 * owner, shown on /broker/billing when the brokerage has no active subscription.
 *
 * A small dedicated client component (rather than retrofitting BillingPage,
 * whose handlers are slug/Space-shaped): it POSTs the brokerage scope to
 * /api/billing/checkout — { scope:'brokerage', plan, cadence } — and navigates
 * to the returned Stripe Checkout url (or a {redirect} for a payment-issue
 * subscription). The Monthly/Annual choice only renders for plans whose annual
 * price is actually configured (annualEnabled, computed server-side via
 * isAnnualAvailable) so we never offer an annual that checkout would refuse.
 */

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PLANS } from '@/lib/plans';

type BrokeragePlanId = 'team' | 'team_plus';
type Cadence = 'monthly' | 'annual';

/** 20% off the monthly rate — the discounted monthly-equivalent shown for
 *  annual, matching the marketing page + the seat-add-on annual discount. The
 *  real charge is whatever the annual Stripe price is; this is display only. */
const ANNUAL_FACTOR = 0.8;
const annualMonthly = (monthly: number) => Math.round(monthly * ANNUAL_FACTOR);

const PLAN_BLURB: Record<BrokeragePlanId, string> = {
  team: 'A shared command center for scoring, routing, and accountability across your floor.',
  team_plus: 'Brokerage-level workflow with more seats, more credits, and a better per-seat rate.',
};

export function BrokerageSubscribe({
  annualEnabled,
}: {
  /** Per-plan annual availability (server-derived via isAnnualAvailable). The
   *  cadence toggle only appears when at least one shown plan supports annual. */
  annualEnabled: Record<BrokeragePlanId, boolean>;
}) {
  const [cadence, setCadence] = useState<Cadence>('annual');
  // Which plan's button is mid-request (so only that one spins, and a second
  // click can't open a second Checkout session).
  const [busyPlan, setBusyPlan] = useState<BrokeragePlanId | null>(null);
  const [error, setError] = useState('');

  const anyAnnual = annualEnabled.team || annualEnabled.team_plus;
  // If the selected cadence is annual but the toggle is hidden (no plan supports
  // it), fall back to monthly for the request payload.
  const effectiveCadence: Cadence = cadence === 'annual' && anyAnnual ? 'annual' : 'monthly';

  async function subscribe(plan: BrokeragePlanId) {
    if (busyPlan) return;
    setBusyPlan(plan);
    setError('');
    // Per-plan annual guard: a plan may not have annual even when another does.
    const planCadence: Cadence =
      effectiveCadence === 'annual' && annualEnabled[plan] ? 'annual' : 'monthly';
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'brokerage', plan, cadence: planCadence }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setError(typeof data.error === 'string' ? data.error : 'Could not start checkout.');
      setBusyPlan(null);
    } catch {
      setError("That didn't go through. Usually temporary.");
      setBusyPlan(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-sm">Choose a team plan</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Start a 7-day free trial. Card required, cancel anytime.
          </p>
        </div>
        {anyAnnual && <CadenceToggle cadence={cadence} setCadence={setCadence} />}
      </div>

      <div className="px-6 py-5">
        {error && (
          <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2.5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {(['team', 'team_plus'] as BrokeragePlanId[]).map((id) => (
            <PlanCard
              key={id}
              planId={id}
              cadence={effectiveCadence}
              annualForThisPlan={effectiveCadence === 'annual' && annualEnabled[id]}
              busy={busyPlan === id}
              disabled={busyPlan !== null}
              onSubscribe={() => subscribe(id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  planId,
  cadence,
  annualForThisPlan,
  busy,
  disabled,
  onSubscribe,
}: {
  planId: BrokeragePlanId;
  cadence: Cadence;
  annualForThisPlan: boolean;
  busy: boolean;
  disabled: boolean;
  onSubscribe: () => void;
}) {
  const p = PLANS[planId];
  // Show the discounted monthly-equivalent only when annual actually applies to
  // THIS plan (the toggle is global; a plan without annual still shows monthly).
  const showAnnual = cadence === 'annual' && annualForThisPlan;
  const price = showAnnual ? annualMonthly(p.priceMonthly) : p.priceMonthly;

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-background p-5">
      <p className="text-sm font-semibold">{p.label}</p>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums">${price}</span>
        <span className="text-sm text-muted-foreground">/mo</span>
        {showAnnual && (
          <span className="text-xs text-muted-foreground line-through tabular-nums">
            ${p.priceMonthly}
          </span>
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {showAnnual ? `billed annually at $${price * 12}/yr` : 'billed monthly'}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {p.includedUsers} seats included
        {p.addUser ? `, then $${p.addUser.priceMonthly}/seat` : ''}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{PLAN_BLURB[planId]}</p>

      <p className="mt-3 text-sm">
        <span className="font-semibold tabular-nums">{p.monthlyCredits.toLocaleString()}</span>{' '}
        <span className="text-muted-foreground">credits / month</span>
      </p>

      <Button
        onClick={onSubscribe}
        disabled={disabled}
        size="sm"
        className={cn('mt-5 w-full gap-1.5')}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        {busy ? 'Taking you to checkout' : `Start ${p.label}`}
        {!busy && <ArrowRight size={14} />}
      </Button>
    </div>
  );
}

function CadenceToggle({
  cadence,
  setCadence,
}: {
  cadence: Cadence;
  setCadence: (c: Cadence) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-muted/40 p-1">
      <button
        type="button"
        onClick={() => setCadence('monthly')}
        className={cn(
          'rounded-full px-3 py-1 text-xs transition-colors',
          cadence === 'monthly' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground',
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => setCadence('annual')}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors',
          cadence === 'annual' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground',
        )}
      >
        Annual
        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Save 20%
        </span>
      </button>
    </div>
  );
}
