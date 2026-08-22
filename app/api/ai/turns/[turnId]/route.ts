import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { cancelQueuedConversationTurn } from '@/lib/chat/turn-control';
import { isReservedConversationTitle } from '@/lib/chat/conversation-access';

export const runtime = 'nodejs';

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
  const space = await getSpaceForUser(auth.userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: turn } = await tenantTable(supabase, 'ConversationTurn', { spaceId: space.id })
    .select('id, conversationId')
    .eq('id', turnId)
    .maybeSingle();
  if (!turn) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: conversation } = await tenantTable(supabase, 'Conversation', { spaceId: space.id })
    .select('id, title')
    .eq('id', turn.conversationId)
    .maybeSingle();
  if (!conversation || isReservedConversationTitle(conversation.title)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const cancelled = await cancelQueuedConversationTurn(supabase, {
      turnId,
      spaceId: space.id,
      conversationId: turn.conversationId,
    });
    return NextResponse.json({ turn: cancelled });
  } catch {
    return NextResponse.json({ error: 'Turn cannot be removed' }, { status: 409 });
  }
}
