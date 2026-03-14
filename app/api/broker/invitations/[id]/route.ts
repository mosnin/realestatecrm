import { NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/broker/invitations/[id]
 * Cancel a pending invitation. Available to broker_owner and broker_manager.
 */
export async function PATCH(_req: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: invitationId } = await params;

  const { data: inv } = await supabase
    .from('Invitation')
    .select('id, status')
    .eq('id', invitationId)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle();

  if (!inv) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  if (inv.status !== 'pending') {
    return NextResponse.json({ error: `Cannot cancel an invitation with status: ${inv.status}` }, { status: 409 });
  }

  const { error } = await supabase
    .from('Invitation')
    .update({ status: 'cancelled' })
    .eq('id', invitationId);

  if (error) {
    console.error('[broker/invitations/cancel] update failed', error);
    return NextResponse.json({ error: 'Failed to cancel invitation' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
