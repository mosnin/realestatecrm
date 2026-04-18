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
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: contactRows, error: contactError } = await supabase
    .from('Contact')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id);
  if (contactError) throw contactError;

  if (!contactRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = contactRows[0] as Contact & { dealContacts?: any[] };

  // Get dealContacts with deal and stage info
  const { data: dealContactRows, error: dcError } = await supabase
    .from('DealContact')
    .select('dealId, contactId, Deal(id, spaceId, title, description, value, address, priority, closeDate, stageId, position, createdAt, updatedAt, DealStage(id, spaceId, name, color, position))')
    .eq('contactId', id);
  if (dcError) throw dcError;

  // Filter dealContacts to only include deals belonging to the user's space
  const filteredDealContactRows = (dealContactRows || []).filter(
    (row: any) => row.Deal && row.Deal.spaceId === space.id
  );

  contact.dealContacts = filteredDealContactRows.map((row: any) => ({
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
  try {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { id } = await params;

    const space = await getSpaceForUser(userId);
    if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: existingRows, error: existingError } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', id)
      .eq('spaceId', space.id);
    if (existingError) {
      console.error('[contacts/PATCH] fetch error:', existingError);
      return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
    }
    if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const existing = existingRows[0];

    const body = await req.json();

    // Build update object — only include fields present in the request body
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email ?? null;
    if (body.phone !== undefined) updates.phone = body.phone ?? null;
    if (body.address !== undefined) updates.address = body.address ?? null;
    if (body.notes !== undefined) updates.notes = body.notes ?? null;
    if (body.preferences !== undefined) updates.preferences = body.preferences ?? null;
    if (body.properties !== undefined) updates.properties = body.properties ?? [];
    if (body.tags !== undefined) updates.tags = body.tags ?? [];
    if (body.followUpAt !== undefined) updates.followUpAt = body.followUpAt;
    if (body.lastContactedAt !== undefined) updates.lastContactedAt = body.lastContactedAt;
    if (body.sourceLabel !== undefined) updates.sourceLabel = body.sourceLabel;

    if (body.budget !== undefined) {
      const budgetVal = body.budget != null && body.budget !== '' ? parseFloat(body.budget) : null;
      if (budgetVal !== null && isNaN(budgetVal)) {
        return NextResponse.json({ error: 'Invalid budget' }, { status: 400 });
      }
      updates.budget = budgetVal;
    }

    if (body.type !== undefined) {
      const VALID_CONTACT_TYPES = ['QUALIFICATION', 'TOUR', 'APPLICATION'];
      if (!VALID_CONTACT_TYPES.includes(body.type)) {
        return NextResponse.json({ error: 'Invalid type. Must be QUALIFICATION, TOUR, or APPLICATION' }, { status: 400 });
      }
      updates.type = body.type;
      if (body.type !== existing.type) {
        updates.stageChangedAt = new Date().toISOString();
      }
    }

    const { data: contact, error: updateError } = await supabase
      .from('Contact')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (updateError) {
      console.error('[contacts/PATCH] update error:', updateError);
      return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
    }

    syncContact(contact as Contact).catch(console.error);
    void audit({ actorClerkId: userId, action: 'UPDATE', resource: 'Contact', resourceId: id, spaceId: space.id, req });

    return NextResponse.json(contact);
  } catch (err) {
    console.error('[contacts/PATCH] unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: contactRows, error: contactError } = await supabase
    .from('Contact')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id);
  if (contactError) {
    console.error('[contacts/DELETE] fetch error:', contactError);
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
  }
  if (!contactRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = contactRows[0];

  const { error: deleteError } = await supabase.from('Contact').delete().eq('id', id);
  if (deleteError) {
    console.error('[contacts/DELETE] delete error:', deleteError);
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
  }
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
