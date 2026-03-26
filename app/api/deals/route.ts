import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requirePaidSpaceOwner } from '@/lib/api-auth';
import { syncDeal } from '@/lib/vectorize';
import { notifyNewDeal } from '@/lib/notify';
import type { Deal, DealStage } from '@/lib/types';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requirePaidSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Get deals with stage (paginated)
  const limit = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '200') || 200), 500);
  const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') ?? '0') || 0);

  const { data: dealRows, error: dealError } = await supabase
    .from('Deal')
    .select('*, DealStage(id, spaceId, name, color, position)')
    .eq('spaceId', space.id)
    .order('position', { ascending: true })
    .range(offset, offset + limit - 1);
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
  const body = await req.json();
  const { slug, title, description, value, address, priority, closeDate, stageId, contactIds } = body;

  const auth = await requirePaidSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Validate title length
  if (!title || typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 255) {
    return NextResponse.json({ error: 'Title required (max 255 chars)' }, { status: 400 });
  }

  // Verify the target stage belongs to this space (prevents cross-space stage injection)
  const { data: stageCheck, error: stageCheckErr } = await supabase
    .from('DealStage')
    .select('id')
    .eq('id', stageId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (stageCheckErr) throw stageCheckErr;
  if (!stageCheck) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });

  const { data: lastDealRows, error: lastDealError } = await supabase
    .from('Deal')
    .select('position')
    .eq('stageId', stageId)
    .order('position', { ascending: false })
    .limit(1);
  if (lastDealError) throw lastDealError;
  const lastPosition = lastDealRows.length > 0 ? lastDealRows[0].position : -1;

  const dealId = crypto.randomUUID();
  const valueVal = value != null && value !== '' ? parseFloat(value) : null;
  if (valueVal !== null && isNaN(valueVal)) {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
  }
  let closeDateVal: string | null = null;
  if (closeDate) {
    const d = new Date(closeDate);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid closeDate' }, { status: 400 });
    closeDateVal = d.toISOString();
  }

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

  // Insert dealContacts — verify all contacts belong to this space
  if (contactIds?.length) {
    const { data: validContacts, error: vcError } = await supabase
      .from('Contact')
      .select('id')
      .in('id', contactIds)
      .eq('spaceId', space.id);
    if (vcError) throw vcError;
    const validIds = new Set((validContacts ?? []).map((c: { id: string }) => c.id));
    const dcInserts = (contactIds as string[]).filter((cId) => validIds.has(cId)).map((cId) => ({ dealId, contactId: cId }));
    if (dcInserts.length > 0) {
      const { error: dcError } = await supabase.from('DealContact').insert(dcInserts);
      if (dcError) throw dcError;
    }
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

  // Email + SMS notification for new deal (non-blocking)
  notifyNewDeal({
    spaceId: space.id,
    dealTitle: title,
    dealValue: valueVal,
    dealAddress: address || null,
    dealPriority: priority || null,
  }).catch(console.error);

  return NextResponse.json(deal, { status: 201 });
}
