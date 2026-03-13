import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import type { DealStage } from '@/lib/types';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug, name, color } = await req.json();
  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
    color: color ?? '#6366f1',
    position: lastPosition + 1,
  }).select().single();
  if (insertError) throw insertError;

  return NextResponse.json(stage as DealStage, { status: 201 });
}
