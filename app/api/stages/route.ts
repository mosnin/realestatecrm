import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import type { DealStage } from '@/lib/types';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const pipelineId = req.nextUrl.searchParams.get('pipelineId');
  const pipelineType = req.nextUrl.searchParams.get('pipelineType');

  let stageQuery = supabase.from('DealStage').select('*').eq('spaceId', space.id);

  if (pipelineId) {
    stageQuery = stageQuery.eq('pipelineId', pipelineId);
  } else if (pipelineType === 'rental' || pipelineType === 'buyer') {
    // Legacy fallback: filter by pipelineType for pre-bootstrap spaces
    stageQuery = stageQuery.eq('pipelineType', pipelineType);
  }

  const { data: stageData, error: stageError } = await stageQuery.order('position', {
    ascending: true,
  });
  if (stageError) throw stageError;
  const stageRows = stageData || [];

  // Get deals – only for the stages in the current result set
  const stageIds = stageRows.map((r: any) => r.id);
  let dealRows: any[] = [];
  if (stageIds.length > 0) {
    const { data, error: dealError } = await supabase
      .from('Deal')
      .select('*')
      .eq('spaceId', space.id)
      .in('stageId', stageIds)
      .order('position', { ascending: true });
    if (dealError) throw dealError;
    dealRows = data || [];
  }

  const dealIds = dealRows.map((r: any) => r.id);

  // Get dealContacts with contact info
  let dealContactRows: any[] = [];
  if (dealIds.length > 0) {
    const { data, error: dcError } = await supabase
      .from('DealContact')
      .select('dealId, contactId, Contact(id, name)')
      .in('dealId', dealIds);
    if (dcError) throw dcError;
    dealContactRows = data || [];
  }

  // Group dealContacts by dealId
  const dcByDeal = new Map<string, any[]>();
  for (const dc of dealContactRows) {
    const arr = dcByDeal.get(dc.dealId) || [];
    arr.push({
      dealId: dc.dealId,
      contactId: dc.contactId,
      contact: dc.Contact ? { id: dc.Contact.id, name: dc.Contact.name } : null,
    });
    dcByDeal.set(dc.dealId, arr);
  }

  // Group deals by stageId
  const dealsByStage = new Map<string, any[]>();
  for (const deal of dealRows) {
    const arr = dealsByStage.get(deal.stageId) || [];
    arr.push({
      ...deal,
      dealContacts: dcByDeal.get(deal.id) || [],
    });
    dealsByStage.set(deal.stageId, arr);
  }

  // Assemble stages with deals
  const stages = stageRows.map((stage: any) => ({
    ...stage,
    deals: dealsByStage.get(stage.id) || [],
  }));

  return NextResponse.json(stages);
}

export async function POST(req: NextRequest) {
  const { slug, name, color, pipelineType, pipelineId } = await req.json();

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (name.trim().length > 100) {
    return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });
  }

  // Validate color is a safe 6-digit hex code to prevent CSS injection
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const safeColor = typeof color === 'string' && HEX_COLOR.test(color) ? color : '#6366f1';

  // pipelineId takes precedence; fall back to pipelineType for legacy paths
  const safePipelineId = typeof pipelineId === 'string' && pipelineId.trim().length > 0
    ? pipelineId.trim()
    : null;
  const safePipelineType = safePipelineId
    ? (pipelineType ?? null)
    : (pipelineType === 'buyer' ? 'buyer' : 'rental');

  // Get the last position within the same pipeline
  let lastQuery = supabase
    .from('DealStage')
    .select('position')
    .eq('spaceId', space.id)
    .order('position', { ascending: false })
    .limit(1);

  if (safePipelineId) {
    lastQuery = lastQuery.eq('pipelineId', safePipelineId);
  } else if (safePipelineType) {
    lastQuery = lastQuery.eq('pipelineType', safePipelineType);
  }

  const { data: lastStageRows, error: lastStageError } = await lastQuery;
  if (lastStageError) throw lastStageError;
  const lastPosition = lastStageRows && lastStageRows.length > 0 ? lastStageRows[0].position : -1;

  const id = crypto.randomUUID();
  const insertData: Record<string, unknown> = {
    id,
    spaceId: space.id,
    name: name.trim(),
    color: safeColor,
    position: lastPosition + 1,
  };
  if (safePipelineId) insertData.pipelineId = safePipelineId;
  if (safePipelineType) insertData.pipelineType = safePipelineType;

  const { data: stage, error: insertError } = await supabase
    .from('DealStage')
    .insert(insertData)
    .select()
    .single();
  if (insertError) throw insertError;

  return NextResponse.json(stage as DealStage, { status: 201 });
}
