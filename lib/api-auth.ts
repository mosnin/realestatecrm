/**
 * API authentication helpers — replace repeated auth boilerplate in every route.
 *
 * Usage:
 *   const result = await requireSpaceOwner(slug);
 *   if (result instanceof NextResponse) return result;
 *   const { userId, space } = result;
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { unscoped } from '@/lib/supabase-guard';
import { isUserPlatformAdmin } from '@/lib/permissions';
import type { Space } from '@/lib/types';

/**
 * Returns { userId } or a 401/403 NextResponse.
 *
 * Brokerage offboarding status gate: after Clerk auth succeeds we look up the
 * User row and reject with 403 if `status === 'offboarded'`. Offboarding is a
 * hard-stop initiated by a broker_owner/broker_admin when an agent leaves the
 * brokerage; their book of business has been reassigned and they must lose API
 * access immediately, even though their Clerk session may still be valid. This
 * is the single choke-point for API auth, so enforcing it here blocks every
 * protected route uniformly. Resilience: if the User row is missing (user is
 * mid-onboarding) or the `status` column isn't present yet (the migration
 * adding it lands separately), we fall through as if active — this keeps the
 * check safe to deploy ahead of the migration.
 */
export async function requireAuth(): Promise<{ userId: string } | NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Offboarding hard-stop — see JSDoc above. Wrapped in try/catch so that a
  // missing `status` column (pre-migration) or transient DB issue does not
  // brick auth; we only block on a definitive 'offboarded' signal.
  try {
    const { data: userRow } = await supabase
      .from('User')
      .select('id, status')
      .eq('clerkId', userId)
      .maybeSingle();

    if (userRow && (userRow as { status?: string }).status === 'offboarded') {
      return NextResponse.json(
        { error: 'Your access has been revoked by your brokerage.', code: 'offboarded' },
        { status: 403 },
      );
    }
  } catch {
    // Swallow: treat as active. The migration adding `status` may not have
    // run yet, and we never want this lookup to break authenticated traffic.
  }

  return { userId };
}

/**
 * Checks that a space has an active or trialing subscription.
 * Admins bypass the check. Returns null if OK, or a 403 NextResponse.
 */
export async function requireActiveSubscription(
  space: Space,
  userId?: string,
): Promise<NextResponse | null> {
  const status = space.stripeSubscriptionStatus ?? 'inactive';
  if (hasCurrentSubscription(status, space.stripePeriodEnd)) return null;

  // Application owner / platform admin: unlimited plan access. Feature
  // bypass only — this does not open another tenant's workspace.
  if (userId && (await isUserPlatformAdmin(userId))) return null;

  return NextResponse.json(
    { error: 'Active subscription required' },
    { status: 403 },
  );
}

/**
 * Subscription states that pause premium AI under dunning (a lapsed PAID plan).
 * Deliberately EXCLUDES 'inactive' (free / never-subscribed) and
 * 'trialing'/'active', so free and trial users are never gated — only an
 * account whose paid subscription failed payment or was canceled.
 */
export function isSubscriptionDelinquent(status: string | null | undefined): boolean {
  return status === 'past_due' || status === 'canceled' || status === 'unpaid';
}

const ACTIVE_PERIOD_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Treat active/trialing as entitled only while the persisted Stripe period is
 * current. A one-day grace for active subscriptions absorbs normal webhook
 * delivery delay at renewal; trials have an exact end and receive no grace.
 * Missing or malformed period data fails closed for a paid entitlement.
 */
export function hasCurrentSubscription(
  status: string | null | undefined,
  periodEnd: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== 'active' && status !== 'trialing') return false;
  if (!periodEnd) return false;
  const endMs = periodEnd instanceof Date ? periodEnd.getTime() : Date.parse(periodEnd);
  if (!Number.isFinite(endMs)) return false;
  const graceMs = status === 'active' ? ACTIVE_PERIOD_GRACE_MS : 0;
  return endMs + graceMs > now.getTime();
}

/** Free/inactive accounts may use their included credits; only lapsed paid
 * states and stale active/trial periods pause premium AI. */
export function isPremiumAccessBlocked(
  status: string | null | undefined,
  periodEnd: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (isSubscriptionDelinquent(status)) return true;
  if (status === 'active' || status === 'trialing') {
    return !hasCurrentSubscription(status, periodEnd, now);
  }
  return false;
}

/**
 * Workspace CRM access (Today, contacts, deals). The product has a Free
 * plan with a one-time 100-credit grant — never-subscribed spaces must
 * reach the CRM. AI spend is still gated by assertCanSpend.
 *
 * A lapsed *paid* relationship (Stripe subscription id or a used trial,
 * but no current period) is sent to billing-required. Comp / admin
 * bypasses live at the call site, not here.
 */
export function canAccessWorkspace(args: {
  status: string | null | undefined;
  periodEnd: string | Date | null | undefined;
  hasSubscriptionHistory: boolean;
  now?: Date;
}): boolean {
  if (hasCurrentSubscription(args.status, args.periodEnd, args.now)) return true;
  return !args.hasSubscriptionHistory;
}

/**
 * Verifies the caller can operate this workspace: they own THIS space
 * (a person may own more than one business), they hold a seat on it, or
 * they are a broker_owner/broker_admin of a brokerage that manages it.
 * Billing and delete stay on {@link requireSpaceAccountOwner}.
 * Returns { userId, space } or a 4xx NextResponse.
 */
export async function requireSpaceOwner(
  slug: string,
): Promise<{ userId: string; space: Space } | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Run both space lookups in parallel instead of sequentially
  const [space, userSpace] = await Promise.all([
    getSpaceFromSlug(slug),
    getSpaceForUser(userId),
  ]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Direct owner of THIS space (a person can own more than one business).
  if (userSpace && space.id === userSpace.id) {
    return { userId, space };
  }

  // Broker owner/admin check — allow managing brokerage members' spaces
  const { data: dbUser } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .maybeSingle();

  if (dbUser) {
    const { data: ownsThis } = await supabase
      .from('Space')
      .select('id')
      .eq('id', space.id)
      .eq('ownerId', dbUser.id)
      .maybeSingle();
    if (ownsThis) return { userId, space };

    const { data: seat } = await tenantTable(supabase, 'SpaceMembership', { spaceId: space.id })
      .select('id')
      .eq('userId', dbUser.id)
      .maybeSingle();
    if (seat) return { userId, space };

    // Check if the space belongs to a brokerage the user is admin/owner of.
    // Fetch ALL broker-level memberships rather than .maybeSingle() — a user
    // who owns/admins more than one brokerage would otherwise make
    // .maybeSingle() throw (PostgREST errors on >1 row), 500ing a legitimate
    // multi-brokerage admin. Mirror the context helpers in lib/permissions.ts:
    // fetch all, then deterministically prefer broker_owner over broker_admin.
    const { data: memberships } = await unscoped(
      supabase.from('BrokerageMembership'),
      'membership lookup by userId then verify space owner against those brokerageIds',
    )
      .select('role, brokerageId, createdAt')
      .eq('userId', dbUser.id)
      .in('role', ['broker_owner', 'broker_admin'])
      .order('createdAt', { ascending: true });

    // The caller may broker-own/admin MORE THAN ONE brokerage. Grant access
    // when the space's owner belongs to ANY of them. The previous code collapsed
    // the memberships to a single one (broker_owner-first) and checked only that
    // brokerage, so e.g. a broker_owner of A who is also broker_admin of B was
    // wrongly 403'd when opening a space owned by a B member.
    const brokerBrokerageIds = (memberships ?? []).map((m) => m.brokerageId);

    if (brokerBrokerageIds.length > 0) {
      const { data: spaceOwnerMembership } = await supabase
        .from('BrokerageMembership')
        .select('id')
        .in('brokerageId', brokerBrokerageIds)
        .eq('userId', space.ownerId)
        .limit(1)
        .maybeSingle();

      if (spaceOwnerMembership) {
        return { userId, space };
      }
    }
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * The person who owns the business — not an invited teammate — pays for it
 * and can cancel it. Invited seats can work in the book; they cannot open
 * Stripe checkout or the customer portal.
 */
export async function requireSpaceAccountOwner(
  slug: string,
): Promise<{ userId: string; space: Space } | NextResponse> {
  const result = await requireSpaceOwner(slug);
  if (result instanceof NextResponse) return result;

  const { data: dbUser } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', result.userId)
    .maybeSingle();
  if (!dbUser || dbUser.id !== result.space.ownerId) {
    return NextResponse.json(
      { error: 'Only the workspace owner can manage billing for this business.' },
      { status: 403 },
    );
  }
  return result;
}

/**
 * Same as requireSpaceOwner but also enforces active subscription.
 */
export async function requirePaidSpaceOwner(
  slug: string,
): Promise<{ userId: string; space: Space } | NextResponse> {
  const result = await requireSpaceOwner(slug);
  if (result instanceof NextResponse) return result;
  const { userId, space } = result;

  const subCheck = await requireActiveSubscription(space, userId);
  if (subCheck) return subCheck;

  return { userId, space };
}

/**
 * Verifies the caller can operate the space that a contact belongs to
 * (owner of that book, or an invited seat). Looks up the contact first,
 * then checks access — never the caller's first-owned space. A miss and
 * a foreign contact both 404 so this is not an existence oracle.
 */
export async function requireContactAccess(
  contactId: string,
): Promise<{ userId: string; space: Space } | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { data: dbUser } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .maybeSingle();
  if (!dbUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: contact, error } = await unscoped(
    supabase.from('Contact'),
    'resolve contact space then verify the caller owns or holds a seat on it',
  )
    .select('spaceId')
    .eq('id', contactId)
    .maybeSingle();
  if (error) throw error;
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: owned } = await supabase
    .from('Space')
    .select('*')
    .eq('id', contact.spaceId)
    .eq('ownerId', dbUser.id)
    .maybeSingle();
  if (owned) return { userId, space: owned as Space };

  const { data: seat } = await tenantTable(supabase, 'SpaceMembership', {
    spaceId: contact.spaceId,
  })
    .select('id')
    .eq('userId', dbUser.id)
    .maybeSingle();
  if (!seat) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: memberSpace } = await supabase
    .from('Space')
    .select('*')
    .eq('id', contact.spaceId)
    .maybeSingle();
  if (!memberSpace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return { userId, space: memberSpace as Space };
}
