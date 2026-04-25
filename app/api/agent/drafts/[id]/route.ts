import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { audit } from '@/lib/audit';
import { sendDraft, type DeliveryResult } from '@/lib/delivery';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const validStatuses = ['approved', 'dismissed'] as const;
  type ActionStatus = (typeof validStatuses)[number];

  const newStatus: ActionStatus | undefined = validStatuses.includes(body.status)
    ? (body.status as ActionStatus)
    : undefined;

  if (!newStatus) {
    return NextResponse.json(
      { error: 'status must be "approved" or "dismissed"' },
      { status: 400 },
    );
  }

  // Verify the draft belongs to this space and is still pending
  const { data: existing, error: fetchError } = await supabase
    .from('AgentDraft')
    .select('id, status, contactId, dealId, channel, subject, content, outcome')
    .eq('id', id)
    .eq('spaceId', space.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: `Draft is already ${existing.status}` },
      { status: 409 },
    );
  }

  // Allow the realtor to edit content before approving
  let finalContent: string = existing.content;
  if (newStatus === 'approved' && body.content !== undefined) {
    if (typeof body.content !== 'string' || body.content.trim().length === 0) {
      return NextResponse.json({ error: 'content must be a non-empty string' }, { status: 400 });
    }
    finalContent = body.content.trim();
  }

  // ── Dismissed: simple status update ──────────────────────────────────────
  if (newStatus === 'dismissed') {
    const dismissPatch: Record<string, unknown> = {
      status: 'dismissed',
      updatedAt: new Date().toISOString(),
    };
    if (!existing.outcome) {
      dismissPatch.outcome = 'no_response';
      dismissPatch.outcomeDetectedAt = new Date().toISOString();
    }
    const { data: updated, error: updateError } = await supabase
      .from('AgentDraft')
      .update(dismissPatch)
      .eq('id', id)
      .eq('spaceId', space.id)
      .select()
      .single();

    if (updateError) throw updateError;

    void audit({
      actorClerkId: userId,
      action: 'UPDATE',
      resource: 'AgentDraft',
      resourceId: id,
      spaceId: space.id,
      metadata: { newStatus: 'dismissed', contactId: existing.contactId },
    });

    return NextResponse.json(updated);
  }

  // ── Approved: attempt delivery, then set final status ────────────────────

  // Fetch contact info needed for delivery (email / phone)
  let contact = { name: 'Contact', email: null as string | null, phone: null as string | null };
  if (existing.contactId) {
    const { data: contactRow } = await supabase
      .from('Contact')
      .select('name, email, phone')
      .eq('id', existing.contactId)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (contactRow) contact = contactRow;
  }

  const deliveryResult: DeliveryResult = await sendDraft(
    { channel: existing.channel, subject: existing.subject, content: finalContent },
    contact,
    space.name,
  );

  // sent=true → "sent"; sent=false → "approved" (human reviewed, delivery unconfigured/failed)
  const finalStatus = deliveryResult.sent ? 'sent' : 'approved';

  const patch: Record<string, unknown> = {
    status: finalStatus,
    updatedAt: new Date().toISOString(),
  };
  if (finalContent !== existing.content) patch.content = finalContent;

  const { data: updated, error: updateError } = await supabase
    .from('AgentDraft')
    .update(patch)
    .eq('id', id)
    .eq('spaceId', space.id)
    .select()
    .single();

  if (updateError) throw updateError;

  void audit({
    actorClerkId: userId,
    action: 'UPDATE',
    resource: 'AgentDraft',
    resourceId: id,
    spaceId: space.id,
    metadata: {
      newStatus: finalStatus,
      contactId: existing.contactId,
      channel: existing.channel,
      contentEdited: finalContent !== existing.content,
      deliverySent: deliveryResult.sent,
      deliveryError: deliveryResult.error,
    },
  });

  // Return draft + delivery result so the client can show appropriate feedback
  return NextResponse.json({ ...updated, deliveryResult });
}
