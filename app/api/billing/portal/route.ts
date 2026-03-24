import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { requireSpaceOwner } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug } = body;
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  if (!space.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account found. Please subscribe first.' }, { status: 400 });
  }

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.usechippi.com';

  const session = await stripe.billingPortal.sessions.create({
    customer: space.stripeCustomerId,
    return_url: `${appUrl}/s/${slug}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
