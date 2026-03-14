import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { BillingPage } from '@/components/billing/billing-page';

export default async function Billing({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Billing</h2>
        <p className="text-muted-foreground">Manage your subscription and payment details</p>
      </div>
      {/*
        TODO: When Stripe is live, fetch subscription status here:
        const subscription = await stripe.subscriptions.retrieve(space.stripeSubscriptionId);
        Pass status, currentPeriodEnd, paymentMethod, and invoices as props.
      */}
      <BillingPage slug={slug} subscriptionStatus="inactive" />
    </div>
  );
}
