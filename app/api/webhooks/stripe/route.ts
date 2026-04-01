import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';

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
    const FROM = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';

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
    };

    const msg = statusMessages[newStatus];
    if (!msg) return;

    const domain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'my.usechippi.com';

    await resend.emails.send({
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
  } catch (err) {
    console.error('[stripe-webhook] subscription email failed:', err);
  }
}

// Disable body parsing — Stripe needs the raw body for signature verification
export const runtime = 'nodejs';

/** Get current_period_end from the first subscription item. */
function getPeriodEnd(sub: Stripe.Subscription): string {
  const ts = sub.items.data[0]?.current_period_end ?? sub.start_date;
  return new Date(ts * 1000).toISOString();
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] Missing STRIPE_WEBHOOK_SECRET');
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
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const spaceId = session.metadata?.spaceId;
        if (!spaceId || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );

        await supabase
          .from('Space')
          .update({
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            stripeSubscriptionStatus: mapStatus(subscription.status),
            stripePeriodEnd: getPeriodEnd(subscription),
          })
          .eq('id', spaceId);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const spaceId = subscription.metadata?.spaceId;
        const newStatus = mapStatus(subscription.status);

        const updateData = {
          stripeSubscriptionStatus: newStatus,
          stripePeriodEnd: getPeriodEnd(subscription),
        };

        if (spaceId) {
          await supabase.from('Space').update(updateData).eq('id', spaceId);
        } else {
          await supabase
            .from('Space')
            .update(updateData)
            .eq('stripeSubscriptionId', subscription.id);
        }
        // Notify owner of status change
        try { await notifySubscriptionChange(subscription.id, newStatus); } catch (e) { console.error('[stripe-webhook] subscription notification failed:', e); }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await supabase
          .from('Space')
          .update({
            stripeSubscriptionStatus: 'canceled',
            stripePeriodEnd: getPeriodEnd(subscription),
          })
          .eq('stripeSubscriptionId', subscription.id);
        try { await notifySubscriptionChange(subscription.id, 'canceled'); } catch (e) { console.error('[stripe-webhook] canceled notification failed:', e); }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          typeof invoice.parent?.subscription_details?.subscription === 'string'
            ? invoice.parent.subscription_details.subscription
            : invoice.parent?.subscription_details?.subscription?.id;
        if (subId) {
          await supabase
            .from('Space')
            .update({ stripeSubscriptionStatus: 'past_due' })
            .eq('stripeSubscriptionId', subId);
          try { await notifySubscriptionChange(subId, 'past_due'); } catch (e) { console.error('[stripe-webhook] past_due notification failed:', e); }
        }
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error processing ${event.type}:`, err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

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
      return 'unpaid';
    default:
      return 'inactive';
  }
}
