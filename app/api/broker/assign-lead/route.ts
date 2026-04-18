import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, canManageLeads } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getSpaceByOwnerId } from '@/lib/space';
import { notifyNewLead } from '@/lib/notify';
import { z } from 'zod';

const assignLeadSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
  realtorUserId: z.string().uuid('Invalid realtor user ID'),
});

/**
 * POST /api/broker/assign-lead
 *
 * Assigns a brokerage lead (Contact) from the broker's space to a realtor's space.
 * Only broker_owner and broker_admin roles can perform this action.
 *
 * Flow:
 * 1. Verify caller is a broker (owner or admin)
 * 2. Verify the contact exists in the broker's space
 * 3. Verify the realtor is a member of this brokerage
 * 4. Clone the contact into the realtor's space
 * 5. Mark the original contact as assigned
 * 6. Notify the realtor
 */
export async function POST(req: NextRequest) {
  // ── Auth: require broker_owner or broker_admin ───────────────────────────
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Role check: only broker_owner and broker_admin can assign leads ─────
  if (!canManageLeads(ctx.membership.role)) {
    return NextResponse.json(
      { error: 'Only the owner or admins can assign leads' },
      { status: 403 },
    );
  }

  const { brokerage, dbUserId } = ctx;

  // ── Parse request body ───────────────────────────────────────────────────
  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = assignLeadSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request data', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { contactId, realtorUserId } = parsed.data;

  try {
    // ── Find the broker's space ──────────────────────────────────────────
    const brokerSpace = await getSpaceByOwnerId(brokerage.ownerId);
    if (!brokerSpace) {
      return NextResponse.json(
        { error: 'Broker space not found' },
        { status: 500 },
      );
    }

    // ── Verify the contact belongs to this brokerage ─────────────────────
    // Accept contacts in the broker owner's space (legacy path) OR contacts
    // where brokerageId is explicitly set (modern intake path).
    const { data: contactInSpace, error: contactError } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', contactId)
      .eq('spaceId', brokerSpace.id)
      .maybeSingle();
    if (contactError) throw contactError;

    let contact = contactInSpace;
    if (!contact) {
      const { data: contactByBrokerageId, error: brokerageContactError } = await supabase
        .from('Contact')
        .select('*')
        .eq('id', contactId)
        .eq('brokerageId', brokerage.id)
        .maybeSingle();
      if (brokerageContactError) throw brokerageContactError;
      contact = contactByBrokerageId;
    }

    if (!contact) {
      return NextResponse.json(
        { error: 'Contact not found in your brokerage space' },
        { status: 404 },
      );
    }

    // ── Verify the realtor is a member of this brokerage ─────────────────
    const { data: realtorMembership, error: memberError } = await supabase
      .from('BrokerageMembership')
      .select('id, role, userId')
      .eq('brokerageId', brokerage.id)
      .eq('userId', realtorUserId)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!realtorMembership) {
      return NextResponse.json(
        { error: 'User is not a member of this brokerage' },
        { status: 403 },
      );
    }

    // ── Find the realtor's space ─────────────────────────────────────────
    const realtorSpace = await getSpaceByOwnerId(realtorUserId);
    if (!realtorSpace) {
      return NextResponse.json(
        { error: 'Member does not have a workspace yet' },
        { status: 404 },
      );
    }

    // ── Fetch the realtor's name ────────────────────────────────────────
    const { data: realtorUser } = await supabase
      .from('User')
      .select('name, email')
      .eq('id', realtorUserId)
      .maybeSingle();
    const realtorName = realtorUser?.name ?? realtorUser?.email ?? realtorUserId;

    // ── Prevent double-assignment ────────────────────────────────────────
    const existingTags: string[] = contact.tags ?? [];
    if (existingTags.includes('assigned')) {
      return NextResponse.json(
        { error: 'This lead has already been assigned' },
        { status: 409 },
      );
    }

    // ── Clone the contact into the realtor's space ───────────────────────
    const newContactId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: cloneError } = await supabase.from('Contact').insert({
      id: newContactId,
      spaceId: realtorSpace.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      budget: contact.budget,
      preferences: contact.preferences,
      address: contact.address,
      notes: contact.notes,
      type: contact.type,
      properties: contact.properties ?? [],
      tags: ['assigned-by-broker', 'new-lead'],
      scoringStatus: contact.scoringStatus,
      leadScore: contact.leadScore,
      scoreLabel: contact.scoreLabel,
      scoreSummary: contact.scoreSummary,
      scoreDetails: contact.scoreDetails,
      sourceLabel: `brokerage: ${brokerage.name}`,
      applicationData: contact.applicationData,
      applicationRef: contact.applicationRef,
      applicationStatus: contact.applicationStatus,
    });
    if (cloneError) throw cloneError;

    // ── Update original contact as assigned ──────────────────────────────
    const assignmentNote = [
      contact.notes,
      `\nAssigned to: ${realtorName}`,
      `--- Assigned to realtor (${realtorUserId}) on ${now} by ${dbUserId} ---`,
    ]
      .filter(Boolean)
      .join('\n');

    const assignmentMeta = JSON.stringify({
      assignedTo: realtorUserId,
      assignedToName: realtorName,
      assignedContactId: newContactId,
      assignedSpaceId: realtorSpace.id,
      assignedAt: now,
    });

    const { error: updateError } = await supabase
      .from('Contact')
      .update({
        tags: [...existingTags.filter((t: string) => t !== 'new-lead'), 'assigned'],
        notes: assignmentNote,
        applicationStatus: 'assigned',
        applicationStatusNote: assignmentMeta,
        updatedAt: now,
      })
      .eq('id', contactId);
    if (updateError) throw updateError;

    console.info('[assign-lead] lead assigned', {
      contactId,
      newContactId,
      brokerageId: brokerage.id,
      realtorUserId,
      assignedBy: dbUserId,
    });

    // ── Notify the realtor ─────────────────────────────────────────────
    try {
      await notifyNewLead({
        spaceId: realtorSpace.id,
        contactId: newContactId,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        leadScore: contact.leadScore,
        scoreLabel: contact.scoreLabel,
        scoreSummary: contact.scoreSummary,
        applicationData: contact.applicationData,
      });
    } catch (e) {
      console.error('[assign-lead] notification failed:', { newContactId, e });
    }

    return NextResponse.json(
      {
        success: true,
        newContactId,
        assignedTo: realtorUserId,
        assignedToSpaceId: realtorSpace.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[assign-lead] unhandled error', {
      contactId,
      realtorUserId,
      brokerageId: brokerage.id,
      error,
    });
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
