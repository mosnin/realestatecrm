/**
 * GET /api/ai/broker-messages?conversationId= — messages for a broker Chippi
 * conversation.
 *
 * The broker analogue of `app/api/ai/messages/route.ts`. Gated on broker
 * access via `resolveBrokerContext()` (defense layer 2). The conversation is
 * verified to belong to the caller's brokerage BEFORE any message is returned —
 * a conversationId from another brokerage (or a realtor conversation, which
 * won't even exist in "BrokerConversation") gets a 404, never another
 * brokerage's history.
 *
 * Storage is structurally separate: messages come from "BrokerMessage", keyed
 * by brokerageId + conversationId. There is no path from here into the realtor
 * "Message" table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import { getAuthorizedBrokerConversation } from '@/lib/chat/broker-conversation-auth';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const MESSAGE_LIMIT = 50;

export async function GET(req: NextRequest) {
  try {
    const brokerCtx = await resolveBrokerContext();
    if (!brokerCtx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { allowed } = await checkRateLimit(`ai:broker-messages:${brokerCtx.brokerage.ownerId}`, 20, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: 'too many requests. try again shortly.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const conversationId = req.nextUrl.searchParams.get('conversationId');
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

    let authorized;
    try {
      authorized = await getAuthorizedBrokerConversation(conversationId, brokerCtx);
    } catch (err) {
      console.error('[broker-messages] Conversation authorization failed:', err);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
    if (!authorized || authorized.brokerCtx.brokerage.id !== brokerCtx.brokerage.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('BrokerMessage')
      .select('id, role, content, blocks, createdAt')
      .eq('conversationId', conversationId)
      // Defense-in-depth: BrokerMessage carries brokerageId too. Keep child
      // rows scoped to the verified brokerage, not just the conversation id.
      .eq('brokerageId', brokerCtx.brokerage.id)
      .order('createdAt', { ascending: true })
      .limit(MESSAGE_LIMIT);
    if (error) {
      console.error('[broker-messages] Message lookup failed:', error);
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error('[broker-messages] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
