/**
 * POST /api/agent/inbound
 *
 * Internal webhook called by SMS/email provider when a contact replies.
 * Secured with AGENT_INTERNAL_SECRET header (not Clerk — provider webhooks
 * can't use Clerk auth).
 *
 * Body: { contactId, spaceId, channel, content, externalId? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';

export async function POST(req: NextRequest) {
  if (!AGENT_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${AGENT_INTERNAL_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { contactId?: string; spaceId?: string; channel?: string; content?: string; externalId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { contactId, spaceId, channel, content, externalId } = body;

  if (!contactId || !spaceId || !channel || !content) {
    return NextResponse.json({ error: 'contactId, spaceId, channel, and content are required' }, { status: 400 });
  }

  const validChannels = ['sms', 'email'];
  if (!validChannels.includes(channel)) {
    return NextResponse.json({ error: `channel must be one of ${validChannels.join(', ')}` }, { status: 400 });
  }

  // Validate contact exists in the given space
  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select('id, name, leadScore')
    .eq('id', contactId)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (contactError || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  // Simple intent detection
  const lower = content.toLowerCase();
  let intent: 'positive' | 'question' | 'objection' | 'other' = 'other';
  if (['yes', 'interested', 'love', 'perfect', 'when', 'how much', 'available', 'schedule', 'book', 'tour'].some(w => lower.includes(w))) {
    intent = 'positive';
  } else if (lower.includes('?') || ['what', 'why', 'how', 'where', 'tell me'].some(w => lower.includes(w))) {
    intent = 'question';
  } else if (['no', 'not interested', 'stop', 'unsubscribe', 'remove'].some(w => lower.includes(w))) {
    intent = 'objection';
  }

  const now = new Date().toISOString();

  // Log inbound message as ContactActivity
  const activityId = crypto.randomUUID();
  await supabase.from('ContactActivity').insert({
    id: activityId,
    contactId,
    spaceId,
    type: 'message',
    content: `[Inbound ${channel.toUpperCase()}] ${content.slice(0, 500)}`,
    metadata: { source: 'inbound', channel, intent, externalId: externalId ?? null },
  });

  // Update lastContactedAt
  const contactUpdate: Record<string, unknown> = { lastContactedAt: now, updatedAt: now };

  // Boost lead score for positive engagement
  let scoreBoost = 0;
  if (intent === 'positive' || intent === 'question') {
    const currentScore = contact.leadScore ?? 50;
    const newScore = Math.min(100, currentScore + 5);
    scoreBoost = newScore - currentScore;
    if (scoreBoost > 0) contactUpdate.leadScore = newScore;
  }

  await supabase.from('Contact').update(contactUpdate).eq('id', contactId).eq('spaceId', spaceId);

  // Push trigger to Redis (best-effort)
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    const trigger = JSON.stringify({
      event: 'inbound_message_received',
      contactId,
      channel,
      intent,
      spaceId,
      queuedAt: now,
    });
    const key = `agent:triggers:${spaceId}`;
    fetch(`${kvUrl}/rpush/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([trigger]),
    }).catch(() => {});
  }

  return NextResponse.json({ recorded: true, intent, scoreBoost, contactId });
}
