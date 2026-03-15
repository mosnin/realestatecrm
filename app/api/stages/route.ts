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

  // Get stages
  const { data: stageRows, error: stageError } = await supabase
    .from('DealStage')
    .select('*')
    .eq('spaceId', space.id)
    .order('position', { ascending: true });
  if (stageError) throw stageError;

  // Get deals
  const { data: dealRows, error: dealError } = await supabase
    .from('Deal')
    .select('*')
    .eq('spaceId', space.id)
    .order('position', { ascending: true });
  if (dealError) throw dealError;

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
      contact: dc.Contact ? { id: dc.Contact.id, name: dc.Contact.name } : null
    });
    dcByDeal.set(dc.dealId, arr);
  }

  // Group deals by stageId
  const dealsByStage = new Map<string, any[]>();
  for (const deal of dealRows) {
    const arr = dealsByStage.get(deal.stageId) || [];
    arr.push({
      ...deal,
      dealContacts: dcByDeal.get(deal.id) || []
    });
    dealsByStage.set(deal.stageId, arr);
  }

  // Assemble stages with deals
  const stages = stageRows.map((stage: any) => ({
    ...stage,
    deals: dealsByStage.get(stage.id) || []
  }));

  return NextResponse.json(stages);
}

export async function POST(req: NextRequest) {
  const { slug, name, color } = await req.json();

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Validate color is a safe 6-digit hex code to prevent CSS injection
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const safeColor = typeof color === 'string' && HEX_COLOR.test(color) ? color : '#6366f1';

  const { data: lastStageRows, error: lastStageError } = await supabase
    .from('DealStage')
    .select('position')
    .eq('spaceId', space.id)
    .order('position', { ascending: false })
    .limit(1);
  if (lastStageError) throw lastStageError;
  const lastPosition = lastStageRows.length > 0 ? lastStageRows[0].position : -1;

  const id = crypto.randomUUID();
  const { data: stage, error: insertError } = await supabase.from('DealStage').insert({
    id,
    spaceId: space.id,
    name,
    color: safeColor,
    position: lastPosition + 1,
  }).select().single();
  if (insertError) throw insertError;

  return NextResponse.json(stage as DealStage, { status: 201 });
}
