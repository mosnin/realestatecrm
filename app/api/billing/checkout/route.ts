import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getPriceId } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug } = body;
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  const { allowed } = await checkRateLimit(`billing:${userId}`, 5, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  // Fetch Stripe columns separately (getSpaceFromSlug doesn't include them)
  const { data: stripeData } = await supabase
    .from('Space')
    .select('stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd, ownerId')
    .eq('id', space.id)
    .single();

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.usechippi.com';

  // Reuse existing Stripe customer or create one
  let customerId = stripeData?.stripeCustomerId;
  if (!customerId) {
    // Look up user email for the customer record
    const { data: user } = await supabase
      .from('User')
      .select('email, name')
      .eq('id', space.ownerId)
      .single();

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

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: getPriceId(), quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { spaceId: space.id },
    },
    success_url: `${appUrl}/s/${slug}/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/s/${slug}/billing`,
    metadata: { spaceId: space.id },
  });

  return NextResponse.json({ url: session.url });
}
