/**
 * POST /api/ai/stop — stop the in-flight chat turn on a conversation.
 *
 * The disconnect-survival contract means the server never aborts a turn
 * just because the response stream closed; this endpoint is the EXPLICIT
 * stop the composer's Stop button fires before it drops the fetch. The
 * streaming paths poll the flag (lib/chat/stop-signal.ts) and abort
 * generation; whatever text already streamed is persisted honestly.
 *
 * Body: { conversationId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { requestChatStop } from '@/lib/chat/stop-signal';
import { isReservedConversationTitle } from '@/lib/chat/conversation-access';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const { conversationId } = (read.data ?? {}) as { conversationId?: string };
  if (typeof conversationId !== 'string' || !conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  }

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // The conversation must belong to the caller's space — without this,
  // any authed user could stop any tenant's turns by id. Reserved broker/
  // team conversations share the owner's spaceId but are NOT realtor-surface
  // conversations, so they're rejected here like every other realtor route
  // (see lib/chat/conversation-access.ts).
  const { data: convo } = await supabase
    .from('Conversation')
    .select('id, title')
    .eq('id', conversationId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!convo || isReservedConversationTitle((convo as { title?: string | null }).title)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const signalled = await requestChatStop(conversationId);
  // signalled=false means Redis isn't configured — Stop degrades to
  // client-side rendering stop. Honest response either way.
  return NextResponse.json({ ok: true, signalled });
}
