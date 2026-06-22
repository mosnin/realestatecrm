import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';

type ContactNoteRow = {
  id: string;
  notes: string | null;
  spaceId: string | null;
  brokerageId?: string | null;
  applicationStatusNote?: string | null;
};

type ContactUpdateScope = { column: 'spaceId' | 'brokerageId'; value: string };

const addNoteSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
  note: z.string().min(1, 'Note cannot be empty').max(2000, 'Note too long'),
});

async function resolveBrokerContactAccess(params: {
  contactId: string;
  brokerage: { id: string; ownerId: string };
  select: string;
}): Promise<{
  contact: ContactNoteRow | null;
  updateScope: ContactUpdateScope | null;
  brokerSpaceId: string | null;
}> {
  const { contactId, brokerage, select } = params;

  const { data: ownerSpace } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', brokerage.ownerId)
    .maybeSingle();
  const brokerSpaceId = ownerSpace?.id ?? null;

  if (brokerSpaceId) {
    const { data: brokerSpaceContact, error: brokerSpaceError } = await supabase
      .from('Contact')
      .select(select)
      .eq('id', contactId)
      .eq('spaceId', brokerSpaceId)
      .maybeSingle();
    if (brokerSpaceError) throw brokerSpaceError;
    if (brokerSpaceContact) {
      return {
        contact: brokerSpaceContact as unknown as ContactNoteRow,
        updateScope: { column: 'spaceId', value: brokerSpaceId },
        brokerSpaceId,
      };
    }
  }

  const { data: brokerageContact, error: brokerageContactError } = await supabase
    .from('Contact')
    .select(select)
    .eq('id', contactId)
    .eq('brokerageId', brokerage.id)
    .maybeSingle();
  if (brokerageContactError) throw brokerageContactError;
  if (brokerageContact) {
    return {
      contact: brokerageContact as unknown as ContactNoteRow,
      updateScope: { column: 'brokerageId', value: brokerage.id },
      brokerSpaceId,
    };
  }

  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select(select)
    .eq('id', contactId)
    .maybeSingle();
  if (contactError) throw contactError;
  if (!contact) return { contact: null, updateScope: null, brokerSpaceId };

  const row = contact as unknown as ContactNoteRow;
  if (!row.spaceId) return { contact: null, updateScope: null, brokerSpaceId };

  const { data: spaceOwner } = await supabase
    .from('Space')
    .select('ownerId')
    .eq('id', row.spaceId)
    .maybeSingle();

  if (!spaceOwner) return { contact: null, updateScope: null, brokerSpaceId };

  const { data: membership } = await supabase
    .from('BrokerageMembership')
    .select('id')
    .eq('brokerageId', brokerage.id)
    .eq('userId', spaceOwner.ownerId)
    .maybeSingle();

  if (!membership) return { contact: null, updateScope: null, brokerSpaceId };

  return {
    contact: row,
    updateScope: { column: 'spaceId', value: row.spaceId },
    brokerSpaceId,
  };
}

/**
 * POST /api/broker/lead-note
 *
 * Appends a broker note to a contact's notes field.
 * The note is prefixed with "[Broker: Name - Date]" so realtors can see who wrote it.
 * Works on contacts in both the broker's space (unassigned) and realtor spaces (assigned).
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { brokerage, dbUserId } = ctx;

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;

  const parsed = addNoteSchema.safeParse(read.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request data', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { contactId, note } = parsed.data;

  try {
    // Get broker user's name
    const { data: brokerUser } = await supabase
      .from('User')
      .select('name, email')
      .eq('id', dbUserId)
      .maybeSingle();
    const brokerName = brokerUser?.name ?? brokerUser?.email ?? 'Broker';

    const { contact, updateScope, brokerSpaceId } = await resolveBrokerContactAccess({
      contactId,
      brokerage,
      select: 'id, notes, spaceId, brokerageId, applicationStatusNote',
    });

    if (!contact || !updateScope) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Build the note prefix
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const prefix = `[Broker: ${brokerName} - ${dateStr}]`;
    const newNote = `${prefix} ${note}`;

    // Prepend to existing notes (newest first)
    const existingNotes = contact.notes ?? '';
    const updatedNotes = existingNotes
      ? `${newNote}\n\n${existingNotes}`
      : newNote;

    const { error: updateError } = await supabase
      .from('Contact')
      .update({
        notes: updatedNotes,
        updatedAt: now.toISOString(),
      })
      .eq('id', contactId)
      .eq(updateScope.column, updateScope.value);

    if (updateError) throw updateError;

    // If this is an assigned broker-owned lead, also add the note to the realtor's copy.
    // The update is bound to the assigned space from the assignment metadata so a stale
    // or tampered assignedContactId cannot update an arbitrary contact with the same id.
    if (contact.spaceId === brokerSpaceId && contact.applicationStatusNote) {
      try {
        const meta = JSON.parse(contact.applicationStatusNote) as {
          assignedContactId?: string;
          assignedSpaceId?: string;
        };
        if (meta.assignedContactId && meta.assignedSpaceId) {
          const { data: realtorContact } = await supabase
            .from('Contact')
            .select('id, notes')
            .eq('id', meta.assignedContactId)
            .eq('spaceId', meta.assignedSpaceId)
            .maybeSingle();

          if (realtorContact) {
            const realtorExisting = realtorContact.notes ?? '';
            const realtorUpdated = realtorExisting
              ? `${newNote}\n\n${realtorExisting}`
              : newNote;

            await supabase
              .from('Contact')
              .update({
                notes: realtorUpdated,
                updatedAt: now.toISOString(),
              })
              .eq('id', meta.assignedContactId)
              .eq('spaceId', meta.assignedSpaceId);
          }
        }
      } catch {
        // If parsing fails, skip syncing to realtor copy
      }
    }

    return NextResponse.json({
      success: true,
      note: newNote,
      updatedNotes,
    });
  } catch (error) {
    console.error('[lead-note] error', { contactId, error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * GET /api/broker/lead-note?contactId=xxx
 *
 * Returns the notes for a contact (broker must have access).
 */
export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { brokerage } = ctx;

  const contactId = req.nextUrl.searchParams.get('contactId');
  if (!contactId) {
    return NextResponse.json({ error: 'contactId required' }, { status: 400 });
  }

  try {
    const { contact } = await resolveBrokerContactAccess({
      contactId,
      brokerage,
      select: 'id, notes, spaceId, brokerageId',
    });

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ notes: contact.notes ?? '' });
  } catch (error) {
    console.error('[lead-note] GET error', { contactId, error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
