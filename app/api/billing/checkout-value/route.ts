/**
 * GET /api/billing/checkout-value?session_id=cs_...
 *
 * Returns the amount + currency of a completed Stripe Checkout session so the
 * client can fire a value-accurate Meta Pixel `Purchase` event on the billing
 * success page. Browser pixels can't see the charged amount on their own; this
 * is the minimal authenticated lookup that supplies it.
 *
 * Auth: caller must be signed in. Checkout session ids are high-entropy,
 * single-use secrets returned only to the buyer via the success_url, so a
 * logged-in lookup is sufficient — we are not exposing anything the buyer
 * doesn't already hold.
 *
 * Best-effort: any failure returns 200 with value:null so the client can still
 * fire a countable Purchase without a value rather than erroring the page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getStripe } from '@/lib/stripe';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return NextResponse.json({ value: null, currency: null }, { status: 200 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const amount = session.amount_total; // in the currency's minor unit (cents)
    const value = typeof amount === 'number' ? amount / 100 : null;
    const currency = session.currency ? session.currency.toUpperCase() : 'USD';
    const plan = (session.metadata?.plan as string | undefined) ?? null;
    return NextResponse.json({ value, currency, plan }, { status: 200 });
  } catch (err) {
    logger.warn('[checkout-value] lookup failed', { sessionId }, err);
    return NextResponse.json({ value: null, currency: null }, { status: 200 });
  }
}
