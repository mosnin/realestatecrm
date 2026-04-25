/**
 * POST /api/agent/inbound
 *
 * Webhook called by SMS/email providers when a contact replies.
 * Records the inbound message as a ContactActivity and optionally
 * marks the source AgentDraft as having received a response.
 *
 * Secured with AGENT_INTERNAL_SECRET (not user auth — this is a webhook).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';

export async function POST(req: NextRequest) {
  if (!AGENT_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const auth = req.headers.get('authorization');
  if (!auth || auth !== `Bearer ${AGENT_INTERNAL_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
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
  await supabase.from('ContactActivity').insert({
    id: crypto.randomUUID(),
    contactId,
    spaceId,
    type: 'inbound_message',
    content: `[Inbound ${channel.toUpperCase()}] ${content.slice(0, 500)}`,
    metadata: {
      source: 'inbound',
      channel,
      draftId: draftId ?? null,
    },
  });

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

  // Push inbound_message trigger to Redis for next agent run
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    const trigger = JSON.stringify({
      event: 'inbound_message',
      contactId,
      spaceId,
      channel,
      queuedAt: now,
    });
    await fetch(`${kvUrl}/rpush/${encodeURIComponent(`agent:triggers:${spaceId}`)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([trigger]),
    }).catch(() => { /* non-critical */ });
  }

  return NextResponse.json({ recorded: true, contactId, channel });
}
