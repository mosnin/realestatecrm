import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { syncDeal } from '@/lib/vectorize';
import type { Deal, DealStage } from '@/lib/types';

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

  // Get deals with stage
  const { data: dealRows, error: dealError } = await supabase
    .from('Deal')
    .select('*, DealStage(id, spaceId, name, color, position)')
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

  const deals = dealRows.map((row: any) => ({
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    description: row.description,
    value: row.value,
    address: row.address,
    priority: row.priority,
    closeDate: row.closeDate,
    stageId: row.stageId,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stage: row.DealStage
      ? {
          id: row.DealStage.id,
          spaceId: row.DealStage.spaceId,
          name: row.DealStage.name,
          color: row.DealStage.color,
          position: row.DealStage.position
        }
      : null,
    dealContacts: dcByDeal.get(row.id) || []
  }));

  return NextResponse.json(deals);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { slug, title, description, value, address, priority, closeDate, stageId, contactIds } = body;

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: lastDealRows, error: lastDealError } = await supabase
    .from('Deal')
    .select('position')
    .eq('stageId', stageId)
    .order('position', { ascending: false })
    .limit(1);
  if (lastDealError) throw lastDealError;
  const lastPosition = lastDealRows.length > 0 ? lastDealRows[0].position : -1;

  const dealId = crypto.randomUUID();
  const valueVal = value ? parseFloat(value) : null;
  const closeDateVal = closeDate ? new Date(closeDate).toISOString() : null;

  const { data: dealRow, error: dealError } = await supabase.from('Deal').insert({
    id: dealId,
    spaceId: space.id,
    title,
    description: description || null,
    value: valueVal,
    address: address || null,
    priority: priority || 'MEDIUM',
    closeDate: closeDateVal,
    stageId,
    position: lastPosition + 1,
  }).select().single();
  if (dealError) throw dealError;

  // Insert dealContacts
  if (contactIds?.length) {
    const dcInserts = contactIds.map((cId: string) => ({ dealId, contactId: cId }));
    const { error: dcError } = await supabase.from('DealContact').insert(dcInserts);
    if (dcError) throw dcError;
  }

  // Get stage for the include
  const { data: stageRow, error: stageError } = await supabase
    .from('DealStage')
    .select('*')
    .eq('id', stageId)
    .single();
  if (stageError && stageError.code !== 'PGRST116') throw stageError;

  const deal = {
    ...dealRow,
    stage: stageRow || null
  } as Deal & { stage: DealStage | null };

  syncDeal(deal).catch(console.error);

  return NextResponse.json(deal, { status: 201 });
}
