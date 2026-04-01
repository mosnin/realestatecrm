import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getPriceId } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug } = body;
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const auth = await requireSpaceOwner(slug);
    if (auth instanceof NextResponse) return auth;
    const { userId, space } = auth;

    const { allowed } = await checkRateLimit(`billing:${userId}`, 5, 60);
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    // Fetch Stripe columns separately (getSpaceFromSlug doesn't include them)
    const { data: stripeData, error: stripeQueryErr } = await supabase
      .from('Space')
      .select('stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd, ownerId')
      .eq('id', space.id)
      .single();

    if (stripeQueryErr) {
      console.error('[checkout] Stripe column query failed:', stripeQueryErr.message, stripeQueryErr.code);
      // If columns don't exist, continue without them
    }

    let stripe;
    try {
      stripe = getStripe();
    } catch (err: any) {
      console.error('[checkout] Stripe init failed:', err.message);
      return NextResponse.json({ error: 'Stripe not configured. Contact support.' }, { status: 500 });
    }

    let priceId;
    try {
      priceId = getPriceId();
    } catch (err: any) {
      console.error('[checkout] Price ID missing:', err.message);
      return NextResponse.json({ error: 'Billing not configured. Contact support.' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.usechippi.com';

    // Reuse existing Stripe customer or create one
    let customerId = stripeData?.stripeCustomerId;
    if (!customerId) {
      const { data: user } = await supabase
        .from('User')
        .select('email, name')
        .eq('id', space.ownerId)
        .single();

      console.log('[checkout] Creating Stripe customer for:', user?.email);
      const customer = await stripe.customers.create({
        email: user?.email,
        name: user?.name || undefined,
        metadata: { spaceId: space.id, slug: space.slug },
      });
      customerId = customer.id;

      await supabase
        .from('Space')
        .update({ stripeCustomerId: customerId })
        .eq('id', space.id);
    }

    console.log('[checkout] Creating checkout session, customer:', customerId, 'price:', priceId);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { spaceId: space.id },
      },
      success_url: `${appUrl}/s/${slug}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/s/${slug}/billing`,
      metadata: { spaceId: space.id },
    });

    console.log('[checkout] Session created:', session.id, 'url:', session.url?.slice(0, 50));
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[checkout] FAILED:', err.message, err.stack?.slice(0, 200));
    return NextResponse.json({ error: err.message || 'Checkout failed' }, { status: 500 });
  }
}
