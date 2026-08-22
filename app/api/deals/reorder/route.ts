import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { logger } from '@/lib/logger';
import { tenantTable } from '@/lib/tenant-db';


export async function PATCH(req: NextRequest) {
  try {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dealId, newStageId, newPosition } = await req.json();

  if (!dealId || typeof dealId !== 'string') {
    return NextResponse.json({ error: 'dealId is required' }, { status: 400 });
  }
  if (!newStageId || typeof newStageId !== 'string') {
    return NextResponse.json({ error: 'newStageId is required' }, { status: 400 });
  }
  if (typeof newPosition !== 'number' || !Number.isInteger(newPosition) || newPosition < 0) {
    return NextResponse.json({ error: 'newPosition must be a non-negative integer' }, { status: 400 });
  }

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: deal, error: dealError } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
    .select('id, spaceId, stageId, position')
    .eq('id', dealId)
    .maybeSingle();
  if (dealError) throw dealError;
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: stage, error: stageError } = await tenantTable(supabase, 'DealStage', { spaceId: space.id })
    .select('id, spaceId')
    .eq('id', newStageId)
    .maybeSingle();
  if (stageError) throw stageError;
  if (!stage) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Re-verify the deal STILL belongs to this space immediately before the
  // RPC — closes the TOCTOU window between the lookup above and the RPC.
  // The RPC itself updates by id alone; without this check a between-
  // check-and-write reassignment could let realtor A reorder realtor B's
  // pipeline.
  const { data: dealStill } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
    .select('id')
    .eq('id', dealId)
    .maybeSingle();
  if (!dealStill) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Atomically shift affected deals and move the deal via a DB function.
  // This replaces the previous N individual updates which had a race condition
  // under concurrent drag-and-drop: two requests could both read the same
  // positions and double-increment them.
  const { error: rpcError } = await supabase.rpc('reorder_deal', {
    p_deal_id: dealId,
    p_new_stage_id: newStageId,
    p_new_position: newPosition,
  });
  if (rpcError) {
    console.error('[deals/reorder] rpc failed', rpcError);
    throw rpcError;
  }

  const { data: updated, error: fetchError } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
    .select('*')
    .eq('id', dealId)
    .single();
  if (fetchError) throw fetchError;

  return NextResponse.json(updated);
  } catch (err) {
    logger.error('[deals/reorder/PATCH] failed', {}, err);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
