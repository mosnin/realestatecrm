/**
 * Application-owner / platform-admin entitlements.
 *
 * Platform admins (User.platformRole = 'admin') are the Chippi application
 * owners. They get the top plan and skip credit + subscription gates so they
 * can test every feature. This is FEATURE access only — it does not grant
 * cross-tenant data access. Every CRM query still scopes by the caller's
 * spaceId / brokerageId.
 *
 * Two checks, used in different places:
 *   - Session: isPlatformAdmin() — the person currently signed in. Gates
 *     (meter, layout, requireActiveSubscription) skip when the actor is admin.
 *   - Space owner: isSpaceOwnerUnlimited() — the User row that owns the space.
 *     resolveBillingAccount uses this so the owner's own workspace reports
 *     the top plan even from background jobs that have no Clerk session.
 *
 * Both fail CLOSED (false) on lookup errors so a blip never grants unlimited
 * access to a paying customer.
 */

import { supabase } from '@/lib/supabase';
import { isPlatformAdmin } from '@/lib/permissions';
import type { PlanId } from '@/lib/plans';

/** Effective plan an admin-owned Space reports. Virtual — never written. */
export const OWNER_ADMIN_SPACE_PLAN: PlanId = 'pro';
/** Effective plan an admin-owned pooled brokerage would report. Virtual. */
export const OWNER_ADMIN_BROKERAGE_PLAN: PlanId = 'team_plus';

/**
 * True when the current session is a platform admin. Thin alias so billing
 * call sites read as "unlimited feature access" rather than "admin console".
 */
export async function hasUnlimitedFeatureAccess(): Promise<boolean> {
  return isPlatformAdmin();
}

/**
 * True when this internal User id (Space.ownerId) is a live platform admin.
 * Offboarded admins lose the bypass. Fail-closed on any lookup error.
 */
export async function isSpaceOwnerUnlimited(
  ownerUserId: string | null | undefined,
): Promise<boolean> {
  if (!ownerUserId) return false;
  try {
    const { data, error } = await supabase
      .from('User')
      .select('platformRole, status')
      .eq('id', ownerUserId)
      .maybeSingle();
    if (error || !data) return false;
    const row = data as { platformRole?: string; status?: string };
    if (row.status === 'offboarded') return false;
    return row.platformRole === 'admin';
  } catch {
    return false;
  }
}
