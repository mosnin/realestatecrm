import 'server-only';
import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';
import { isAccountComped } from '@/lib/billing/comp';
import { isPremiumAccessBlocked } from '@/lib/api-auth';
import type { WorkforcePrincipal } from '@/integrations/cadre/packages/core/src/node/workforce-auth';

export class WorkforceAccessError extends Error {}
export async function resolveWorkforceScope(kind: string, id: string, clerkId: string) {
  const denied = () => { throw new WorkforceAccessError('Workspace access unavailable'); };
  if (!['personal', 'brokerage'].includes(kind) || !/^[a-zA-Z0-9_-]{1,150}$/.test(id)) return denied();
  const { data: user, error } = await supabase.from('User').select('id, status, platformRole').eq('clerkId', clerkId).maybeSingle();
  if (error || !user || user.status === 'offboarded' || user.platformRole === 'banned') return denied();
  if (kind === 'personal') {
    const { data: space, error } = await supabase.from('Space').select('id, slug, name, ownerId, stripeSubscriptionStatus, stripePeriodEnd').eq('slug', id).eq('ownerId', user.id).maybeSingle();
    if (error || !space || (user.platformRole !== 'admin' && isPremiumAccessBlocked(space.stripeSubscriptionStatus, space.stripePeriodEnd) && !(await isAccountComped('Space', space.id)))) return denied();
    return { principal: { actorId: user.id, kind: 'personal', scopeId: space.id, routeId: space.slug, name: space.name, role: 'owner' } satisfies WorkforcePrincipal, crmHref: `/s/${space.slug}`, routeId: space.slug };
  }
  const { data: membership, error: membershipError } = await unscoped(supabase.from('BrokerageMembership'), 'explicit workforce membership resolved by authenticated user and brokerage').select('role').eq('userId', user.id).eq('brokerageId', id).maybeSingle();
  if (membershipError || !membership || !['broker_owner', 'broker_admin'].includes(membership.role)) return denied();
  const { data: brokerage, error: brokerageError } = await supabase.from('Brokerage').select('id, name, status, stripeSubscriptionStatus, stripePeriodEnd').eq('id', id).maybeSingle();
  if (brokerageError || !brokerage || brokerage.status !== 'active' || (user.platformRole !== 'admin' && isPremiumAccessBlocked(brokerage.stripeSubscriptionStatus, brokerage.stripePeriodEnd) && !(await isAccountComped('Brokerage', id)))) return denied();
  return { principal: { actorId: user.id, kind: 'brokerage', scopeId: id, routeId: id, name: brokerage.name, role: membership.role === 'broker_owner' ? 'owner' : 'admin' } satisfies WorkforcePrincipal, crmHref: `/broker/switch/${encodeURIComponent(id)}`, routeId: id };
}

/** List memberships belonging to the authenticated person; entry rechecks live entitlement. */
export async function listWorkforceScopes(clerkId: string) {
  const { data: user, error } = await supabase.from('User').select('id').eq('clerkId', clerkId).maybeSingle();
  if (error || !user) return [];
  const [personal, brokerage] = await Promise.all([
    supabase.from('Space').select('slug, name').eq('ownerId', user.id),
    unscoped(supabase.from('BrokerageMembership'), 'list the current authenticated user workforce memberships').select('brokerageId, role, Brokerage(name)').eq('userId', user.id).in('role', ['broker_owner', 'broker_admin']),
  ]);
  return [
    ...(personal.error ? [] : personal.data ?? []).map(row => ({ href: `/workforce/personal/${encodeURIComponent(row.slug)}/app`, name: row.name, role: 'Personal workspace' })),
    ...(brokerage.error ? [] : brokerage.data ?? []).map(row => {
      const org = Array.isArray(row.Brokerage) ? row.Brokerage[0] : row.Brokerage;
      return { href: `/workforce/brokerage/${encodeURIComponent(row.brokerageId)}/app`, name: org?.name ?? 'Brokerage', role: row.role === 'broker_owner' ? 'Brokerage owner' : 'Brokerage admin' };
    }),
  ];
}
