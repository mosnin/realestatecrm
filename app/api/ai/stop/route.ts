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
import { requestConversationTurnCancellationV2 } from '@/lib/chat/turn-control';
import { isReservedConversationTitle } from '@/lib/chat/conversation-access';
import { resolveBrokerContext } from '@/lib/agent/broker-context';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const { conversationId, turnId } = (read.data ?? {}) as {
    conversationId?: string;
    turnId?: string;
  };
  if (typeof conversationId !== 'string' || !conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  }
  if (typeof turnId !== 'string' || !turnId || turnId.length > 200) {
    return NextResponse.json({ error: 'turnId is required' }, { status: 400 });
  }

  // ── Realtor surface ─────────────────────────────────────────────────────
  // The conversation must belong to the caller's space — without this, any
  // authed user could stop any tenant's turns by id. Reserved broker/team
  // conversations share the owner's spaceId but are NOT realtor-surface
  // conversations, so they're rejected here like every other realtor route
  // (see lib/chat/conversation-access.ts) and fall through to the broker
  // branch below.
  const space = await getSpaceForUser(userId);
  if (space) {
    const { data: convo } = await supabase
      .from('Conversation')
      .select('id, title')
      .eq('id', conversationId)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (convo && !isReservedConversationTitle((convo as { title?: string | null }).title)) {
      try {
        const { data: turn } = await supabase
          .from('ConversationTurn')
          .select('id, attemptToken, status')
          .eq('id', turnId)
          .eq('spaceId', space.id)
          .eq('conversationId', conversationId)
          .maybeSingle();
        if (!turn || turn.status !== 'running' || !turn.attemptToken) {
          throw new Error('Running turn not found');
        }
        await requestConversationTurnCancellationV2(supabase, {
          turnId,
          spaceId: space.id,
          conversationId,
          attemptToken: turn.attemptToken,
        });
      } catch {
        return NextResponse.json({ error: 'Running turn not found' }, { status: 409 });
      }
      const accelerated = await requestChatStop(turnId);
      return NextResponse.json({ ok: true, durable: true, accelerated });
    }
  }

  // ── Broker surface ──────────────────────────────────────────────────────
  // Broker conversations live in the SEPARATE "BrokerConversation" table keyed
  // by brokerageId — not the realtor "Conversation" table — so the realtor
  // lookup above always misses them (a broker owner owns a personal space too,
  // which is why we can't 403 before getting here). Authenticate as a broker
  // exactly the way /api/ai/broker-task does (resolveBrokerContext →
  // getBrokerMemberContext) and confirm the conversation belongs to THEIR
  // brokerage before signalling, so a broker can stop their own broker turn
  // but not another brokerage's.
  const brokerCtx = await resolveBrokerContext();
  if (brokerCtx) {
    const { data: brokerConvo } = await supabase
      .from('BrokerConversation')
      .select('id')
      .eq('id', conversationId)
      .eq('brokerageId', brokerCtx.brokerage.id)
      .maybeSingle();
    if (brokerConvo) {
      // Broker chat has not migrated to ConversationTurn yet. The caller must
      // still provide a per-request turn id, so the best-effort Redis signal
      // cannot bleed into a later turn on the same conversation.
      const accelerated = await requestChatStop(turnId);
      return NextResponse.json({ ok: true, durable: false, accelerated });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
