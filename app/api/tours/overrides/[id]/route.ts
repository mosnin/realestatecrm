import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { tenantTable } from '@/lib/tenant-db';


export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: row } = await tenantTable(supabase, 'TourAvailabilityOverride', { spaceId: space.id })
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await tenantTable(supabase, 'TourAvailabilityOverride', { spaceId: space.id })
    .delete()
    .eq('id', id);
  if (error) throw error;

  return NextResponse.json({ success: true });
}
