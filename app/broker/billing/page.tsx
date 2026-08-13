import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { PurchasePixel } from '@/components/analytics/purchase-pixel';
import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { BillingPage } from '@/components/billing/billing-page';
import { BrokerageSubscribe } from '@/components/billing/brokerage-subscribe';
import { CreditsSummary } from '@/components/billing/credits-summary';
import { isAnnualAvailable, type PlanId } from '@/lib/plans';
import { getStripe } from '@/lib/stripe';
import { SplitReveal } from '@/components/motion';
import type Stripe from 'stripe';
import type { Metadata } from 'next';
import { BROKER_PAGE_READING } from '@/components/broker/premium';

export const metadata: Metadata = { title: 'Billing — Teams — Chippi' };

export default async function BrokerBillingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const ctx = await getBrokerContext();
  if (!ctx) redirect('/setup');

  // The brokerage's OWN Stripe identity — written by the brokerage-scoped
  // checkout and kept current by the webhook. When a brokerage subscription
  // exists, it is the billing entity for this page; the owner's personal Space
  // is only a legacy fallback (brokerages subscribed before brokerage billing).
  const { data: brokerageStripe } = await supabase
    .from('Brokerage')
    .select('stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd')
    .eq('id', ctx.brokerage.id)
    .maybeSingle();

  // Find the user's own space for billing
  const { data: ownSpaceRow } = await supabase
    .from('Space')
    .select('id, slug, name, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd')
    .eq('ownerId', ctx.dbUserId)
    .maybeSingle();

  // If user has no personal space, find the brokerage owner's space
  let spaceRow = ownSpaceRow;
  if (!spaceRow) {
    const { data: ownerSpace } = await supabase
      .from('Space')
      .select('id, slug, name, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd')
      .eq('ownerId', ctx.brokerage.ownerId)
      .maybeSingle();
    spaceRow = ownerSpace;
  }

  const usingBrokerageEntity = Boolean(brokerageStripe?.stripeSubscriptionId);

  // Annual availability (server-derived) for the self-serve Team/Team Plus
  // picker — Stripe annual price ids are server-only env, so it's computed here.
  const annualEnabled = {
    team: isAnnualAvailable('team'),
    team_plus: isAnnualAvailable('team_plus'),
  };

  // Only the broker_owner can manage / start billing. Others see a read-only
  // message (checked BEFORE the no-workspace branch so a non-owner never gets
  // the setup prompt).
  const isBrokerOwner = ctx.membership.role === 'broker_owner';
  if (!isBrokerOwner) {
    return (
      <div className={`${BROKER_PAGE_READING} max-w-3xl`} data-broker-premium-page="billing">
        <BillingHeader status="The brokerage owner manages billing." />
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">Billing lives with the owner.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Ask the brokerage owner to make changes to the subscription.
          </p>
        </div>
      </div>
    );
  }

  // Owner with no billing entity set up yet (no Space, no brokerage sub) — e.g.
  // a broker_only owner who just created the brokerage. The brokerage IS the
  // billing entity, so we DON'T dead-end on "set up a workspace"; we show the
  // self-serve Team / Team Plus checkout directly (a brokerage-scoped checkout
  // needs no Space).
  if (!spaceRow && !usingBrokerageEntity) {
    return (
      <div className={`${BROKER_PAGE_READING} max-w-3xl`} data-broker-premium-page="billing">
        <BillingHeader status="Choose a plan to get your brokerage started." />
        <BrokerageSubscribe annualEnabled={annualEnabled} />
      </div>
    );
  }

  // Billing entity: the Brokerage's subscription when it has one, else the
  // legacy owner-space subscription. The previous version of this page ONLY
  // read the owner's personal Space, so a brokerage-scoped subscription showed
  // the wrong status/invoices/card here.
  const billingSubscriptionId = usingBrokerageEntity
    ? (brokerageStripe!.stripeSubscriptionId as string)
    : ((spaceRow?.stripeSubscriptionId as string | null) ?? null);
  const billingCustomerId = usingBrokerageEntity
    ? ((brokerageStripe!.stripeCustomerId as string | null) ?? null)
    : ((spaceRow?.stripeCustomerId as string | null) ?? null);

  const slug = (spaceRow?.slug as string | undefined) ?? '';
  let subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' = usingBrokerageEntity
    ? mapDbStatus(brokerageStripe?.stripeSubscriptionStatus)
    : mapDbStatus(spaceRow?.stripeSubscriptionStatus);
  let currentPeriodEnd: string | undefined;
  let cardLast4: string | undefined;
  let cardBrand: string | undefined;
  let invoices: { id: string; date: string; amount: string; status: 'paid' | 'open' | 'void'; pdf?: string }[] = [];
  let stripeError = false;

  if (billingSubscriptionId) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(billingSubscriptionId, {
        expand: ['default_payment_method', 'latest_invoice'],
      });

      subscriptionStatus = mapStatus(sub.status);
      const periodEndTs = sub.items.data[0]?.current_period_end ?? sub.start_date;
      currentPeriodEnd = new Date(periodEndTs * 1000).toISOString();

      const pm = sub.default_payment_method as Stripe.PaymentMethod | null;
      if (pm?.card) {
        cardLast4 = pm.card.last4;
        cardBrand = pm.card.brand;
      }

      if (billingCustomerId) {
        const invoiceList = await stripe.invoices.list({
          customer: billingCustomerId,
          limit: 10,
        });
        invoices = invoiceList.data.map((inv) => ({
          id: inv.id,
          date: new Date((inv.created ?? 0) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          amount: `$${((inv.amount_paid ?? 0) / 100).toFixed(2)}`,
          status: inv.status === 'paid' ? 'paid' as const : inv.status === 'open' ? 'open' as const : 'void' as const,
          pdf: inv.invoice_pdf ?? undefined,
        }));
      }
    } catch (err) {
      console.error('[broker/billing] Stripe fetch failed:', err);
      stripeError = true;
    }
  }

  if (stripeError) {
    return (
      <div className={`${BROKER_PAGE_READING} max-w-3xl`} data-broker-premium-page="billing">
        <BillingHeader status="Manage your subscription and payment details." />
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-10 text-center">
          <p className="text-sm font-medium text-destructive">
            Couldn&apos;t load billing.
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[320px] mx-auto">
            We couldn&apos;t reach Stripe — usually temporary. Try again in a bit, or contact support if it sticks.
          </p>
        </div>
      </div>
    );
  }

  // Self-serve Team / Team Plus checkout — shown only when the brokerage has no
  // active/trialing subscription on EITHER entity (brokerage or legacy Space),
  // which is exactly what subscriptionStatus reflects here. We reach this point
  // only as the broker_owner (non-owners returned early above). annualEnabled
  // was computed above (shared with the no-billing-entity branch).
  const brokerageSubscribed =
    subscriptionStatus === 'active' || subscriptionStatus === 'trialing';

  return (
    <div className={`${BROKER_PAGE_READING} max-w-3xl`} data-broker-premium-page="billing">
      <BillingHeader status="Manage your subscription and payment details." />
      {!brokerageSubscribed && <BrokerageSubscribe annualEnabled={annualEnabled} />}
      <BillingPage
        slug={slug}
        plan={(((ctx.brokerage as { plan?: string }).plan) ?? 'free') as PlanId}
        subscriptionStatus={subscriptionStatus}
        currentPeriodEnd={currentPeriodEnd}
        cardLast4={cardLast4}
        cardBrand={cardBrand}
        invoices={invoices}
        // Manage/cancel must act on the brokerage's Stripe identity when the
        // brokerage holds the subscription — the default routes act on a Space
        // the caller owns, which is the wrong entity for a brokerage sub.
        endpoints={
          usingBrokerageEntity
            ? { portal: '/api/broker/billing/portal', cancel: '/api/broker/billing/cancel' }
            : undefined
        }
        // Suppress BillingPage's own Subscribe/Resubscribe buttons. When the
        // brokerage isn't subscribed we render <BrokerageSubscribe> above (the
        // plan picker that POSTs scope:'brokerage' to /api/billing/checkout —
        // the correct entity). BillingPage's subscribe handler posts only
        // { slug } to the Space checkout flow, which 400s for a broker_only
        // owner (slug='') and bills the wrong Stripe entity for legacy owners.
        hideSubscribe
      />
      {/* Credits are keyed to the runtime space; a brokerage-entity broker
          with no personal Space simply has no per-space summary to show. */}
      {spaceRow && <CreditsSummary spaceId={spaceRow.id as string} slug={slug} />}
    </div>
  );
}

// Serif H1 + status-sentence header, shared across every billing state so the
// page reads as one product whether Stripe loads, errors, or is read-only.
function BillingHeader({ status }: { status: string }) {
  return (
    <header className="space-y-1.5">
      {/* Fires a Meta Pixel Purchase when returning from a completed checkout. */}
      <Suspense fallback={null}>
        <PurchasePixel />
      </Suspense>
      <p className="text-sm text-muted-foreground">Billing.</p>
      <h1
        className="text-3xl tracking-tight text-foreground"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        <SplitReveal as="span" text="Your subscription" />
      </h1>
      <p className="text-sm text-muted-foreground">{status}</p>
    </header>
  );
}

function mapStatus(status: Stripe.Subscription.Status): 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' {
  switch (status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': return 'past_due';
    case 'canceled': return 'canceled';
    default: return 'inactive';
  }
}

/** DB statuses include 'unpaid', which the BillingPage props don't model —
 *  collapse it to past_due (same user-facing meaning: payment needs attention). */
function mapDbStatus(
  status: string | null | undefined,
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' {
  switch (status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due':
    case 'unpaid': return 'past_due';
    case 'canceled': return 'canceled';
    default: return 'inactive';
  }
}
