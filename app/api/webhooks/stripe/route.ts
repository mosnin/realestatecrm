import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { grantTopup, grantPlanMonthly } from '@/lib/billing/grants';
import { syncBrokerageSeatBillingForSubscription } from '@/lib/billing/brokerage-seat-billing';
import { PLANS, TOPUPS, type TopupId, type PlanId, planIdForStripePrice, planFromPriceId, addonSeatsForPlan } from '@/lib/plans';
import { withObservability } from '@/lib/with-observability';

/** Send a subscription status email to the space owner (non-blocking). */
async function notifySubscriptionChange(subscriptionId: string, newStatus: string) {
  try {
    const { data: space } = await supabase
      .from('Space')
      .select('id, name, slug, ownerId')
      .eq('stripeSubscriptionId', subscriptionId)
      .maybeSingle();
    if (!space) return;

    const { data: owner } = await supabase
      .from('User')
      .select('email, name')
      .eq('id', space.ownerId)
      .maybeSingle();
    if (!owner?.email) return;

    if (!process.env.RESEND_API_KEY) return;
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const rawFrom = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';
    const FROM = rawFrom.includes('@') ? rawFrom : `notifications@${rawFrom}`;

    const statusMessages: Record<string, { subject: string; body: string }> = {
      active: {
        subject: `Your Chippi subscription is now active`,
        body: `Great news! Your subscription for <strong>${space.name}</strong> is active. You have full access to all features.`,
      },
      past_due: {
        subject: `Payment issue with your Chippi subscription`,
        body: `We had trouble processing your payment for <strong>${space.name}</strong>. Please update your payment method to keep your access.`,
      },
      canceled: {
        subject: `Your Chippi subscription has been canceled`,
        body: `Your subscription for <strong>${space.name}</strong> has been canceled. You can resubscribe anytime from your billing page.`,
      },
      trial_ending: {
        subject: `Your Chippi trial ends in 3 days`,
        body: `Your free trial for <strong>${space.name}</strong> ends in 3 days. Add a payment method to keep your access without interruption.`,
      },
    };

    const msg = statusMessages[newStatus];
    if (!msg) return;

    const domain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'www.usechippi.com';

    const result = await resend.emails.send({
      from: `Chippi <${FROM}>`,
      to: owner.email,
      subject: msg.subject,
      html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px 0">
  <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px">Hi ${owner.name || 'there'},</p>
  <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 20px">${msg.body}</p>
  <a href="https://${domain}/s/${space.slug}/billing" style="display:inline-block;background:#ff964f;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:10px 24px;border-radius:8px">View billing</a>
  <p style="font-size:12px;color:#9ca3af;margin-top:20px">— The Chippi team</p>
</div>`,
    });
    if (result.error) {
      logger.error('[stripe-webhook] Resend API error', { resendError: result.error });
    }
  } catch (err) {
    logger.error('[stripe-webhook] subscription email failed', undefined, err);
  }
}

// Disable body parsing — Stripe needs the raw body for signature verification
export const runtime = 'nodejs';

/** Get current_period_end from the first subscription item. Falls back through
 *  the other "when does access end" timestamps before start_date — on a
 *  canceled/past_due sub the item's current_period_end can be absent, and
 *  falling straight to start_date would write a period-end in the PAST, which
 *  strands any "access until period end" grace logic. */
function getPeriodEnd(sub: Stripe.Subscription): string {
  const subAny = sub as unknown as {
    current_period_end?: number; cancel_at?: number; ended_at?: number;
  };
  const ts =
    sub.items.data[0]?.current_period_end ??
    subAny.current_period_end ??
    subAny.cancel_at ??
    subAny.ended_at ??
    sub.start_date;
  return new Date(ts * 1000).toISOString();
}

/** Stripe's `customer` field can be a string id, an expanded object, or null.
 *  Normalize to the id string so ownership comparisons don't silently break:
 *  comparing a stored string id against an expanded object is always unequal
 *  (legit update rejected → account stranded) — or, inverted, always equal
 *  (guard bypassed). */
function customerIdOf(
  customer: string | { id: string } | null | undefined,
): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

/**
 * Map a brokerage plan → seat limit, from the single source of truth in
 * lib/plans.ts (team = 5, team_plus = 10). Unknown plans → null (no cap set).
 */
function seatLimitForPlan(plan: string | undefined | null): number | null {
  if (plan === 'team' || plan === 'team_plus') return PLANS[plan].includedUsers;
  return null;
}

/**
 * Derive the ACTIVE plan (+ cadence) from a subscription's LIVE price by scanning
 * every line item through planFromPriceId and returning the FIRST base match.
 *
 * Scanning all items (not just items.data[0]) is what lets the per-seat add-on be
 * ignored: planFromPriceId returns null for the add-on price, so on a brokerage
 * sub the base bundle line resolves the plan regardless of item ORDER (Stripe can
 * return the add-on first). Returns null when NO item maps to a configured base
 * price — the env-not-wired / legacy-sub case — so callers fall back to metadata.
 *
 * This is the source of truth for the price-derived reconcile in the
 * subscription.created|updated handlers; cadence is returned for completeness but
 * NOT persisted today (Space/Brokerage have no cadence column — Stripe stays the
 * source of truth for the billing interval).
 */
function planFromSubscriptionItems(
  sub: Stripe.Subscription,
): { plan: PlanId; cadence: 'monthly' | 'annual' } | null {
  for (const item of sub.items?.data ?? []) {
    const match = planFromPriceId(item.price?.id);
    if (match) return match;
  }
  return null;
}

/**
 * Resolve the plan to grant/label for a paid invoice, from the live price first
 * (source of truth) then the checkout-time metadata.plan. Returns null when
 * NEITHER resolves a known tier.
 *
 * Fix #5: the old code defaulted a null resolution to 'solo', so a Pro/Team
 * customer whose price id wasn't in PLANS (env not wired in this environment, a
 * new price object, a typo) was granted Solo's smaller allotment AND relabeled
 * Solo — silently underpaying a paying customer. Defaulting to a tier on
 * ambiguity is never safe: returning null lets the caller log CRITICAL and skip
 * the grant for manual review instead of guessing wrong.
 */
function resolveGrantPlan(sub: Stripe.Subscription): PlanId | null {
  // Scan ALL items so the per-seat add-on line (which maps to null) is skipped
  // and the base bundle line resolves the tier regardless of item order — then
  // fall back to the checkout-time metadata.plan, then null (never guess a tier).
  const livePlan = planFromSubscriptionItems(sub)?.plan ?? null;
  if (livePlan) return livePlan;
  const metaPlan = sub.metadata?.plan;
  if (metaPlan && metaPlan in PLANS) return metaPlan as PlanId;
  return null;
}

/**
 * Converge a brokerage subscription's per-seat add-on line to its active member
 * count (Fix #1). Best-effort: any failure is logged and swallowed so a Stripe
 * seat write never 500s the webhook (→ infinite retry) or blocks the credit
 * grant. The converge step is itself idempotent (same member count → no write).
 */
async function syncBrokerageSeatBillingFromWebhook(
  stripe: Stripe,
  brokerageId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  try {
    const plan = resolveGrantPlan(subscription);
    if (plan !== 'team' && plan !== 'team_plus') return; // no per-seat add-on
    const { count } = await supabase
      .from('BrokerageMembership')
      .select('*', { count: 'exact', head: true })
      .eq('brokerageId', brokerageId);
    await syncBrokerageSeatBillingForSubscription(stripe, subscription, plan, count ?? 0);
  } catch (e) {
    logger.error('[stripe-webhook] brokerage seat-billing sync failed (non-fatal)', { brokerageId, subscriptionId: subscription.id }, e);
  }
}

/**
 * Extract the subscription id from an invoice across multiple Stripe API shapes.
 */
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const invoiceAny = invoice as any;
  if (typeof invoiceAny.subscription === 'string') {
    return invoiceAny.subscription;
  }
  if (typeof invoiceAny.subscription === 'object' && invoiceAny.subscription?.id) {
    return invoiceAny.subscription.id;
  }
  const detail = invoice.parent?.subscription_details?.subscription;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') return (detail as any).id;
  return undefined;
}

/**
 * Apply a subscription state update to the matching Brokerage row.
 * Caller must have already determined that subscription.metadata.brokerageId is set.
 * Returns true if a brokerage was updated (and thus Space path should be skipped),
 * false if the brokerage row no longer exists (idempotency: orphaned subscription).
 */
/**
 * Guard against metadata poisoning. A subscription's `metadata.brokerageId`
 * is untrusted — whoever created the sub could point it at any brokerage.
 * Before we write to a Brokerage row based on a webhook, confirm the
 * subscription's Stripe customer matches the brokerage's stored customer
 * (or that the brokerage has no customer yet, which is the legitimate
 * first-subscribe case).
 *
 * Returns one of:
 *   'ok'       — safe to write (either customers match, or brokerage has none)
 *   'missing'  — brokerage row doesn't exist (orphaned subscription)
 *   'mismatch' — customer IDs don't match; treat as handled but DO NOT write
 *
 * Every handler that writes to Brokerage based on subscription.metadata
 * MUST call this first. Duplicating the logic inline is how the
 * customer.subscription.deleted and invoice.payment_failed paths shipped
 * without the check; centralising it closes that door.
 */
async function verifyBrokerageOwnsSubscription(
  brokerageId: string,
  subscription: Stripe.Subscription,
  customerOverride?: string | null,
): Promise<{ status: 'ok' | 'missing' | 'mismatch'; existing: { id: string; stripeCustomerId: string | null } | null }> {
  const { data: existing } = await supabase
    .from('Brokerage')
    .select('id, stripeCustomerId')
    .eq('id', brokerageId)
    .maybeSingle();

  if (!existing) {
    logger.warn('[stripe-webhook] subscription references missing brokerage — ignoring', {
      brokerageId,
      subscriptionId: subscription.id,
    });
    return { status: 'missing', existing: null };
  }

  const webhookCustomer =
    customerOverride ??
    (typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null);

  if (
    existing.stripeCustomerId &&
    webhookCustomer &&
    existing.stripeCustomerId !== webhookCustomer
  ) {
    logger.error(
      '[stripe-webhook] brokerageId metadata mismatch — brokerage belongs to different customer',
      {
        brokerageId,
        brokerageCustomer: existing.stripeCustomerId,
        webhookCustomer,
        subscriptionId: subscription.id,
      },
    );
    return { status: 'mismatch', existing: { id: existing.id, stripeCustomerId: existing.stripeCustomerId } };
  }

  return {
    status: 'ok',
    existing: { id: existing.id, stripeCustomerId: existing.stripeCustomerId ?? null },
  };
}

async function updateBrokerageFromSubscription(
  brokerageId: string,
  subscription: Stripe.Subscription,
  opts: { customerId?: string | null; includePlanFromMetadata?: boolean } = {},
): Promise<boolean> {
  const guard = await verifyBrokerageOwnsSubscription(
    brokerageId,
    subscription,
    opts.customerId,
  );
  if (guard.status === 'missing') return false;
  if (guard.status === 'mismatch') return true; // treat as handled — do NOT fall through to Space
  // Guard returned 'ok'; existing is populated.
  const existing = guard.existing!;

  const webhookCustomer =
    opts.customerId ??
    (typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null);

  const updateData: Record<string, unknown> = {
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: mapStatus(subscription.status),
    stripePeriodEnd: getPeriodEnd(subscription),
  };

  if (webhookCustomer && !existing.stripeCustomerId) {
    updateData.stripeCustomerId = webhookCustomer;
  }

  // Reconcile plan + seatLimit from the subscription's ACTUAL price first, then
  // fall back to the checkout-time metadata.plan. Deriving from the live price is
  // what lets a Stripe-Portal / dashboard-initiated plan change (Team↔Team Plus)
  // land in the app — the metadata.plan is stamped once and goes stale on such a
  // change. The per-seat add-on line is ignored automatically (planFromPriceId
  // returns null for it). We only act on brokerage tiers (team/team_plus) so a
  // (mis)mapped Space price can never relabel a Brokerage.
  //
  // BACKWARD-COMPAT: price-derivation takes precedence ONLY when it returns a
  // confident brokerage match. When NO item maps (prices unconfigured in this
  // env, or a legacy sub) we fall through to the EXACT prior metadata-based
  // behavior (gated on includePlanFromMetadata) — no regression.
  const priceDerived = planFromSubscriptionItems(subscription);
  if (priceDerived && (priceDerived.plan === 'team' || priceDerived.plan === 'team_plus')) {
    updateData.plan = priceDerived.plan;
    updateData.seatLimit = seatLimitForPlan(priceDerived.plan);
  } else if (opts.includePlanFromMetadata) {
    const plan = subscription.metadata?.plan;
    if (plan === 'team' || plan === 'team_plus') {
      updateData.plan = plan;
      updateData.seatLimit = seatLimitForPlan(plan);
    }
  }

  const { error } = await supabase
    .from('Brokerage')
    .update(updateData)
    .eq('id', brokerageId);

  if (error) {
    logger.error('[stripe-webhook] failed to update Brokerage', {
      brokerageId,
      subscriptionId: subscription.id,
      dbError: error.message,
    });
  }

  return true;
}

async function POSTHandler(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('[stripe-webhook] Missing STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Read raw body for signature verification
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    logger.error('[stripe-webhook] signature verification failed', undefined, err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check — skip events we've already fully processed. The Redis
  // key is a fast-path optimization, NOT the correctness boundary: it's set
  // only AFTER the handler succeeds (see end of function). Correctness rests on
  // DB-level grant idempotency (CreditLot.sourceId unique index), so a Redis
  // miss can at worst re-run a handler — it can never double-grant.
  const eventKey = `stripe:event:${event.id}`;
  try {
    const alreadyProcessed = await redis.get(eventKey);
    if (alreadyProcessed) {
      return NextResponse.json({ received: true });
    }
  } catch {
    // Redis unavailable — proceed; DB-level idempotency is the real backstop.
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Top-up purchase (one-time payment, no subscription) — grant credits.
        // Idempotent via the event-ID dedupe above, so a retried delivery won't
        // double-grant. Metadata is set by app/api/billing/credits/checkout.
        const topupId = session.metadata?.topup as TopupId | undefined;
        if (topupId && topupId in TOPUPS) {
          const acctType = session.metadata?.accountType;
          const acctId = session.metadata?.accountId;
          if (acctId && (acctType === 'space' || acctType === 'brokerage')) {
            // Anti-poisoning (mirrors the subscription paths): if the target
            // account already has a Stripe customer, it must match the payer.
            // A brand-new account with no customer yet is allowed — the metadata
            // was server-set from a verified owned space at checkout.
            const acctTable = acctType === 'space' ? 'Space' : 'Brokerage';
            const { data: acct } = await supabase
              .from(acctTable)
              .select('stripeCustomerId')
              .eq('id', acctId)
              .maybeSingle();
            if (acct?.stripeCustomerId && acct.stripeCustomerId !== (session.customer as string)) {
              logger.error('[stripe-webhook] top-up account/customer mismatch — rejecting metadata poisoning', {
                acctType, acctId, sessionCustomer: session.customer,
              });
              break;
            }
            // Fix #7: the customer has ALREADY paid (this fires on a succeeded
            // one-time payment). If the grant throws and we let it bubble to the
            // outer catch → 500 → Stripe retries forever, all while the customer
            // is charged-but-not-credited. Isolate it: log CRITICAL for manual
            // crediting/alerting and still ack 200 so Stripe stops retrying.
            // Idempotent via sourceId = session.id, so a retry that DID reach
            // here wouldn't double-grant anyway.
            try {
              await grantTopup({ type: acctType, id: acctId }, topupId, session.id);
              logger.info('[stripe-webhook] top-up credits granted', { topupId, acctType, acctId });
            } catch (e) {
              logger.error('[stripe-webhook] CRITICAL: top-up paid but grant FAILED (charged-but-not-credited) — manual credit required', {
                topupId, acctType, acctId, sessionId: session.id,
              }, e);
            }
          } else {
            logger.warn('[stripe-webhook] top-up missing account metadata', { topupId });
          }
          break;
        }

        if (!session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );

        // Brokerage path: metadata.brokerageId may live on the session or the subscription
        const brokerageId =
          session.metadata?.brokerageId ?? subscription.metadata?.brokerageId;
        if (brokerageId) {
          await updateBrokerageFromSubscription(brokerageId, subscription, {
            customerId: session.customer as string,
            includePlanFromMetadata: true,
          });
          // Converge the per-seat add-on to the active member count (Fix #1).
          // Checkout already seeds it, but re-syncing here is idempotent and
          // catches members added between session create and completion.
          await syncBrokerageSeatBillingFromWebhook(stripe, brokerageId, subscription);
          break;
        }

        // ── Existing Space path ──────────────────────────────────────────
        const spaceId = session.metadata?.spaceId;
        if (!spaceId) break;

        // Derive the plan from the LIVE subscription price (source of truth),
        // falling back to the checkout-time metadata.plan. Without this the
        // Space stayed on 'free' until the first invoice.payment_succeeded —
        // a customer who completed checkout (and is being charged / trialing)
        // saw a free tier and the wrong feature gating until the next webhook.
        const checkoutPlan =
          planIdForStripePrice(subscription.items.data[0]?.price?.id) ??
          subscription.metadata?.plan ??
          null;

        const updateData: Record<string, unknown> = {
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscription.id,
          stripeSubscriptionStatus: mapStatus(subscription.status),
          stripePeriodEnd: getPeriodEnd(subscription),
        };
        if (checkoutPlan) {
          updateData.plan = checkoutPlan;
          updateData.planActivatedAt = new Date().toISOString();
        }

        // Track trial usage — only set once, never reset
        if (subscription.status === 'trialing') {
          const { data: existing } = await supabase
            .from('Space')
            .select('trialUsedAt')
            .eq('id', spaceId)
            .maybeSingle();
          if (!existing?.trialUsedAt) {
            updateData.trialUsedAt = new Date().toISOString();
          }
        }

        // Validate spaceId ownership before updating
        const { data: targetSpace } = await supabase
          .from('Space')
          .select('stripeCustomerId')
          .eq('id', spaceId)
          .maybeSingle();

        if (targetSpace && targetSpace.stripeCustomerId && targetSpace.stripeCustomerId !== customerIdOf(session.customer)) {
          logger.error('[stripe-webhook] checkout spaceId mismatch — rejecting metadata poisoning attempt', {
            spaceId,
            existingCustomer: targetSpace.stripeCustomerId,
            sessionCustomer: session.customer,
          });
          break;
        }

        await supabase
          .from('Space')
          .update(updateData)
          .eq('id', spaceId);
        break;
      }

      // A subscription created outside checkout.session.completed (Stripe
      // Dashboard, API, or trial→paid create) only ever fired `created`, which
      // had no handler — so status/period/customer never got written until the
      // first later event. Share the `updated` handler so creation lands too.
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const newStatus = mapStatus(subscription.status);

        // Brokerage path
        const brokerageId = subscription.metadata?.brokerageId;
        if (brokerageId) {
          await updateBrokerageFromSubscription(brokerageId, subscription, {
            includePlanFromMetadata: true,
          });
          break;
        }

        // ── Existing Space path ──────────────────────────────────────────
        const spaceId = subscription.metadata?.spaceId;
        const updateData: Record<string, unknown> = {
          stripeSubscriptionStatus: newStatus,
          stripePeriodEnd: getPeriodEnd(subscription),
        };

        // Reconcile the plan label from the subscription's ACTUAL price so a
        // Stripe-Portal / dashboard-initiated plan OR cadence change (Solo↔Pro,
        // monthly↔annual) lands here too — not just on the next invoice. Only a
        // confident SPACE-tier match (solo/pro) is applied; a brokerage price on
        // a Space sub (shouldn't happen) is ignored rather than written to a
        // free|solo|pro CHECK column. BACKWARD-COMPAT: when NO item maps (prices
        // unconfigured in this env, or a legacy sub) we leave the plan untouched
        // — exactly as before this handler set the plan — so the stored plan /
        // the later invoice.payment_succeeded path stays authoritative.
        const spacePriceDerived = planFromSubscriptionItems(subscription);
        if (spacePriceDerived && (spacePriceDerived.plan === 'solo' || spacePriceDerived.plan === 'pro')) {
          updateData.plan = spacePriceDerived.plan;
          updateData.planActivatedAt = new Date().toISOString();
        }

        if (spaceId) {
          // Validate spaceId ownership: only update if the space's existing customer matches
          // or if the space has no customer yet (first-time setup)
          const { data: existingSpace } = await supabase
            .from('Space')
            .select('stripeCustomerId')
            .eq('id', spaceId)
            .maybeSingle();

          if (existingSpace && existingSpace.stripeCustomerId && existingSpace.stripeCustomerId !== customerIdOf(subscription.customer)) {
            logger.error('[stripe-webhook] spaceId metadata mismatch — space belongs to different customer', {
              spaceId,
              spaceCustomer: existingSpace.stripeCustomerId,
              webhookCustomer: customerIdOf(subscription.customer),
            });
            break; // Reject update — potential metadata poisoning attack
          }

          await supabase.from('Space').update(updateData).eq('id', spaceId);
        } else {
          // No spaceId metadata (legacy subs): match by subscription id, but
          // also bind to the subscription's customer so a poisoned/duplicated
          // stripeSubscriptionId can't overwrite a different customer's Space.
          const subCustomer = customerIdOf(subscription.customer);
          let q = supabase
            .from('Space')
            .update(updateData)
            .eq('stripeSubscriptionId', subscription.id);
          if (subCustomer) q = q.eq('stripeCustomerId', subCustomer);
          await q;
        }
        // Notify owner of status change
        try { await notifySubscriptionChange(subscription.id, newStatus); } catch (e) { logger.error('[stripe-webhook] subscription notification failed', undefined, e); }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        // Brokerage path: mark canceled and DOWNGRADE the tier so a canceled
        // brokerage stops being a paid (team/team_plus) account — otherwise it
        // kept pooling credits + getting grants forever. We move it to
        // 'starter' (the lowest brokerage tier; 'free' is space-only and would
        // violate the Brokerage_plan_check constraint). resolveBillingAccount
        // only pools at the brokerage for team/team_plus, so 'starter' makes
        // member spaces fall back to their own balance. Subscription id +
        // seatLimit are preserved so the owner has audit context and can
        // resubscribe without losing config. The ownership guard is critical —
        // without it, an attacker who can set metadata.brokerageId on their OWN
        // subscription could cancel a victim brokerage by deleting their sub.
        const brokerageId = subscription.metadata?.brokerageId;
        if (brokerageId) {
          const guard = await verifyBrokerageOwnsSubscription(brokerageId, subscription);
          if (guard.status !== 'ok') break; // missing or customer mismatch — swallow
          const { error } = await supabase
            .from('Brokerage')
            .update({
              plan: 'starter',
              stripeSubscriptionStatus: 'canceled',
              stripePeriodEnd: getPeriodEnd(subscription),
            })
            .eq('id', brokerageId);
          if (error) {
            logger.error('[stripe-webhook] failed to mark brokerage canceled', {
              brokerageId,
              subscriptionId: subscription.id,
              dbError: error.message,
            });
          }
          break;
        }

        // ── Existing Space path ──────────────────────────────────────────
        // Downgrade to 'free' on hard cancellation so the customer stops being
        // a paid tier (correct feature gating + the delinquency guard below
        // refuses metered spend on the now-canceled subscription).
        await supabase
          .from('Space')
          .update({
            plan: 'free',
            stripeSubscriptionStatus: 'canceled',
            stripePeriodEnd: getPeriodEnd(subscription),
          })
          .eq('stripeSubscriptionId', subscription.id);
        try { await notifySubscriptionChange(subscription.id, 'canceled'); } catch (e) { logger.error('[stripe-webhook] canceled notification failed', undefined, e); }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const paidSubId = extractInvoiceSubscriptionId(invoice);
        if (!paidSubId) break;

        // Fetch live subscription to read authoritative status + metadata
        const paidSub = await stripe.subscriptions.retrieve(paidSubId);
        const paidStatus = mapStatus(paidSub.status);

        // The ACTIVE plan is derived per-path below via resolveGrantPlan: live
        // subscription price first (source of truth — a portal plan change
        // updates the price, but the checkout-time metadata.plan goes stale),
        // then metadata.plan, then SKIP (never default to a tier — Fix #5).
        // Grant monthly credits on the invoices that represent a real new month
        // of entitlement:
        //   subscription_create     — first invoice of a brand-new sub
        //   subscription_cycle      — a renewal (each billing period)
        //   subscription_trial_end  — trial→paid conversion (Fix #6: without
        //                             this, converts were CHARGED but got no
        //                             credits for their first paid month)
        //   subscription_update     — a plan change (Fix #6: grant the NEW
        //                             tier's credits on an upgrade/downgrade)
        // Every grant is keyed by sourceId = invoice.id against the DB's unique
        // (reason, sourceId) index, so a retried/duplicate webhook re-runs the
        // grant as a no-op — a plan change can't double-grant on redelivery.
        // (Manual one-off invoices use other billing_reasons and are excluded.)
        const GRANTABLE_BILLING_REASONS = new Set([
          'subscription_create',
          'subscription_cycle',
          'subscription_trial_end',
          'subscription_update',
        ]);
        const grantableInvoice =
          !!invoice.billing_reason && GRANTABLE_BILLING_REASONS.has(invoice.billing_reason);

        // Brokerage path
        const brokerageId = paidSub.metadata?.brokerageId;
        if (brokerageId) {
          await updateBrokerageFromSubscription(brokerageId, paidSub, {
            includePlanFromMetadata: true,
          });
          // Keep the per-seat add-on quantity converged to the active member
          // count each renewal (Fix #1) — best-effort, before the grant.
          await syncBrokerageSeatBillingFromWebhook(stripe, brokerageId, paidSub);
          // Monthly credit grant (best-effort — must never break payment
          // processing). Idempotent-per-invoice via the event-ID dedupe above.
          if (grantableInvoice) {
            const brokeragePlan = resolveGrantPlan(paidSub);
            if (!brokeragePlan) {
              // Fix #5: never guess a tier on an unmapped price — log CRITICAL
              // (charged-but-not-credited) and skip so a human can reconcile,
              // rather than granting the wrong (smaller) tier silently.
              logger.error('[stripe-webhook] CRITICAL: brokerage invoice has unmapped price + no metadata.plan — grant SKIPPED, manual review required', {
                brokerageId,
                paidSubId,
                priceId: paidSub.items.data[0]?.price?.id,
                invoiceId: invoice.id,
              });
            } else {
              try {
                // Fix #2: grant base + PER-SEAT credits. Count active members
                // and pass the seats over the plan's includedUsers as addonUsers
                // so the pool reflects what the per-seat billing (Fix #1)
                // charges. A count error → 0 add-on (grant at least the base —
                // never under-grant to zero AND never over-grant on a flaky
                // read). sourceId stays the invoice id, so idempotency is
                // unchanged.
                const { count: brokerageMembers } = await supabase
                  .from('BrokerageMembership')
                  .select('*', { count: 'exact', head: true })
                  .eq('brokerageId', brokerageId);
                const addonUsers = addonSeatsForPlan(brokeragePlan, brokerageMembers ?? 0);
                await grantPlanMonthly({ type: 'brokerage', id: brokerageId }, brokeragePlan, addonUsers, invoice.id);
              } catch (e) {
                // Charged-but-not-credited: log CRITICAL for manual credit but
                // never let it 500 the webhook (→ infinite Stripe retry). The
                // grant is idempotent (sourceId = invoice id) so a manual replay
                // is safe.
                logger.error('[stripe-webhook] CRITICAL: brokerage monthly grant FAILED (paid, credits NOT granted) — manual credit required', { brokerageId, paidSubId, invoiceId: invoice.id }, e);
              }
            }
          }
          break;
        }

        // ── Existing Space path ───────────────────────────────────────────
        // Verify the subscription's customer owns the target Space before
        // crediting it active — mirrors the customer.subscription.updated guard
        // so a poisoned stripeSubscriptionId can't activate another's space.
        let { data: paidSpace } = await supabase
          .from('Space')
          .select('id, plan, stripeCustomerId')
          .eq('stripeSubscriptionId', paidSubId)
          .maybeSingle();

        // First-invoice race: the very first invoice.payment_succeeded can beat
        // checkout.session.completed, so stripeSubscriptionId isn't written yet
        // and the lookup above misses → the customer is CHARGED but granted 0
        // credits. Fall back to the spaceId stamped on the subscription metadata
        // (mirrors the brokerage path, which already keys off metadata). The
        // customer-ownership guard below still applies, so this can't be abused
        // to credit a space the payer doesn't own.
        if (!paidSpace) {
          const metaSpaceId = paidSub.metadata?.spaceId;
          if (metaSpaceId) {
            const { data: bySpaceId } = await supabase
              .from('Space')
              .select('id, plan, stripeCustomerId')
              .eq('id', metaSpaceId)
              .maybeSingle();
            paidSpace = bySpaceId;
          }
        }
        if (paidSpace && paidSpace.stripeCustomerId && paidSpace.stripeCustomerId !== customerIdOf(paidSub.customer)) {
          logger.error('[stripe-webhook] invoice.payment_succeeded customer mismatch — subscription belongs to a different customer', {
            paidSubId,
            spaceCustomer: paidSpace.stripeCustomerId,
            webhookCustomer: paidSub.customer,
          });
          break;
        }
        // Update by the Space id we resolved (not just by stripeSubscriptionId)
        // so the fallback path also backfills stripeSubscriptionId + customer,
        // closing the race for every subsequent event.
        if (paidSpace?.id) {
          await supabase
            .from('Space')
            .update({
              stripeCustomerId: customerIdOf(paidSub.customer) ?? undefined,
              stripeSubscriptionId: paidSubId,
              stripeSubscriptionStatus: paidStatus,
              stripePeriodEnd: getPeriodEnd(paidSub),
            })
            .eq('id', paidSpace.id);
        }

        // Monthly credit grant (best-effort — never break payment processing).
        // Plan comes from the live price first, then metadata.plan. Fix #5:
        // if NEITHER resolves a known tier we do NOT default to 'solo' (which
        // silently under-granted Pro/Team customers) — we log CRITICAL and skip
        // the grant + the relabel so a human reconciles instead of guessing.
        try {
          if (paidSpace?.id) {
            const planId = resolveGrantPlan(paidSub);
            if (!planId) {
              logger.error('[stripe-webhook] CRITICAL: space invoice has unmapped price + no metadata.plan — grant & relabel SKIPPED, manual review required', {
                paidSubId,
                spaceId: paidSpace.id,
                priceId: paidSub.items.data[0]?.price?.id,
                invoiceId: invoice.id,
              });
            } else {
              // Keep the plan label in sync even when this invoice isn't
              // grantable (so a portal plan change is reflected immediately).
              if (planId !== paidSpace.plan) {
                await supabase
                  .from('Space')
                  .update({ plan: planId, planActivatedAt: new Date().toISOString() })
                  .eq('id', paidSpace.id);
              }
              if (grantableInvoice) {
                // Space tiers (solo/pro) have no per-seat add-on → addonUsers 0.
                await grantPlanMonthly({ type: 'space', id: paidSpace.id as string }, planId, 0, invoice.id);
              }
            }
          } else {
            logger.error('[stripe-webhook] CRITICAL: PAID invoice but no matching space — credits NOT granted, manual review required', { paidSubId });
          }
        } catch (e) {
          // Charged-but-not-credited: CRITICAL for manual credit, but swallow so
          // the webhook still returns 200 (a 500 here → infinite Stripe retry).
          // Idempotent via sourceId = invoice id, so a manual replay is safe.
          logger.error('[stripe-webhook] CRITICAL: space monthly grant FAILED (paid, credits NOT granted) — manual credit required', { paidSubId, invoiceId: invoice.id }, e);
        }

        // Notify only on active transition (payment recovered past_due subscription)
        if (paidStatus === 'active') {
          try { await notifySubscriptionChange(paidSubId, 'active'); } catch (e) { logger.error('[stripe-webhook] payment_succeeded notification failed', undefined, e); }
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const trialSub = event.data.object as Stripe.Subscription;
        // Brokerage subscriptions don't email via the Space-owner notifier;
        // skip notification for brokerage-scoped trials (owners see dashboard state).
        if (trialSub.metadata?.brokerageId) break;
        try { await notifySubscriptionChange(trialSub.id, 'trial_ending'); } catch (e) { logger.error('[stripe-webhook] trial_will_end notification failed', undefined, e); }
        break;
      }

      case 'invoice.payment_failed': {
        // Treatment decision (Fix #4): a failed payment is a GRACE state, not a
        // hard cancellation. We flip status to 'past_due' and gate spend (the
        // delinquency guard in lib/billing/meter.assertCanSpend refuses metered
        // work for past_due) but DELIBERATELY do NOT wipe the plan label —
        // Stripe retries the charge over its dunning window and a recovery
        // (invoice.payment_succeeded → 'active') should restore access without a
        // re-provision. The plan is only cleared on customer.subscription.deleted
        // (the terminal cancellation), handled above.
        const invoice = event.data.object as Stripe.Invoice;
        const subId = extractInvoiceSubscriptionId(invoice);
        if (!subId) {
          logger.warn('[stripe-webhook] invoice.payment_failed: could not extract subscription ID', {
            invoiceId: invoice.id,
          });
          break;
        }

        // Fetch live subscription to branch on metadata.brokerageId
        const failedSub = await stripe.subscriptions.retrieve(subId);
        const brokerageId = failedSub.metadata?.brokerageId;
        if (brokerageId) {
          // Same metadata-poisoning guard as subscription.deleted.
          const guard = await verifyBrokerageOwnsSubscription(brokerageId, failedSub);
          if (guard.status !== 'ok') break;
          const { error } = await supabase
            .from('Brokerage')
            .update({ stripeSubscriptionStatus: 'past_due' })
            .eq('id', brokerageId);
          if (error) {
            logger.error('[stripe-webhook] failed to mark brokerage past_due', {
              brokerageId,
              subscriptionId: subId,
              dbError: error.message,
            });
          }
          break;
        }

        // ── Existing Space path ──────────────────────────────────────────
        // Bind to the subscription's customer so a poisoned stripeSubscriptionId
        // can't force a victim Space to past_due (access denial-of-service).
        const failedCustomer = customerIdOf(failedSub.customer);
        let fq = supabase
          .from('Space')
          .update({ stripeSubscriptionStatus: 'past_due' })
          .eq('stripeSubscriptionId', subId);
        if (failedCustomer) fq = fq.eq('stripeCustomerId', failedCustomer);
        await fq;
        try { await notifySubscriptionChange(subId, 'past_due'); } catch (e) { logger.error('[stripe-webhook] past_due notification failed', undefined, e); }
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }
  } catch (err) {
    logger.error('[stripe-webhook] error processing event', { eventType: event.type }, err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  // Mark processed only AFTER the handler succeeded (every switch case breaks,
  // so reaching here = success). If it had thrown, the catch returned 500 and
  // this never runs → Stripe retries → the retry re-runs the handler and
  // completes the work, with DB-level grant idempotency preventing any
  // double-grant. Setting the key before processing would silently drop the
  // event on a mid-handler crash.
  try {
    await redis.set(eventKey, '1', { ex: 259200 }); // 72h — covers Stripe's retry window
  } catch {
    // Redis unavailable — fine; DB-level idempotency already guards correctness.
  }

  return NextResponse.json({ received: true });
}

export const POST = withObservability(POSTHandler, 'api.webhooks.stripe');

/** Map Stripe subscription status to our DB enum. */
function mapStatus(
  status: Stripe.Subscription.Status,
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'inactive' {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'unpaid':
    case 'incomplete_expired' as any:
      return 'unpaid';
    case 'incomplete' as any:
      return 'inactive';
    default:
      return 'inactive';
  }
}
