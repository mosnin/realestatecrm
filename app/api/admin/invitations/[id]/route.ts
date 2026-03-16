import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/admin/invitations/[id] — revoke (cancel) a pending invitation */
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

  if (!['cancelled', 'expired'].includes(status)) {
    return NextResponse.json({ error: 'status must be cancelled or expired' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('Invitation')
    .update({ status })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  return NextResponse.json({ invitation: data });
}
