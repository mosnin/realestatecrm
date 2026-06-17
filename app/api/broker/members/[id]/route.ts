import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { syncBrokerageSeatBilling } from '@/lib/billing/brokerage-seat-billing';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/broker/members/[id]
 * Remove a member from the brokerage. Owner or admin can remove members.
 * The owner cannot remove themselves. Admins cannot remove other admins.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { userId: clerkId } = await auth();
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isOwner = ctx.membership.role === 'broker_owner';
  const isAdmin = ctx.membership.role === 'broker_admin';
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Only the owner or admins can remove members' }, { status: 403 });
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

  // Admins can only remove realtors, not other admins
  if (isAdmin && membership.role === 'broker_admin') {
    return NextResponse.json({ error: 'Only the owner can remove admins' }, { status: 403 });
  }

  // Delete the membership — scope to brokerageId as well to prevent a TOCTOU
  // race between the fetch above and this write.
  const { error: deleteErr } = await supabase
    .from('BrokerageMembership')
    .delete()
    .eq('id', membershipId)
    .eq('brokerageId', ctx.brokerage.id);

  if (deleteErr) {
    console.error('[broker/members/delete] delete failed', deleteErr);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }

  // Release the seat from billing (Fix #1): one fewer active member lowers the
  // per-unit add-on quantity (and removes the add-on line once back at the
  // included count), issuing a prorated credit. Best-effort, after the delete.
  void syncBrokerageSeatBilling(ctx.brokerage.id);

  // Record the removal in the deny-list so the removed agent can't silently
  // rejoin via the still-circulating join code. ON CONFLICT DO NOTHING via
  // upsert so re-removal doesn't error if the row already exists (defensive
  // for any race or replay path). Re-hire still works through an explicit
  // /api/invitations/[token] acceptance — that route doesn't consult this
  // table. A broker can rescind by deleting the row.
  //
  // Look up the actor's User.id so removedById is the DB id, not the Clerk
  // id. clerkId may be null in edge cases (auth() succeeded for ctx but the
  // separate auth() call above returned null) — log + skip the attribution
  // field rather than failing the removal.
  let actorDbId: string | null = null;
  if (clerkId) {
    const { data: actorUser } = await supabase
      .from('User')
      .select('id')
      .eq('clerkId', clerkId)
      .maybeSingle();
    actorDbId = (actorUser as { id?: string } | null)?.id ?? null;
  }
  const { error: removalErr } = await supabase
    .from('BrokerageRemoval')
    .upsert(
      {
        brokerageId: ctx.brokerage.id,
        userId: membership.userId,
        removedById: actorDbId,
      },
      { onConflict: 'brokerageId,userId' },
    );
  if (removalErr) {
    // Non-fatal: the membership is already deleted, so the visible
    // outcome the broker requested is done. Log so we can chase it.
    console.error('[broker/members/delete] removal deny-list insert failed', removalErr);
  }

  // Unlink their Space from this brokerage. This is part of revoking access:
  // a silently-failed unlink can leave the removed member's workspace pointing
  // at this brokerage (intake form-config, brokerage-scoped reads). Await it,
  // retry once on transient failure, and surface a persistent failure loudly
  // so ops can chase it — don't fire-and-forget.
  let unlinkErr: { message?: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase
      .from('Space')
      .update({ brokerageId: null })
      .eq('ownerId', membership.userId)
      .eq('brokerageId', ctx.brokerage.id);
    if (!error) {
      unlinkErr = null;
      break;
    }
    unlinkErr = error;
  }
  if (unlinkErr) {
    // The membership row (the source of truth for access) is already deleted,
    // so the member is out — but the Space link survived. Surface it: this is
    // an access-revocation gap, not a cosmetic miss.
    logger.error(
      '[broker/members/delete] Space unlink failed after removal — workspace may still reference brokerage',
      { brokerageId: ctx.brokerage.id, removedUserId: membership.userId, err: unlinkErr.message },
    );
  }

  void audit({ actorClerkId: clerkId ?? null, action: 'DELETE', resource: 'BrokerageMembership', resourceId: membershipId, metadata: { brokerageId: ctx.brokerage.id, removedUserId: membership.userId, role: membership.role, spaceUnlinked: !unlinkErr } });

  return NextResponse.json({ success: true });
}
