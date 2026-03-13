import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dealId, newStageId, newPosition } = await req.json();

  const { data: dealRows, error: dealError } = await supabase
    .from('Deal')
    .select('*')
    .eq('id', dealId);
  if (dealError) throw dealError;
  if (!dealRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deal = dealRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || deal.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: stageRows, error: stageError } = await supabase
    .from('DealStage')
    .select('*')
    .eq('id', newStageId);
  if (stageError) throw stageError;
  if (!stageRows.length || stageRows[0].spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Shift existing deals in target stage to make room
  const { data: dealsToShift, error: shiftReadError } = await supabase
    .from('Deal')
    .select('id, position')
    .eq('stageId', newStageId)
    .gte('position', newPosition);
  if (shiftReadError) throw shiftReadError;

  if (dealsToShift && dealsToShift.length > 0) {
    await Promise.all(
      dealsToShift.map(d =>
        supabase.from('Deal').update({ position: d.position + 1 }).eq('id', d.id)
      )
    );
  }

  const { data: updatedDeal, error: updateError } = await supabase
    .from('Deal')
    .update({
      stageId: newStageId,
      position: newPosition,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', dealId)
    .select()
    .single();
  if (updateError) throw updateError;

  return NextResponse.json(updatedDeal);
}
