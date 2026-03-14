import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/memberships/[id]
 * Remove a brokerage membership and unlink the user's space from the brokerage.
 */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  // Fetch membership first so we can unlink the space
  const { data: membership } = await supabase
    .from('BrokerageMembership')
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

  const { error } = await supabase.from('BrokerageMembership').delete().eq('id', id);
  if (error) {
    console.error('[admin/memberships] delete failed', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Membership removed' });
}
