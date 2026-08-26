import { NextRequest, NextResponse } from 'next/server';
import { getStripe, pickSpacePriceId } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { hasCurrentSubscription, requireSpaceAccountOwner } from '@/lib/api-auth';
import { getBrokerContext } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { PLANS, addonSeatsForPlan, isAnnualAvailable } from '@/lib/plans';
import type Stripe from 'stripe';

type BrokeragePlan = 'team' | 'team_plus';

/** Billing cadence the buyer chose. Defaults to monthly (the historical
 *  behavior — existing clients post no cadence). 'annual' selects the
 *  stripePriceAnnual ids; the route refuses checkout if the required annual
 *  price isn't configured (no fake annual → silent monthly fallback). */
type Cadence = 'monthly' | 'annual';

/** Normalize an untrusted cadence hint from the POST body. Anything that isn't
 *  the literal 'annual' resolves to 'monthly' (the safe default). */
function resolveCadence(raw: unknown): Cadence {
  return raw === 'annual' ? 'annual' : 'monthly';
}

/**
 * Avoid both sides of a stale-webhook failure: a stale active/trialing row must
 * not dead-end a canceled customer, but it also must not permit a duplicate
 * subscription when Stripe is actually current. Persisted current periods can
 * short-circuit; stale periods are verified read-only against Stripe. If that
 * verification is unavailable, fail closed against duplicate billing.
 */
async function hasVerifiedCurrentSubscription(
  stripe: Stripe,
  subscriptionId: string | null | undefined,
  status: string | null | undefined,
  periodEnd: string | null | undefined,
): Promise<boolean | null> {
  if (
    (status === 'active' || status === 'trialing') &&
    hasCurrentSubscription(status, periodEnd)
  ) {
    return true;
  }
  if (!subscriptionId) return false;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    // Stripe is authoritative once queried live. A live active/trialing status
    // blocks checkout even if a period timestamp is delayed or unusual.
    return subscription.status === 'active' || subscription.status === 'trialing';
  } catch (err) {
    console.error('[checkout] Could not verify stale subscription against Stripe:', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const scope = body?.scope;

    if (scope === 'brokerage') {
      return handleBrokerageCheckout(req, body);
    }

    // ── Space flow ─────────────────────────────────────────────────────────
    const { slug } = body;
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    // The tier the buyer selected. Default to Solo for backward compatibility
    // (the existing client posts only { slug }). This is the single source of
    // truth for BOTH the price charged and the plan label provisioned, so the
    // two can never disagree the way they did when price came from a lone
    // STRIPE_PRICE_ID env and the label was reverse-derived from it.
    const spacePlan: 'solo' | 'pro' = body?.plan === 'pro' ? 'pro' : 'solo';

    // Billing cadence (monthly default). Resolved here; the annual-availability
    // refusal happens after auth (below) to keep auth-first ordering.
    const cadence = resolveCadence(body?.cadence);

    const auth = await requireSpaceAccountOwner(slug);
    if (auth instanceof NextResponse) return auth;
    const { userId, space } = auth;

    const { allowed } = await checkRateLimit(`billing:${userId}`, 5, 60);
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    // When 'annual', the plan's annual price must be configured — refuse rather
    // than silently charge monthly (no fake annual).
    if (cadence === 'annual' && !isAnnualAvailable(spacePlan)) {
      return NextResponse.json({ error: 'annual-not-available' }, { status: 409 });
    }

    // Fetch Stripe columns separately (getSpaceFromSlug doesn't include them)
    const { data: stripeData, error: stripeQueryErr } = await supabase
      .from('Space')
      .select('stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd, trialUsedAt, ownerId')
      .eq('id', space.id)
      .single();

    if (stripeQueryErr) {
      console.error('[checkout] Stripe column query failed:', stripeQueryErr.message, stripeQueryErr.code);
      return NextResponse.json({ error: "Couldn't check subscription status — usually temporary." }, { status: 500 });
    }

    let stripe;
    try {
      stripe = getStripe();
    } catch (err: any) {
      console.error('[checkout] Stripe init failed:', err.message);
      return NextResponse.json({ error: 'Stripe not configured. Contact support.' }, { status: 500 });
    }

    // Block a verified current subscription. A stale row is checked against
    // Stripe so a canceled customer can renew without risking a duplicate sub.
    const currentStatus = stripeData?.stripeSubscriptionStatus;
    const subscriptionIsCurrent = await hasVerifiedCurrentSubscription(
      stripe,
      stripeData?.stripeSubscriptionId,
      currentStatus,
      stripeData?.stripePeriodEnd,
    );
    if (subscriptionIsCurrent === null) {
      return NextResponse.json(
        { error: "Couldn't verify your existing subscription — usually temporary." },
        { status: 503 },
      );
    }
    if (subscriptionIsCurrent) {
      return NextResponse.json({ error: 'You already have an active subscription.' }, { status: 400 });
    }

    // If they have a failed/past_due subscription, direct them to billing portal instead
    if (stripeData?.stripeSubscriptionId && (currentStatus === 'past_due' || currentStatus === 'unpaid')) {
      return NextResponse.json({
        error: 'You have an existing subscription with a payment issue. Please update your payment method in billing settings.',
        redirect: `/s/${slug}/billing`,
      }, { status: 400 });
    }

    // Resolve the Stripe price from the selected tier via lib/plans.ts (single
    // source of truth). Annual uses the plan's stripePriceAnnual directly — the
    // legacy STRIPE_PRICE_ID fallback is a MONTHLY Solo price and must never be
    // charged as "annual" (isAnnualAvailable already verified the annual id is
    // set). Monthly keeps pickSpacePriceId's Solo legacy fallback.
    const priceId =
      cadence === 'annual'
        ? PLANS[spacePlan].stripePriceAnnual
        : pickSpacePriceId(spacePlan, {
            soloMonthly: PLANS.solo.stripePriceMonthly,
            proMonthly: PLANS.pro.stripePriceMonthly,
            legacy: process.env.STRIPE_PRICE_ID ?? null,
          });
    if (!priceId) {
      console.error('[checkout] No Stripe price configured for plan:', spacePlan, 'cadence:', cadence);
      return NextResponse.json({ error: 'Billing not configured. Contact support.' }, { status: 503 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.usechippi.com';

    // Reuse existing Stripe customer or create one
    let customerId = stripeData?.stripeCustomerId;
    if (!customerId) {
      const { data: user } = await supabase
        .from('User')
        .select('email, name')
        .eq('id', space.ownerId)
        .single();

      console.log('[checkout] Creating Stripe customer for space:', space.id);
      // Idempotency key bound to the space — two concurrent checkout
      // requests for the same space hit Stripe with the same key and
      // Stripe returns the SAME customer object on both calls instead
      // of creating two. The DB CAS below is the second layer of
      // protection; the idempotency key prevents the orphan from
      // existing in Stripe at all. Without it, racing creates left
      // unreferenced customers sitting in Stripe's customer list
      // forever (cosmetic bloat, audit confusion).
      const customer = await stripe.customers.create(
        {
          email: user?.email,
          name: user?.name || undefined,
          metadata: { spaceId: space.id, slug: space.slug },
        },
        { idempotencyKey: `customer-create:space:${space.id}` },
      );
      customerId = customer.id;

      // Conditional write: only persist if another request hasn't already set a customer ID.
      // If this update affects 0 rows (stripeCustomerId was already set by a concurrent request),
      // fetch the winner's customer ID and use that instead — abandoning the duplicate we just created.
      const { data: updateResult } = await supabase
        .from('Space')
        .update({ stripeCustomerId: customerId })
        .eq('id', space.id)
        .is('stripeCustomerId', null)
        .select('stripeCustomerId')
        .single();

      if (!updateResult) {
        // Another concurrent request already set a customer ID — fetch and use theirs
        const { data: winner } = await supabase
          .from('Space')
          .select('stripeCustomerId')
          .eq('id', space.id)
          .single();
        if (winner?.stripeCustomerId) {
          customerId = winner.stripeCustomerId;
        }
      }
    }

    // spacePlan (resolved above from the buyer's selection) is stamped on the
    // subscription metadata so the webhook grants the right monthly credits and
    // labels Space.plan to match exactly what was charged.

    // Only grant a 7-day trial if the user has never used one before
    const hasUsedTrial = !!stripeData?.trialUsedAt;
    const subscriptionData: Record<string, unknown> = {
      metadata: { spaceId: space.id, plan: spacePlan, cadence },
    };
    if (!hasUsedTrial) {
      subscriptionData.trial_period_days = 7;
    }

    console.log('[checkout] Creating checkout session, customer:', customerId, 'price:', priceId, 'trial:', !hasUsedTrial);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      success_url: `${appUrl}/s/${slug}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/subscribe?slug=${slug}`,
      metadata: { spaceId: space.id, plan: spacePlan },
    });

    console.log('[checkout] Session created:', session.id, 'url:', session.url?.slice(0, 50));
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[checkout] FAILED:', err.message, err.stack?.slice(0, 200));
    return NextResponse.json({ error: "Checkout didn't go through — usually temporary." }, { status: 500 });
  }
}

/**
 * Brokerage-scoped checkout: creates/uses a Stripe customer + subscription
 * attached to the Brokerage row (NOT the broker_owner's personal Space).
 */
async function handleBrokerageCheckout(
  _req: NextRequest,
  body: { plan?: string; scope?: string; cadence?: string },
): Promise<NextResponse> {
  // Auth: must be a broker (owner or admin), then enforce broker_owner only
  const ctx = await getBrokerContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (ctx.membership.role !== 'broker_owner') {
    return NextResponse.json(
      { error: 'Only the brokerage owner can manage billing.' },
      { status: 403 },
    );
  }

  // Rate limit per authenticated DB user
  const { allowed } = await checkRateLimit(`billing:brokerage:${ctx.dbUserId}`, 5, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  // Validate plan input
  const plan = body?.plan as BrokeragePlan | undefined;
  if (plan !== 'team' && plan !== 'team_plus') {
    return NextResponse.json(
      { error: 'plan must be one of: team, team_plus' },
      { status: 400 },
    );
  }

  // Billing cadence (monthly default). When 'annual', the plan's annual base
  // AND annual per-seat add-on price must both be configured (isAnnualAvailable
  // checks both) — refuse rather than silently bill monthly / under-bill seats.
  const cadence = resolveCadence(body?.cadence);
  if (cadence === 'annual' && !isAnnualAvailable(plan)) {
    return NextResponse.json({ error: 'annual-not-available' }, { status: 409 });
  }

  // Base price from lib/plans (single source of truth), keyed to the cadence.
  const priceId =
    cadence === 'annual' ? PLANS[plan].stripePriceAnnual : PLANS[plan].stripePriceMonthly;
  if (!priceId) {
    console.error('[checkout:brokerage] Plan not configured:', plan, 'cadence:', cadence);
    return NextResponse.json({ error: 'Plan not configured' }, { status: 503 });
  }

  // Load live Stripe columns for the Brokerage row (may not be on ctx.brokerage type yet)
  const { data: brokerageStripe, error: brokerageQueryErr } = await supabase
    .from('Brokerage')
    .select('id, name, ownerId, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd')
    .eq('id', ctx.brokerage.id)
    .single();

  if (brokerageQueryErr || !brokerageStripe) {
    console.error(
      '[checkout:brokerage] Brokerage query failed:',
      brokerageQueryErr?.message,
      brokerageQueryErr?.code,
    );
    return NextResponse.json(
      { error: "Couldn't load brokerage — usually temporary." },
      { status: 500 },
    );
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (err: any) {
    console.error('[checkout:brokerage] Stripe init failed:', err.message);
    return NextResponse.json({ error: 'Stripe not configured. Contact support.' }, { status: 500 });
  }

  // Block a verified current subscription. Live Stripe verification lets an
  // actually canceled brokerage renew even when its webhook-backed row is stale.
  const currentStatus = brokerageStripe.stripeSubscriptionStatus;
  const subscriptionIsCurrent = await hasVerifiedCurrentSubscription(
    stripe,
    brokerageStripe.stripeSubscriptionId,
    currentStatus,
    brokerageStripe.stripePeriodEnd,
  );
  if (subscriptionIsCurrent === null) {
    return NextResponse.json(
      { error: "Couldn't verify your brokerage subscription — usually temporary." },
      { status: 503 },
    );
  }
  if (subscriptionIsCurrent) {
    return NextResponse.json(
      { error: 'Your brokerage already has an active subscription.' },
      { status: 400 },
    );
  }
  if (
    brokerageStripe.stripeSubscriptionId &&
    (currentStatus === 'past_due' || currentStatus === 'unpaid')
  ) {
    return NextResponse.json(
      {
        error:
          'Your brokerage has an existing subscription with a payment issue. Please update your payment method in billing settings.',
        redirect: `/broker/billing`,
      },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.usechippi.com';

  // Reuse existing Stripe customer or create one (concurrency-safe)
  let customerId = brokerageStripe.stripeCustomerId ?? null;
  if (!customerId) {
    const { data: owner } = await supabase
      .from('User')
      .select('email, name')
      .eq('id', brokerageStripe.ownerId)
      .single();

    console.log('[checkout:brokerage] Creating Stripe customer for brokerage:', ctx.brokerage.id);
    // Idempotency key bound to the brokerage — see the space-flow note
    // above. Concurrent create calls return the same Stripe customer
    // instead of leaving orphans in Stripe's customer list.
    const customer = await stripe.customers.create(
      {
        email: owner?.email,
        name: owner?.name || brokerageStripe.name || undefined,
        metadata: { brokerageId: ctx.brokerage.id },
      },
      { idempotencyKey: `customer-create:brokerage:${ctx.brokerage.id}` },
    );
    customerId = customer.id;

    // Conditional write: only persist if not already set by a concurrent request.
    const { data: updateResult } = await supabase
      .from('Brokerage')
      .update({ stripeCustomerId: customerId })
      .eq('id', ctx.brokerage.id)
      .is('stripeCustomerId', null)
      .select('stripeCustomerId')
      .single();

    if (!updateResult) {
      const { data: winner } = await supabase
        .from('Brokerage')
        .select('stripeCustomerId')
        .eq('id', ctx.brokerage.id)
        .single();
      if (winner?.stripeCustomerId) {
        customerId = winner.stripeCustomerId;
      }
    }
  }

  // Seed the per-seat add-on at checkout (Fix #1). The base price is a FLAT
  // bundle billed quantity 1; seats beyond the plan's includedUsers bill on a
  // SEPARATE per-unit add-on price as a second line item. We count current
  // active members so a brokerage that already has agents over the included
  // count is charged correctly on its FIRST invoice (not just after the next
  // membership change). If the per-unit add-on price isn't configured yet (the
  // flagged Stripe price-config dependency), we omit the line and the webhook's
  // seat-sync logs the deferral — the seat count is still capped by
  // checkSeatCapacity, only the incremental charge waits on the price object.
  const line_items: Array<{ price: string; quantity: number }> = [
    { price: priceId, quantity: 1 },
  ];
  const { count: memberCount } = await supabase
    .from('BrokerageMembership')
    .select('*', { count: 'exact', head: true })
    .eq('brokerageId', ctx.brokerage.id);
  const addonSeats = addonSeatsForPlan(plan, memberCount ?? 0);
  // Add-on cadence MUST match the base cadence so the per-seat line bills on the
  // same yearly/monthly schedule as the bundle (mirrors lib/billing/
  // brokerage-seat-billing.ts → addonPriceIdForPlan). For annual we already
  // verified this id is set via isAnnualAvailable.
  const addonPriceId =
    (cadence === 'annual'
      ? PLANS[plan].addUser?.stripePriceAnnual
      : PLANS[plan].addUser?.stripePriceMonthly) ?? null;
  if (addonSeats > 0) {
    if (addonPriceId) {
      line_items.push({ price: addonPriceId, quantity: addonSeats });
    } else {
      console.warn(
        '[checkout:brokerage] per-seat add-on price not configured — seats past the included count will NOT be billed at checkout. Set STRIPE_PRICE_TEAM_ADDON / STRIPE_PRICE_TEAM_PLUS_ADDON (a per-unit Stripe price).',
        { plan, addonSeats },
      );
    }
  }

  // Trial parity with the Space flow: grant the same 7-day trial, but only the
  // FIRST time this brokerage subscribes. The Brokerage row has no trialUsedAt
  // column (unlike Space), so we use "never had a subscription" as the guard —
  // a brokerage that previously subscribed (stripeSubscriptionId set) has
  // already consumed its trial / paid, so it re-subscribes without a fresh one.
  const brokerageHasSubscribedBefore = !!brokerageStripe.stripeSubscriptionId;
  const subscriptionData: Record<string, unknown> = {
    metadata: { brokerageId: ctx.brokerage.id, plan, cadence },
  };
  if (!brokerageHasSubscribedBefore) {
    subscriptionData.trial_period_days = 7;
  }

  try {
    console.log(
      '[checkout:brokerage] Creating checkout session, customer:',
      customerId,
      'price:',
      priceId,
      'plan:',
      plan,
      'cadence:',
      cadence,
      'addonSeats:',
      addonSeats,
      'trial:',
      !brokerageHasSubscribedBefore,
    );
    const session = await stripe.checkout.sessions.create({
      customer: customerId as string,
      mode: 'subscription',
      line_items,
      subscription_data: subscriptionData,
      success_url: `${appUrl}/broker/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/broker/billing?canceled=1`,
      metadata: { brokerageId: ctx.brokerage.id, plan, cadence },
    });

    console.log(
      '[checkout:brokerage] Session created:',
      session.id,
      'url:',
      session.url?.slice(0, 50),
    );
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error(
      '[checkout:brokerage] session create failed:',
      err?.message,
      err?.stack?.slice(0, 200),
    );
    return NextResponse.json({ error: "Checkout didn't go through — usually temporary." }, { status: 500 });
  }
}
