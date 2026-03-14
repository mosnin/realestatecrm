import { NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/broker/members/[id]
 * Remove a member from the brokerage. Only broker_owner can remove members.
 * The owner cannot remove themselves.
 */
export async function DELETE(_req: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (ctx.membership.role !== 'broker_owner') {
    return NextResponse.json({ error: 'Only the brokerage owner can remove members' }, { status: 403 });
  }

  const { id: membershipId } = await params;

  // Fetch the membership to validate it belongs to this brokerage
  const { data: membership } = await supabase
    .from('BrokerageMembership')
    .select('id, userId, role')
    .eq('id', membershipId)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  if (membership.role === 'broker_owner') {
    return NextResponse.json({ error: 'Cannot remove the brokerage owner' }, { status: 400 });
  }

  // Delete the membership
  const { error: deleteErr } = await supabase
    .from('BrokerageMembership')
    .delete()
    .eq('id', membershipId);

  if (deleteErr) {
    console.error('[broker/members/delete] delete failed', deleteErr);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }

  // Best-effort: unlink their Space from this brokerage
  await supabase
    .from('Space')
    .update({ brokerageId: null })
    .eq('ownerId', membership.userId)
    .eq('brokerageId', ctx.brokerage.id);

  return NextResponse.json({ success: true });
}
