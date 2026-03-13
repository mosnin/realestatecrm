import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncDeal, deleteDealVector } from '@/lib/vectorize';
import { getSpaceForUser } from '@/lib/space';
import type { Deal, DealStage } from '@/lib/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existingRows, error: existingError } = await supabase
    .from('Deal')
    .select('*')
    .eq('id', id);
  if (existingError) throw existingError;
  if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = existingRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const valueVal = body.value != null ? parseFloat(body.value) : null;
  const closeDateVal = body.closeDate ? new Date(body.closeDate).toISOString() : null;

  // Handle dealContacts replacement
  if (body.contactIds) {
    const { error: delError } = await supabase.from('DealContact').delete().eq('dealId', id);
    if (delError) throw delError;
    if (body.contactIds.length > 0) {
      const dcInserts = body.contactIds.map((cId: string) => ({ dealId: id, contactId: cId }));
      const { error: insertError } = await supabase.from('DealContact').insert(dcInserts);
      if (insertError) throw insertError;
    }
  }

  const { data: dealRow, error: updateError } = await supabase
    .from('Deal')
    .update({
      title: body.title,
      description: body.description ?? null,
      value: valueVal,
      address: body.address ?? null,
      priority: body.priority,
      closeDate: closeDateVal,
      stageId: body.stageId,
      position: body.position,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (updateError) throw updateError;

  // Get stage for the include
  const { data: stageRow, error: stageError } = await supabase
    .from('DealStage')
    .select('*')
    .eq('id', body.stageId)
    .single();
  if (stageError && stageError.code !== 'PGRST116') throw stageError;

  const deal = {
    ...dealRow,
    stage: stageRow || null
  } as Deal & { stage: DealStage | null };

  syncDeal(deal).catch(console.error);

  return NextResponse.json(deal);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: dealRows, error: dealError } = await supabase
    .from('Deal')
    .select('*')
    .eq('id', id);
  if (dealError) throw dealError;
  if (!dealRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deal = dealRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || deal.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error: deleteError } = await supabase.from('Deal').delete().eq('id', id);
  if (deleteError) throw deleteError;
  deleteDealVector(deal.spaceId, id).catch(console.error);

  return NextResponse.json({ success: true });
}
