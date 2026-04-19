import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { audit } from '@/lib/audit';

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

  // Verify the draft belongs to this space before updating
  const { data: existing, error: fetchError } = await supabase
    .from('AgentDraft')
    .select('id, status, contactId, channel, content')
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

  const { data: updated, error: updateError } = await supabase
    .from('AgentDraft')
    .update({ status: newStatus, updatedAt: new Date().toISOString() })
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
    metadata: { newStatus, contactId: existing.contactId },
  });

  return NextResponse.json(updated);
}
