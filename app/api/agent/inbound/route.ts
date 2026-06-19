/**
 * POST /api/agent/inbound
 *
 * Webhook called by SMS/email providers when a contact replies.
 * Records the inbound message as a ContactActivity and optionally
 * marks the source AgentDraft as having received a response.
 *
 * Dual-write (Phase 3): in addition to the ContactActivity above, this also
 * records the reply on the contact's threaded inbox via recordInboundMessage,
 * so internal callers and the Composio webhook capture path share ONE
 * message-write path. The ContactActivity + inbound-trigger behavior is
 * unchanged; the inbox write is best-effort and never fails the request.
 *
 * Secured with AGENT_INTERNAL_SECRET (not user auth — this is a webhook).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';
import { recordInboundMessage } from '@/lib/inbox';
import { logger } from '@/lib/logger';

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';

export async function POST(req: NextRequest) {
  if (!AGENT_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const auth = req.headers.get('authorization');
  if (!auth || auth !== `Bearer ${AGENT_INTERNAL_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { contactId: string; spaceId: string; channel: 'sms' | 'email'; content: string; draftId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { contactId, spaceId, channel, content, draftId } = body as {
    contactId: string;
    spaceId: string;
    channel: 'sms' | 'email';
    content: string;
    draftId?: string;
  };

  if (!contactId || !spaceId || !channel || !content) {
    return NextResponse.json({ error: 'Missing required fields: contactId, spaceId, channel, content' }, { status: 400 });
  }
  if (typeof content !== 'string' || content.length > 5000) {
    return NextResponse.json({ error: 'content must be 5000 characters or fewer' }, { status: 400 });
  }

  const validChannels = ['sms', 'email'];
  if (!validChannels.includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }

  // Validate contact belongs to the stated space
  const { data: contact } = await supabase
    .from('Contact')
    .select('id, name, leadScore')
    .eq('id', contactId)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Record as ContactActivity
  const { error: activityError } = await supabase.from('ContactActivity').insert({
    id: crypto.randomUUID(),
    contactId,
    spaceId,
    type: 'note',
    content: `[Inbound ${channel.toUpperCase()}] ${content.slice(0, 500)}`,
    metadata: {
      source: 'inbound',
      channel,
      draftId: draftId ?? null,
    },
  });
  if (activityError) {
    console.error('[agent/inbound] ContactActivity insert failed', activityError);
    return NextResponse.json({ error: 'Failed to record message' }, { status: 500 });
  }

  // Dual-write the reply onto the contact's threaded inbox so the inbox UI and
  // the Composio capture path share one message-write path. Best-effort: a
  // thread-write hiccup must not fail an inbound webhook whose ContactActivity
  // already landed. recordInbound is idempotent when an externalId is present;
  // this caller has no provider message id, so redelivery protection here rests
  // on the upstream caller (the agent tool is @idempotent_tool).
  try {
    await recordInboundMessage({
      spaceId,
      contactId,
      channel,
      body: content,
      metadata: { source: 'agent_inbound', draftId: draftId ?? null },
    });
  } catch (e) {
    logger.error('[agent/inbound] inbox record failed (non-fatal)', { contactId, channel }, e);
  }

  // Update lastContactedAt
  await supabase
    .from('Contact')
    .update({ lastContactedAt: now, updatedAt: now })
    .eq('id', contactId)
    .eq('spaceId', spaceId);

  // Mark draft as responded
  if (draftId) {
    await supabase
      .from('AgentDraft')
      .update({ outcome: 'responded', outcomeDetectedAt: now })
      .eq('id', draftId)
      .eq('spaceId', spaceId);
  }

  // Fire the inbound_message trigger through the helper so it gets rate-
  // limited + (if enabled in AGENT_IMMEDIATE_EVENTS) calls the Modal webhook
  // immediately rather than waiting for the next 4-hour sweep. This is what
  // closes lead-response latency from "0-4hr" to "~30s," which is the
  // single largest conversion lever per the industry data on
  // speed-to-lead-response.
  //
  // Known limitation: the dedupe window (default 120s) means rapid follow-up
  // messages from the same contact share one immediate-fire. The agent's
  // pending Modal run sees a single queued trigger; messages within the
  // dedupe window currently miss the queue too. Acceptable for v1 — real
  // conversations have gaps of minutes, not seconds. If this becomes a
  // real problem in production, the fix is to make the dedupe window
  // event-aware (short for inbound_message, default for everything else).
  try {
    await fireAgentTrigger({
      spaceId,
      event: 'inbound_message',
      contactId,
    });
  } catch (e) {
    console.error('[agent/inbound] agent trigger failed (non-fatal):', e);
  }

  return NextResponse.json({ recorded: true, contactId, channel });
}
