import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncDeal, deleteDealVector } from '@/lib/vectorize';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import type { Deal, DealStage } from '@/lib/types';

async function resolveDealAndSpace(userId: string, dealId: string) {
  const { data: rows, error } = await supabase.from('Deal').select('*').eq('id', dealId);
  if (error) throw error;
  if (!rows.length) return null;
  const deal = rows[0];
  const space = await getSpaceForUser(userId);
  if (!space || deal.spaceId !== space.id) return null;
  return { deal, space };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolveDealAndSpace(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { deal } = ctx;

  const [stageResult, dcResult, activityResult] = await Promise.all([
    supabase.from('DealStage').select('*').eq('id', deal.stageId).maybeSingle(),
    supabase.from('DealContact').select('dealId, contactId, Contact(id, name, type)').eq('dealId', id),
    supabase.from('DealActivity').select('*').eq('dealId', id).order('createdAt', { ascending: false }).limit(50),
  ]);

  if (stageResult.error && stageResult.error.code !== 'PGRST116') throw stageResult.error;
  if (dcResult.error) throw dcResult.error;

  const dealContacts = (dcResult.data ?? []).map((row: any) => ({
    dealId: row.dealId,
    contactId: row.contactId,
    contact: row.Contact ? { id: row.Contact.id, name: row.Contact.name, type: row.Contact.type } : null,
  }));

  return NextResponse.json({
    ...deal,
    stage: stageResult.data ?? null,
    dealContacts,
    activities: activityResult.data ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

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

  const valueVal = body.value != null && body.value !== '' ? parseFloat(body.value) : null;
  if (valueVal !== null && isNaN(valueVal)) {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
  }

  let closeDateVal: string | null = null;
  if (body.closeDate) {
    const d = new Date(body.closeDate);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid closeDate' }, { status: 400 });
    closeDateVal = d.toISOString();
  }

  let followUpAtVal: string | null | undefined = undefined;
  if (body.followUpAt !== undefined) {
    if (!body.followUpAt) {
      followUpAtVal = null;
    } else {
      const d = new Date(body.followUpAt);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid followUpAt' }, { status: 400 });
      followUpAtVal = d.toISOString();
    }
  }

  const stageChanged = body.stageId && body.stageId !== existing.stageId;
  const statusChanged = body.status && body.status !== existing.status;

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
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description ?? null }),
      ...(body.value !== undefined && { value: valueVal }),
      ...(body.address !== undefined && { address: body.address ?? null }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.closeDate !== undefined && { closeDate: closeDateVal }),
      ...(body.stageId !== undefined && { stageId: body.stageId }),
      ...(body.position !== undefined && { position: body.position }),
      ...(body.status !== undefined && { status: body.status }),
      ...(followUpAtVal !== undefined && { followUpAt: followUpAtVal }),
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (updateError) throw updateError;

  // Auto-log stage_change and status_change activities
  const activityInserts: Array<{ id: string; dealId: string; spaceId: string; type: string; content: string; metadata: Record<string, unknown> }> = [];
  if (stageChanged) {
    const { data: newStageRow } = await supabase.from('DealStage').select('name').eq('id', body.stageId).maybeSingle();
    const { data: oldStageRow } = await supabase.from('DealStage').select('name').eq('id', existing.stageId).maybeSingle();
    activityInserts.push({
      id: crypto.randomUUID(),
      dealId: id,
      spaceId: existing.spaceId,
      type: 'stage_change',
      content: `Moved from "${oldStageRow?.name ?? 'Unknown'}" to "${newStageRow?.name ?? 'Unknown'}"`,
      metadata: { fromStageId: existing.stageId, toStageId: body.stageId },
    });
  }
  if (statusChanged) {
    const labelMap: Record<string, string> = { active: 'Active', won: 'Won', lost: 'Lost', on_hold: 'On Hold' };
    activityInserts.push({
      id: crypto.randomUUID(),
      dealId: id,
      spaceId: existing.spaceId,
      type: 'status_change',
      content: `Marked as ${labelMap[body.status] ?? body.status}`,
      metadata: { fromStatus: existing.status, toStatus: body.status },
    });
  }
  if (activityInserts.length > 0) {
    await supabase.from('DealActivity').insert(activityInserts);
  }

  // Get stage for the include
  const stageIdToFetch = body.stageId ?? existing.stageId;
  const { data: stageRow, error: stageError } = await supabase
    .from('DealStage')
    .select('*')
    .eq('id', stageIdToFetch)
    .single();
  if (stageError && stageError.code !== 'PGRST116') throw stageError;

  const deal = {
    ...dealRow,
    stage: stageRow || null
  } as Deal & { stage: DealStage | null };

  syncDeal(deal).catch(console.error);
  void audit({ actorClerkId: userId, action: 'UPDATE', resource: 'Deal', resourceId: id, spaceId: space.id, req });

  return NextResponse.json(deal);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

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
  void audit({
    actorClerkId: userId,
    action: 'DELETE',
    resource: 'Deal',
    resourceId: id,
    spaceId: space.id,
    req: _req,
    metadata: { title: deal.title },
  });

  return NextResponse.json({ success: true });
}
