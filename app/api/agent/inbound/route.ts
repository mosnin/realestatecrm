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

import { NextRequest, NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';
import { runWorkflowsForEvent } from '@/lib/workflows/executor';
import {
  isStopKeyword,
  isStartKeyword,
  suppressAddress,
  unsuppressAddress,
} from '@/lib/messaging/compliance';
import { recordInboundMessage } from '@/lib/inbox';
import { logger } from '@/lib/logger';
import { tenantTable } from '@/lib/tenant-db';

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
    .select('id, name, leadScore, phone, email')
    .eq('id', contactId)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const now = new Date().toISOString();

  // ── Opt-out / opt-in keywords (TCPA) ──────────────────────────────────
  // A consumer replying STOP has revoked consent, and honoring it is legally
  // mandatory and immediate. Handled BEFORE anything else in this route so an
  // opt-out can never be processed as a normal reply that triggers follow-up.
  // The reply is still recorded below — the record matters for the audit
  // trail — but the suppression is written first.
  {
    const c = contact as { phone?: string | null; email?: string | null };
    const address = channel === 'sms' ? c.phone : c.email;
    if (address) {
      if (isStopKeyword(content)) {
        const ok = await suppressAddress({
          spaceId,
          channel,
          address,
          reason: 'stop_keyword',
          sourceText: content.slice(0, 200),
          contactId,
        });
        // Report honestly: a failed suppression write must not look like a
        // successful opt-out, or we keep messaging someone who said stop.
        if (!ok) {
          console.error('[agent/inbound] STOP received but suppression write FAILED', { spaceId, contactId });
          return NextResponse.json(
            { error: 'Could not record the opt-out. Retry required.' },
            { status: 500 },
          );
        }
        await tenantTable(supabase, 'ContactActivity', { spaceId }).insert({
          id: crypto.randomUUID(),
          contactId,
          spaceId,
          type: 'note',
          content: `[Opt-out] Contact replied "${content.trim().slice(0, 40)}" via ${channel.toUpperCase()} — suppressed from further ${channel} messages.`,
          metadata: { source: 'inbound', channel, optOut: true },
        });
        return NextResponse.json({ ok: true, optedOut: true, replyGenerated: false });
      }
      if (isStartKeyword(content)) {
        await unsuppressAddress({ spaceId, channel, address });
        await tenantTable(supabase, 'ContactActivity', { spaceId }).insert({
          id: crypto.randomUUID(),
          contactId,
          spaceId,
          type: 'note',
          content: `[Opt-in] Contact replied "${content.trim().slice(0, 40)}" via ${channel.toUpperCase()} — messages re-enabled.`,
          metadata: { source: 'inbound', channel, optIn: true },
        });
        return NextResponse.json({ ok: true, optedIn: true, replyGenerated: false });
      }
    }
  }

  // Record as ContactActivity
  const { error: activityError } = await tenantTable(supabase, 'ContactActivity', { spaceId }).insert({
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

  // Also dispatch the inbound_message WORKFLOW trigger. Previously this event
  // only reached the agent runtime (above), never the workflow executor, so an
  // "when an inbound message arrives" workflow never ran. Runs post-response via
  // after(); the context carries the channel + message so a workflow scoped to a
  // channel can gate on it and a draft can reference the inbound text. The
  // contact is fetched here (not blocking the response) so a draft_message can
  // address the sender by name.
  after(async () => {
    try {
      const { data: contactRow } = await supabase
        .from('Contact')
        .select('id, name, email, phone')
        .eq('id', contactId)
        .eq('spaceId', spaceId)
        .maybeSingle();
      const contactCtx = contactRow ?? { id: contactId };
      await runWorkflowsForEvent({
        spaceId,
        triggerType: 'inbound_message',
        context: {
          event: { type: 'inbound_message', channel, message: content },
          contact: contactCtx,
          lead: contactCtx,
        },
        triggerEvent: { type: 'inbound_message', contactId, channel },
      });
    } catch (e) {
      logger.error('[agent/inbound] inbound_message workflow dispatch failed', { contactId, channel }, e);
    }
  });

  return NextResponse.json({ recorded: true, contactId, channel });
}
