/**
 * GET /api/ai/turn-status?conversationId=… — is a turn running server-side?
 *
 * The reopen half of the disconnect-survival contract. A turn survives the
 * browser closing (the server keeps generating and persists the answer);
 * this endpoint is how a client that comes back — after navigation, a tab
 * restore, or a full browser restart — learns that a turn is still in
 * flight so it can show "Chippi is working" and poll for the answer
 * instead of rendering a dead transcript.
 *
 * Response: { inFlight: boolean, startedAt?: number, known: boolean }
 * `known:false` means Redis isn't configured — presence is unknowable and
 * the client should not poll (the pre-existing behavior, never worse).
 *
 * Auth mirrors POST /api/ai/stop exactly: the conversation must belong to
 * the caller's space (realtor surface) or their brokerage (broker surface).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { getTurnPresence } from '@/lib/chat/turn-presence';
import { isReservedConversationTitle } from '@/lib/chat/conversation-access';
import { resolveBrokerContext } from '@/lib/agent/broker-context';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  }

  // ── Realtor surface ─────────────────────────────────────────────────────
  const space = await getSpaceForUser(userId);
  if (space) {
    const { data: convo } = await tenantTable(supabase, 'Conversation', { spaceId: space.id })
      .select('id, title')
      .eq('id', conversationId)
      .maybeSingle();
    if (convo && !isReservedConversationTitle((convo as { title?: string | null }).title)) {
      return NextResponse.json(presencePayload(await getTurnPresence(conversationId)));
    }
  }

  // ── Broker surface ──────────────────────────────────────────────────────
  const brokerCtx = await resolveBrokerContext();
  if (brokerCtx) {
    const { data: brokerConvo } = await tenantTable(supabase, 'BrokerConversation', {
      brokerageId: brokerCtx.brokerage.id,
    })
      .select('id')
      .eq('id', conversationId)
      .maybeSingle();
    if (brokerConvo) {
      return NextResponse.json(presencePayload(await getTurnPresence(conversationId)));
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

function presencePayload(
  presence: Awaited<ReturnType<typeof getTurnPresence>>,
): { inFlight: boolean; startedAt?: number; known: boolean } {
  if (presence === null) return { inFlight: false, known: false };
  return { ...presence, known: true };
}
