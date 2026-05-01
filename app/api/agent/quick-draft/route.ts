/**
 * POST /api/agent/quick-draft
 *
 * The /chippi home's inline draft engine. Phase 7 — no more chat teleport.
 * The realtor taps "Send a check-in" on the home, this composes a draft
 * inline and returns it; the UI shows it; the realtor taps Send and the
 * existing AgentDraft → PATCH approve → sendDraft pipeline fires the email
 * (or SMS, or note). One surface, one tap, done.
 *
 * Two modes on one route — keeps the chat-prefill teleporter dead and the
 * file count honest:
 *
 *   • mode: 'preview' (default) — Looks up the deal/person, fetches a tight
 *     slice of recent activity, calls OpenAI to compose subject+body. Pure
 *     read; no DB writes. 5s timeout. Returns { channel, subject?, body }.
 *
 *   • mode: 'send' — Caller provides the (possibly edited) subject + body
 *     they saw. Inserts an AgentDraft (status: pending), reuses the
 *     existing PATCH endpoint's logic via direct sendDraft + status flip.
 *     Returns the delivery result.
 *
 * Why both on one route: the alternative is two new files for one feature.
 * Jobs would say one panel, one button, one endpoint. The mode discriminates;
 * the contract is small.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { sendDraft, type DeliveryResult } from '@/lib/delivery';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';

const TIMEOUT_MS = 5_000;
const MODEL = 'gpt-4.1-mini';

type Intent = 'check-in' | 'log-call' | 'welcome' | 'reach-out';
type Context = 'deal' | 'person';
type Channel = 'email' | 'sms' | 'note';

interface PreviewBody {
  mode?: 'preview';
  context: Context;
  id: string;
  intent: Intent;
}
interface SendBody {
  mode: 'send';
  context: Context;
  id: string;
  intent: Intent;
  channel: Channel;
  subject?: string;
  body: string;
}
type Body = PreviewBody | SendBody;

const ALLOWED_INTENTS: Intent[] = ['check-in', 'log-call', 'welcome', 'reach-out'];
const ALLOWED_CONTEXTS: Context[] = ['deal', 'person'];
const ALLOWED_CHANNELS: Channel[] = ['email', 'sms', 'note'];

/**
 * Map an intent to a channel. Log-call is always a note (internal record);
 * everything else is email — that's the realtor's primary outbound rail and
 * the only one the chat tool fires today. The realtor can always Edit →
 * chat to switch channels.
 */
function channelForIntent(intent: Intent): Channel {
  return intent === 'log-call' ? 'note' : 'email';
}

const SYSTEM_PROMPT =
  "You are Chippi, an AI assistant for a real-estate CRM. Compose ONE short outbound message the realtor can send right now. " +
  "Voice: warm, direct, human. No marketing fluff. Skip stale email openers and corporate filler. No subject lines longer than 8 words. " +
  "Email body: 2-4 sentences, plain text, no markdown, no signature (the realtor's name is appended downstream). " +
  "Note body (when channel is 'note'): a single line summarizing what was discussed on a call — past tense, factual. " +
  "Output strict JSON with this shape and nothing else: {\"subject\": string|null, \"body\": string}. " +
  "Subject is a non-empty string for emails, null for notes.";

async function composeDraftWithOpenAI(args: {
  intent: Intent;
  channel: Channel;
  subjectLabel: string;
  recentActivity: string[];
  daysQuiet: number | null;
}): Promise<{ subject: string | null; body: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const userPayload = {
    intent: args.intent,
    channel: args.channel,
    subject: args.subjectLabel,
    daysSinceLastTouch: args.daysQuiet,
    recentActivity: args.recentActivity.slice(0, 6),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create(
      {
        model: MODEL,
        temperature: 0.4,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      },
      { signal: controller.signal },
    );
    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown };
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    if (!body) return null;
    const subject =
      typeof parsed.subject === 'string' && parsed.subject.trim().length > 0
        ? parsed.subject.trim()
        : null;
    return { subject, body };
  } catch (err) {
    logger.warn('[quick-draft] compose failed', { err: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || !ALLOWED_CONTEXTS.includes(body.context) || typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'context and id are required' }, { status: 400 });
  }
  if (!ALLOWED_INTENTS.includes(body.intent)) {
    return NextResponse.json({ error: 'unknown intent' }, { status: 400 });
  }

  const mode = body.mode ?? 'preview';

  // ── Resolve subject (deal title / contact name) + the contactId we'll
  //    eventually attach the draft to. Deals carry a primary contact in
  //    `contactId`; person-doorways are the contact themselves.
  let subjectLabel = body.context === 'deal' ? 'this deal' : 'them';
  let contactId: string | null = null;
  let dealId: string | null = null;
  let lastTouchAt: Date | null = null;

  if (body.context === 'deal') {
    const { data: deal } = await supabase
      .from('Deal')
      .select('id, title, contactId, updatedAt')
      .eq('id', body.id)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    subjectLabel = (deal as { title?: string }).title ?? 'this deal';
    dealId = (deal as { id: string }).id;
    contactId = ((deal as { contactId?: string | null }).contactId) ?? null;
    const upd = (deal as { updatedAt?: string }).updatedAt;
    if (upd) lastTouchAt = new Date(upd);
  } else {
    const { data: contact } = await supabase
      .from('Contact')
      .select('id, name, lastContactedAt')
      .eq('id', body.id)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    subjectLabel = (contact as { name?: string }).name ?? 'them';
    contactId = (contact as { id: string }).id;
    const last = (contact as { lastContactedAt?: string | null }).lastContactedAt;
    if (last) lastTouchAt = new Date(last);
  }

  // ── PREVIEW ──────────────────────────────────────────────────────────────
  if (mode === 'preview') {
    const channel = channelForIntent(body.intent);

    // Recent activity — short slice keeps the prompt tight. Filter by
    // contactId when we have one; otherwise no activity is fine.
    let recent: string[] = [];
    if (contactId) {
      const { data: acts } = await supabase
        .from('ContactActivity')
        .select('type, content, createdAt')
        .eq('contactId', contactId)
        .eq('spaceId', space.id)
        .order('createdAt', { ascending: false })
        .limit(6);
      recent = ((acts ?? []) as Array<{ type: string; content: string | null; createdAt: string }>)
        .map((a) => `${a.type}: ${(a.content ?? '').slice(0, 140)}`);
    }

    const daysQuiet = lastTouchAt
      ? Math.max(0, Math.floor((Date.now() - lastTouchAt.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    const composed = await composeDraftWithOpenAI({
      intent: body.intent,
      channel,
      subjectLabel,
      recentActivity: recent,
      daysQuiet,
    });

    if (!composed) {
      return NextResponse.json({ error: 'compose_failed' }, { status: 502 });
    }

    return NextResponse.json({
      channel,
      subject: channel === 'email' ? composed.subject ?? `Quick check-in` : null,
      body: composed.body,
      contactId,
      dealId,
      subjectLabel,
    });
  }

  // ── SEND ─────────────────────────────────────────────────────────────────
  if (mode === 'send') {
    // Narrow the discriminated union — `mode === 'send'` was checked via the
    // local `mode` variable, which TS can't trace back to `body`. Cast once
    // here and let the validations below ensure the runtime shape.
    const sendBody = body as SendBody;
    if (!ALLOWED_CHANNELS.includes(sendBody.channel)) {
      return NextResponse.json({ error: 'invalid channel' }, { status: 400 });
    }
    if (typeof sendBody.body !== 'string' || sendBody.body.trim().length === 0) {
      return NextResponse.json({ error: 'body required' }, { status: 400 });
    }
    if (sendBody.channel === 'email' && (typeof sendBody.subject !== 'string' || !sendBody.subject.trim())) {
      return NextResponse.json({ error: 'subject required for email' }, { status: 400 });
    }

    // Insert an AgentDraft so the artifact exists in the same audit trail
    // as agent-generated drafts. Approving it would normally go through
    // PATCH /api/agent/drafts/[id], but we can't HTTP-call ourselves cleanly
    // from server code — and the logic is small. We replicate it inline:
    // insert pending → sendDraft → flip status. Same audit shape.
    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabase
      .from('AgentDraft')
      .insert({
        spaceId: space.id,
        contactId,
        dealId,
        channel: sendBody.channel,
        subject: sendBody.channel === 'email' ? sendBody.subject!.trim() : null,
        content: sendBody.body.trim(),
        reasoning: `Quick draft from /chippi home (${sendBody.intent}).`,
        priority: 0,
        status: 'pending',
      })
      .select('id, channel, subject, content, contactId')
      .single();

    if (insertError || !inserted) {
      logger.error('[quick-draft] insert failed', { err: insertError?.message });
      return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 });
    }

    const draftId = (inserted as { id: string }).id;

    // Hydrate contact for delivery (needs email/phone).
    let contact = { name: subjectLabel, email: null as string | null, phone: null as string | null };
    if (contactId) {
      const { data: row } = await supabase
        .from('Contact')
        .select('name, email, phone')
        .eq('id', contactId)
        .eq('spaceId', space.id)
        .maybeSingle();
      if (row) contact = row as typeof contact;
    }

    const deliveryResult: DeliveryResult = await sendDraft(
      { channel: sendBody.channel, subject: sendBody.channel === 'email' ? sendBody.subject! : null, content: sendBody.body.trim() },
      contact,
      space.name,
    );

    const finalStatus = deliveryResult.sent ? 'sent' : 'approved';
    const { error: patchError } = await supabase
      .from('AgentDraft')
      .update({ status: finalStatus, updatedAt: now })
      .eq('id', draftId)
      .eq('spaceId', space.id);
    if (patchError) {
      logger.error('[quick-draft] status update failed', { err: patchError.message });
    }

    void audit({
      actorClerkId: userId,
      action: 'CREATE',
      resource: 'AgentDraft',
      resourceId: draftId,
      spaceId: space.id,
      metadata: {
        source: 'quick-draft',
        intent: sendBody.intent,
        contextKind: sendBody.context,
        channel: sendBody.channel,
        finalStatus,
        deliverySent: deliveryResult.sent,
        deliveryError: deliveryResult.error,
      },
    });

    return NextResponse.json({
      id: draftId,
      status: finalStatus,
      contactName: contact.name,
      deliveryResult,
    });
  }

  return NextResponse.json({ error: 'unknown mode' }, { status: 400 });
}
