import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/admin';
import { syncBrokerageSeatBilling } from '@/lib/billing/brokerage-seat-billing';
import { unscoped } from '@/lib/supabase-guard';

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Roles an admin may SET on a membership. broker_owner is excluded — ownership
// is transferred via the brokerage lifecycle, not flipped on a membership row.
const SETTABLE_ROLES = ['broker_admin', 'realtor_member'] as const;

/**
 * PATCH /api/admin/memberships/[id]
 * Change a brokerage member's role (broker_admin ↔ realtor_member). Mirrors the
 * broker-side /api/broker/members/[id]/role guard set: the owner's role cannot
 * be changed here (transfer the brokerage instead).
 */
export async function PATCH(req: Request, { params }: Params) {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:${session.userId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  let role: string;
  try {
    ({ role } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!role || !(SETTABLE_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { error: 'role must be broker_admin or realtor_member' },
      { status: 400 },
    );
  }

  const { data: membership } = await unscoped(
    supabase.from('BrokerageMembership'),
    'admin: platform-admin membership lookup by id',
  )
    .select('id, role, userId, brokerageId')
    .eq('id', id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });

  if (membership.role === 'broker_owner') {
    return NextResponse.json(
      { error: "Cannot change the owner's role. Transfer the brokerage instead." },
      { status: 400 },
    );
  }

  if (membership.role === role) {
    return NextResponse.json({ message: 'Role unchanged', role });
  }

  const { error } = await unscoped(
    supabase.from('BrokerageMembership'),
    'admin: platform-admin membership update by id',
  )
    .update({ role })
    .eq('id', id);
  if (error) {
    console.error('[admin/memberships] role update failed', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  await logAdminAction({
    actor: admin.clerkUserId,
    action: 'update_membership_role',
    target: id,
    details: { brokerageId: membership.brokerageId, from: membership.role, to: role },
  });

  return NextResponse.json({ success: true, role });
}

/**
 * DELETE /api/admin/memberships/[id]
 * Remove a brokerage membership and unlink the user's space from the brokerage.
 */
export async function DELETE(_req: Request, { params }: Params) {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:${session.userId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  // Fetch membership first so we can unlink the space
  const { data: membership } = await unscoped(
    supabase.from('BrokerageMembership'),
    'admin: platform-admin membership lookup by id',
  )
    .select('userId, brokerageId')
    .eq('id', id)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });

  // Unlink space from brokerage (best-effort)
  const { data: space } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', membership.userId)
    .maybeSingle();
  if (space) {
    await supabase.from('Space').update({ brokerageId: null }).eq('id', space.id);
  }

  const { error } = await unscoped(
    supabase.from('BrokerageMembership'),
    'admin: platform-admin membership delete by id',
  ).delete().eq('id', id);
  if (error) {
    console.error('[admin/memberships] delete failed', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  // Release the offboarded seat from billing (Fix #1): admin-removing a member
  // lowers the active member count, so lower the per-unit add-on quantity (same
  // path the broker_owner offboard/remove routes use). Best-effort + after the
  // delete committed — a Stripe hiccup must never fail the admin delete. The
  // sync itself safely no-ops when the brokerage has no active sub or isn't on a
  // per-seat plan. Every BrokerageMembership row is, by definition, a brokerage
  // membership; guard on brokerageId only to skip a malformed/legacy row.
  if (membership.brokerageId) {
    void syncBrokerageSeatBilling(membership.brokerageId);
  }

  await logAdminAction({ actor: admin.clerkUserId, action: 'delete_membership', target: id, details: {} });

  return NextResponse.json({ message: 'Membership removed' });
}
