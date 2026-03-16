import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/brokerages/[id]
 * Removes all memberships, unlinks spaces, then deletes the brokerage.
 */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  // Unlink all member spaces from the brokerage first
  await supabase
    .from('Space')
    .update({ brokerageId: null })
    .eq('brokerageId', id);

  // Delete all memberships
  await supabase.from('BrokerageMembership').delete().eq('brokerageId', id);

  // Delete invitations
  await supabase.from('Invitation').delete().eq('brokerageId', id);

  // Delete the brokerage
  const { error } = await supabase.from('Brokerage').delete().eq('id', id);
  if (error) {
    console.error('[admin/brokerages] delete failed', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Brokerage deleted' });
}

/** PATCH /api/admin/brokerages/[id] — suspend or reactivate a brokerage */
export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  let status: string;
  try {
    ({ status } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!['active', 'suspended'].includes(status)) {
    return NextResponse.json({ error: 'status must be active or suspended' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('Brokerage')
    .update({ status })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Brokerage not found' }, { status: 404 });
  }

  return NextResponse.json({ brokerage: data });
}
