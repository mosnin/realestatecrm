import { cache } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizeSlug } from '@/lib/intake';
import type { Space } from '@/lib/types';

/** Columns the subscription gate and Studio entitlement checks read. */
export const SPACE_SELECT_FULL =
  'id, slug, name, emoji, ownerId, brokerageId, createdAt, stripeSubscriptionStatus, stripePeriodEnd';

/**
 * Core identity columns that have existed since the first Space table.
 * Used as a fallback when a newer selected column is missing in a given
 * environment (migration not applied yet, stale PostgREST schema cache).
 * Login must still resolve the workspace in that case — the layout re-reads
 * stripe fields separately and treats missing ones as inactive.
 */
export const SPACE_SELECT_CORE = 'id, slug, name, ownerId, brokerageId, createdAt';

function isRecoverableSchemaError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = (error.message ?? '').toLowerCase();
  return (
    error.code === '42703' || // undefined_column
    error.code === 'PGRST204' || // PostgREST: column not in schema cache
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  );
}

async function selectSpaceRow(
  apply: (columns: string) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>,
): Promise<Space | null> {
  const full = await apply(SPACE_SELECT_FULL);
  if (!full.error) return (full.data as Space) ?? null;
  if (!isRecoverableSchemaError(full.error)) throw full.error;

  const core = await apply(SPACE_SELECT_CORE);
  if (core.error) throw full.error;
  return (core.data as Space) ?? null;
}

/**
 * Resolve a Space by slug. Wrapped in React `cache()` so the layout, the page,
 * and any child that resolves the same slug during ONE server request share a
 * single query instead of each re-running it — a navigation to /s/[slug]/*
 * previously issued this lookup 2–3× serially. `cache()` is request-scoped, so
 * there's no cross-request staleness.
 *
 * After login the layout AND /chippi/brief both call this. A throw here is
 * the exact "We couldn't load your workspace" screen. Schema-drift on an
 * optional column must not take down sign-in.
 */
export async function querySpaceBySlug(inputSlug: string): Promise<Space | null> {
  const slug = normalizeSlug(inputSlug);
  if (!slug) return null;
  return selectSpaceRow(async (columns) => {
    const { data, error } = await supabase
      .from('Space')
      .select(columns)
      .eq('slug', slug)
      .limit(1)
      .maybeSingle();
    return { data, error };
  });
}

export const getSpaceFromSlug = cache(querySpaceBySlug);

export type DashboardUser = {
  id: string;
  name: string | null;
  onboard: boolean;
  isPlatformAdmin: boolean;
  space: { id: string } | null;
};

const USER_SELECT_FULL = 'id, onboard, platformRole, name';
const USER_SELECT_CORE = 'id, onboard, name';

/**
 * Load the signed-in realtor for the workspace layout. Retries without
 * `platformRole` when that column is missing so a partial schema cannot
 * block login. Returns null when no User row exists (caller sends to /setup).
 * Throws only after both selects fail — the layout turns that into the
 * recoverable workspace error screen.
 */
export async function loadDashboardUser(clerkUserId: string): Promise<DashboardUser | null> {
  const full = await supabase
    .from('User')
    .select(USER_SELECT_FULL)
    .eq('clerkId', clerkUserId)
    .maybeSingle();

  let row = full.data as {
    id: string;
    onboard?: boolean;
    platformRole?: string | null;
    name?: string | null;
  } | null;
  if (full.error) {
    if (!isRecoverableSchemaError(full.error)) throw full.error;
    const core = await supabase
      .from('User')
      .select(USER_SELECT_CORE)
      .eq('clerkId', clerkUserId)
      .maybeSingle();
    if (core.error) throw full.error;
    row = core.data as typeof row;
  }
  if (!row) return null;

  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', row.id)
    .maybeSingle();

  return {
    id: row.id,
    name: row.name ?? null,
    onboard: Boolean(row.onboard),
    isPlatformAdmin: row.platformRole === 'admin',
    space: spaceRow ? { id: spaceRow.id as string } : null,
  };
}

export async function getSpaceByOwnerId(ownerId: string): Promise<Space | null> {
  // Space.ownerId is UNIQUE, so a user has at most one (producing) Space — the
  // .limit(1) is belt-and-suspenders, not a "pick one of many". Note that
  // space.brokerageId is the intake-config owner, NOT a membership signal:
  // membership lives in BrokerageMembership. Don't read brokerageId as "which
  // brokerage this user belongs to."
  const { data, error } = await supabase
    .from('Space')
    .select('*')
    .eq('ownerId', ownerId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Space) ?? null;
}

/**
 * True when the Clerk user owns the given Space. Space.ownerId is UNIQUE, so
 * ownership is the precise (spaceId, userId) binding. Used by the internal
 * integration routes to reject a mismatched pair — the AGENT_INTERNAL_SECRET
 * bearer authenticates Modal, not the space, so without this a caller could
 * charge another workspace's rate-limit budget or probe its connected toolkits.
 */
export async function userOwnsSpace(spaceId: string, clerkUserId: string): Promise<boolean> {
  const { data: user } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkUserId)
    .maybeSingle();
  if (!user) return false;
  const { data: space } = await supabase
    .from('Space')
    .select('id')
    .eq('id', spaceId)
    .eq('ownerId', user.id)
    .maybeSingle();
  return !!space;
}

export const getSpaceForUser = cache(async function getSpaceForUser(
  clerkUserId: string,
): Promise<Space | null> {
  // Request-scoped dedup (see getSpaceFromSlug) — the layout + page both call
  // this per navigation.
  //
  // Two queries but they're simple index lookups — keeping sequential to avoid
  // PostgREST FK constraint name ambiguity with inline references.
  //
  // The SELECT mirrors getSpaceFromSlug exactly — stripeSubscriptionStatus and
  // stripePeriodEnd are critical: requireActiveSubscription reads them directly.
  // Previously this query omitted the column, so `space.stripeSubscriptionStatus`
  // came back undefined → coerced to 'inactive' → every paying realtor was
  // blocked from any route that combined getSpaceForUser + requireActiveSubscription
  // (Studio generate/edit are the live callers). Active+trialing realtors saw
  // a 403 on a paid feature unless they happened to also be platform admins.
  // That's fiduciary harm — we were charging customers and locking them out.
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkUserId)
    .limit(1)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!user) return null;

  return selectSpaceRow(async (columns) => {
    const { data, error } = await supabase
      .from('Space')
      .select(columns)
      .eq('ownerId', user.id)
      .limit(1)
      .maybeSingle();
    return { data, error };
  });
});
