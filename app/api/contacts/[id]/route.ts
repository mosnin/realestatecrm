import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncContact, deleteContactVector } from '@/lib/vectorize';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import type { Contact } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const { data: contactRows, error: contactError } = await supabase
    .from('Contact')
    .select('*')
    .eq('id', id);
  if (contactError) throw contactError;

  if (!contactRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = contactRows[0] as Contact & { dealContacts?: any[] };

  const space = await getSpaceForUser(userId);
  if (!space || contact.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get dealContacts with deal and stage info
  const { data: dealContactRows, error: dcError } = await supabase
    .from('DealContact')
    .select('dealId, contactId, Deal(id, spaceId, title, description, value, address, priority, closeDate, stageId, position, createdAt, updatedAt, DealStage(id, spaceId, name, color, position))')
    .eq('contactId', id);
  if (dcError) throw dcError;

  contact.dealContacts = (dealContactRows || []).map((row: any) => ({
    dealId: row.dealId,
    contactId: row.contactId,
    deal: row.Deal
      ? {
          id: row.Deal.id,
          spaceId: row.Deal.spaceId,
          title: row.Deal.title,
          description: row.Deal.description,
          value: row.Deal.value,
          address: row.Deal.address,
          priority: row.Deal.priority,
          closeDate: row.Deal.closeDate,
          stageId: row.Deal.stageId,
          position: row.Deal.position,
          createdAt: row.Deal.createdAt,
          updatedAt: row.Deal.updatedAt,
          stage: row.Deal.DealStage
            ? {
                id: row.Deal.DealStage.id,
                spaceId: row.Deal.DealStage.spaceId,
                name: row.Deal.DealStage.name,
                color: row.Deal.DealStage.color,
                position: row.Deal.DealStage.position
              }
            : null
        }
      : null
  }));

  return NextResponse.json(contact);
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
    .from('Contact')
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
  const budgetVal = body.budget != null && body.budget !== '' ? parseFloat(body.budget) : null;
  const propsVal = body.properties ?? [];
  const tagsVal = body.tags ?? [];
  const typeChanged = body.type && body.type !== existing.type;

  const { data: contact, error: updateError } = await supabase
    .from('Contact')
    .update({
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      budget: budgetVal,
      preferences: body.preferences ?? null,
      properties: propsVal,
      address: body.address ?? null,
      notes: body.notes ?? null,
      type: body.type,
      tags: tagsVal,
      ...(body.followUpAt !== undefined && { followUpAt: body.followUpAt }),
      ...(body.lastContactedAt !== undefined && { lastContactedAt: body.lastContactedAt }),
      ...(body.sourceLabel !== undefined && { sourceLabel: body.sourceLabel }),
      ...(typeChanged && { stageChangedAt: new Date().toISOString() }),
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (updateError) throw updateError;

  syncContact(contact as Contact).catch(console.error);
  void audit({ actorClerkId: userId, action: 'UPDATE', resource: 'Contact', resourceId: id, spaceId: space.id, req });

  return NextResponse.json(contact);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const { data: contactRows, error: contactError } = await supabase
    .from('Contact')
    .select('*')
    .eq('id', id);
  if (contactError) throw contactError;
  if (!contactRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = contactRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || contact.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error: deleteError } = await supabase.from('Contact').delete().eq('id', id);
  if (deleteError) throw deleteError;
  deleteContactVector(contact.spaceId, id).catch(console.error);
  void audit({
    actorClerkId: userId,
    action: 'DELETE',
    resource: 'Contact',
    resourceId: id,
    spaceId: space.id,
    req: _req,
    metadata: { name: contact.name, email: contact.email },
  });

  return NextResponse.json({ success: true });
}
