import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { PurchasePixel } from '@/components/analytics/purchase-pixel';
import { getSpaceFromSlug } from '@/lib/space';
import { BillingPage } from '@/components/billing/billing-page';
import { CreditsSummary } from '@/components/billing/credits-summary';
import type { PlanId } from '@/lib/plans';
import { getStripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import { H1 } from '@/lib/typography';
import { Reveal, SplitReveal } from '@/components/motion';
import { cn } from '@/lib/utils';
import {
  SupportingActionLink,
  SupportingMetric,
  SupportingMetricBand,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

export default async function Billing({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' =
    (space.stripeSubscriptionStatus as any) ?? 'inactive';
  let currentPeriodEnd: string | undefined;
  let cardLast4: string | undefined;
  let cardBrand: string | undefined;
  let invoices: { id: string; date: string; amount: string; status: 'paid' | 'open' | 'void'; pdf?: string }[] = [];

  // Fetch live data from Stripe if a subscription exists
  if (space.stripeSubscriptionId) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(space.stripeSubscriptionId, {
        expand: ['default_payment_method', 'latest_invoice'],
      });

      subscriptionStatus = mapStatus(sub.status);
      const periodEndTs = sub.items.data[0]?.current_period_end ?? sub.start_date;
      currentPeriodEnd = new Date(periodEndTs * 1000).toISOString();

      // Payment method
      const pm = sub.default_payment_method as Stripe.PaymentMethod | null;
      if (pm?.card) {
        cardLast4 = pm.card.last4;
        cardBrand = pm.card.brand;
      }

      // Invoices — fetch recent
      if (space.stripeCustomerId) {
        const invoiceList = await stripe.invoices.list({
          customer: space.stripeCustomerId,
          limit: 10,
        });
        invoices = invoiceList.data.map((inv) => ({
          id: inv.id,
          date: new Date((inv.created ?? 0) * 1000).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          amount: `$${((inv.amount_paid ?? 0) / 100).toFixed(2)}`,
          status: inv.status === 'paid' ? 'paid' : inv.status === 'open' ? 'open' : 'void',
          pdf: inv.invoice_pdf ?? undefined,
        }));
      }
    } catch (err) {
      console.error('[billing] Failed to fetch Stripe data', err);
      // Fall back to DB-stored status
    }
  }

  const statusLabel =
    subscriptionStatus === 'active' ? 'Subscription active.' :
    subscriptionStatus === 'trialing' ? 'Trial in progress.' :
    subscriptionStatus === 'past_due' ? 'Payment past due — update your card to keep access.' :
    subscriptionStatus === 'canceled' ? 'Subscription canceled.' :
    'No active subscription.';

  return (
    <SupportingPage family="control" width="wide">
      {/* Fires a Meta Pixel Purchase when returning from a completed checkout. */}
      <Suspense fallback={null}>
        <PurchasePixel />
      </Suspense>
      <SupportingOrientation
        family="control"
        eyebrow="Account / Billing"
        title={<SplitReveal as="span" text="Keep the operating system funded" />}
        summary={statusLabel}
        nextAction={subscriptionStatus === 'past_due' ? 'Update the payment method now so active work is not interrupted.' : subscriptionStatus === 'inactive' ? 'Choose the plan that matches the book of business you want Chippi to run.' : 'Review credit usage and the next billing date before changing the plan.'}
        action={<SupportingActionLink href={`/s/${slug}/settings`} quiet>Back to settings</SupportingActionLink>}
      />
      <SupportingMetricBand>
        <SupportingMetric label="Plan" value={(((space as { plan?: string }).plan) ?? 'free')} detail="current workspace tier" />
        <SupportingMetric label="Status" value={subscriptionStatus.replace('_', ' ')} detail="subscription state" accent />
        <SupportingMetric label="Next cycle" value={currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'} detail="billing date" />
        <SupportingMetric label="Payment" value={cardLast4 ? `•••• ${cardLast4}` : 'Not set'} detail={cardLast4 ? cardBrand : 'add in billing portal'} />
      </SupportingMetricBand>
      <SupportingWorkArea className="grid gap-10 lg:grid-cols-[minmax(0,0.66fr)_minmax(19rem,0.34fr)] lg:items-start">
      <Reveal className="min-w-0">
        <BillingPage
          slug={slug}
          plan={(((space as { plan?: string }).plan) ?? 'free') as PlanId}
          subscriptionStatus={subscriptionStatus}
          currentPeriodEnd={currentPeriodEnd}
          cardLast4={cardLast4}
          cardBrand={cardBrand}
          invoices={invoices}
        />
      </Reveal>
      <Reveal delay={0.08} className="lg:sticky lg:top-8">
        <CreditsSummary spaceId={space.id} slug={slug} />
      </Reveal>
      </SupportingWorkArea>
    </SupportingPage>
  );
}

function mapStatus(
  status: Stripe.Subscription.Status,
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' {
  switch (status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': return 'past_due';
    case 'canceled': return 'canceled';
    default: return 'inactive';
  }
}
