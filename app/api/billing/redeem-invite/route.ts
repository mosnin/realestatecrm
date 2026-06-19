import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { redeemInviteCode, type RedeemResult } from '@/lib/billing/invite-codes';

/**
 * Redeem an invite code for the CALLER'S OWN space.
 *
 * SECURITY:
 *   - Authenticated (requireAuth). The space is resolved from the session via
 *     getSpaceForUser — the body NEVER carries a spaceId, so a user can only ever
 *     redeem against their own space. The bypass is therefore strictly per-space:
 *     it touches one space's comp columns and nothing else; every other account
 *     goes through normal Stripe billing, untouched.
 *   - The code lookup + ALL validation (active / expiry / maxUses / not-already-
 *     redeemed) happen server-side inside the atomic Postgres function, which
 *     increments usesCount under a row lock so it can never pass maxUses.
 *   - Rejections return a generic message and never reveal which codes exist
 *     beyond what's necessary (e.g. "invalid" covers both not-found and
 *     inactive); only states the user can act on (expired / used up / already
 *     redeemed) are named.
 *
 * On success: grants comp on the space at the code's plan (handled in the DB
 * function), marks the user onboarded so the gate lets them in, and returns the
 * in-app redirect.
 */

// Map the atomic result to a user-facing message. Deliberately coarse for the
// "doesn't exist / turned off" cases so the endpoint isn't a code oracle.
const REJECTION_MESSAGE: Record<Exclude<RedeemResult, 'ok'>, string> = {
  not_found: 'That code isn’t valid.',
  inactive: 'That code isn’t valid.',
  invalid: 'That code isn’t valid.',
  error: 'Something went wrong redeeming that code. Please try again.',
  expired: 'That code has expired.',
  exhausted: 'That code has reached its redemption limit.',
  already_redeemed: 'You’ve already redeemed a code for this workspace.',
};

export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Throttle this value-granting surface — it mints free access.
  const { allowed } = await checkRateLimit(`billing:redeem-invite:${userId}`, 10, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const rawCode = typeof body.code === 'string' ? body.code : '';
  if (!rawCode.trim()) {
    return NextResponse.json({ error: 'Enter an invite code.' }, { status: 400 });
  }

  // Resolve the caller's OWN space — never from client input. No space → nothing
  // to grant comp on; send them to set one up first.
  let space: { id: string; slug: string } | null;
  try {
    const s = await getSpaceForUser(userId);
    space = s ? { id: s.id, slug: s.slug } : null;
  } catch (err) {
    console.error('[redeem-invite] space lookup failed', err);
    return NextResponse.json({ error: 'Couldn’t load your workspace — usually temporary.' }, { status: 500 });
  }
  if (!space) {
    return NextResponse.json({ error: 'Set up your workspace first.', redirect: '/setup' }, { status: 400 });
  }

  // Atomic redeem: validate + increment usesCount under a lock + grant comp.
  const result = await redeemInviteCode({ code: rawCode, spaceId: space.id, userClerkId: userId });

  if (result !== 'ok') {
    return NextResponse.json({ error: REJECTION_MESSAGE[result] }, { status: 400 });
  }

  // Land the redeemer in the app: mark onboarded (best-effort — comp already gates
  // them in regardless, so a write hiccup here must not fail the redemption).
  try {
    await supabase
      .from('User')
      .update({ onboard: true, onboardingCompletedAt: new Date().toISOString() })
      .eq('clerkId', userId)
      .eq('onboard', false);
  } catch (err) {
    console.error('[redeem-invite] onboard flag update failed (non-blocking)', err);
  }

  return NextResponse.json({ ok: true, redirect: `/s/${space.slug}` });
}
