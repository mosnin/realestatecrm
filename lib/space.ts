import { supabase } from '@/lib/supabase';
import { normalizeSlug } from '@/lib/intake';
import type { Space } from '@/lib/types';

export async function getSpaceFromSlug(inputSlug: string): Promise<Space | null> {
  const slug = normalizeSlug(inputSlug);
  const { data, error } = await supabase
    .from('Space')
    .select('id, slug, name, emoji, ownerId, brokerageId, createdAt, stripeSubscriptionStatus')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Space) ?? null;
}

export async function getSpaceByOwnerId(ownerId: string): Promise<Space | null> {
  const { data, error } = await supabase
    .from('Space')
    .select('*')
    .eq('ownerId', ownerId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Space) ?? null;
}

export async function getSpaceForUser(clerkUserId: string): Promise<Space | null> {
  // Two queries but they're simple index lookups — keeping sequential to avoid
  // PostgREST FK constraint name ambiguity with inline references.
  //
  // The SELECT mirrors getSpaceFromSlug exactly — stripeSubscriptionStatus
  // is critical: requireActiveSubscription reads it directly from this row.
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

  const { data, error } = await supabase
    .from('Space')
    .select('id, slug, name, emoji, ownerId, brokerageId, createdAt, stripeSubscriptionStatus')
    .eq('ownerId', user.id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Space) ?? null;
}
