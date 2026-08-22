import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { cancelQueuedConversationTurn } from '@/lib/chat/turn-control';
import { isReservedConversationTitle } from '@/lib/chat/conversation-access';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';

export const runtime = 'nodejs';

const updateSchema = z.object({ message: z.string().trim().min(1).max(8000) }).strict();

async function callerTurn(userId: string, turnId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return undefined;
  const { data: turn } = await tenantTable(supabase, 'ConversationTurn', { spaceId: space.id })
    .select('id, conversationId, status, message')
    .eq('id', turnId)
    .maybeSingle();
  if (!turn) return null;
  const { data: conversation } = await tenantTable(supabase, 'Conversation', { spaceId: space.id })
    .select('id, title')
    .eq('id', turn.conversationId)
    .maybeSingle();
  if (!conversation || isReservedConversationTitle(conversation.title)) return null;
  return { space, turn };
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ turnId: string }> },
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { turnId } = await params;
  if (!turnId || turnId.length > 200) {
    return NextResponse.json({ error: 'turnId is required' }, { status: 400 });
  }
  const bound = await callerTurn(auth.userId, turnId);
  if (bound === undefined) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (bound === null) return NextResponse.json({ removed: true });
  const { space, turn } = bound;
  // Delete is deliberately idempotent. A queued row can settle between the
  // click and the request; a completed/cancelled row is already absent from
  // the queue from the user's point of view.
  if (turn.status === 'completed' || turn.status === 'cancelled') {
    return NextResponse.json({ removed: true, turn });
  }
  try {
    const cancelled = await cancelQueuedConversationTurn(supabase, {
      turnId,
      spaceId: space.id,
      conversationId: turn.conversationId,
    });
    return NextResponse.json({ removed: true, turn: cancelled });
  } catch {
    const latest = await callerTurn(auth.userId, turnId);
    if (!latest || latest.turn.status === 'completed' || latest.turn.status === 'cancelled') {
      return NextResponse.json({ removed: true, turn: latest?.turn ?? null });
    }
    return NextResponse.json({ error: 'Turn cannot be removed' }, { status: 409 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ turnId: string }> },
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { turnId } = await params;
  if (!turnId || turnId.length > 200) {
    return NextResponse.json({ error: 'turnId is required' }, { status: 400 });
  }
  const read = await readJsonWithLimit(req, BODY_LIMITS.aiText);
  if (!read.ok) return read.response;
  const parsed = updateSchema.safeParse(read.data);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid queued message' }, { status: 400 });
  const bound = await callerTurn(auth.userId, turnId);
  if (!bound) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (bound.turn.status !== 'pending') {
    return NextResponse.json({ error: 'Only a queued message can be edited' }, { status: 409 });
  }
  const { data: turn, error } = await tenantTable(supabase, 'ConversationTurn', { spaceId: bound.space.id })
    .update({ message: parsed.data.message, updatedAt: new Date().toISOString() })
    .eq('id', turnId)
    .eq('status', 'pending')
    .select('id, conversationId, status, message')
    .maybeSingle();
  if (error || !turn) {
    return NextResponse.json({ error: 'Queued message changed before it could be edited' }, { status: 409 });
  }
  return NextResponse.json({ turn });
}
