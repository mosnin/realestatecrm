/**
 * POST /api/sms/send
 *
 * Send an SMS through the workspace's Telnyx number.
 * Body: { slug, to, body, contactId? }
 *
 * `contactId` is optional — when provided, we audit the send against the
 * contact's `ContactActivity` row so the timeline picks it up. When the
 * realtor types a raw phone, we'll still try to match it back to a Contact
 * for the audit trail (same pattern as `lib/ai-tools/tools/send-sms.ts`).
 *
 * The send routes through `sendSmsThrough` → `sendSMS` (lib/sms.ts), which
 * already handles E.164 normalisation, premium-rate blocking, and credential
 * failures. Returns 502 on send failure so the surface can show a calm
 * error without revealing transport internals.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { findSmsConnection, sendSmsThrough } from '@/lib/sms/connect';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface SendBody {
  slug?: unknown;
  to?: unknown;
  body?: unknown;
  contactId?: unknown;
}

/** Loose E.164 plausibility check — same shape as the communication
 *  validator. Strict transport validation happens inside `sendSMS`. */
const PHONE_RE = /^\+?[1-9]\d{7,14}$/;
const MAX_BODY = 1600; // 10 segments — Telnyx caps individual messages

function parsePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\s\-()]/g, '').trim();
  if (!cleaned) return null;
  return cleaned;
}

export async function POST(req: NextRequest) {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const phone = parsePhone(body.to);
  if (!phone) {
    return NextResponse.json({ error: 'Add a phone number.' }, { status: 400 });
  }
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json(
      { error: 'That phone number does not look right.' },
      { status: 400 },
    );
  }

  const text = typeof body.body === 'string' ? body.body : '';
  if (text.trim().length === 0) {
    return NextResponse.json({ error: 'Write something to send.' }, { status: 400 });
  }
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: 'Message is too long.' }, { status: 400 });
  }

  const conn = await findSmsConnection(space.id);
  if (!conn) {
    return NextResponse.json(
      { error: 'SMS isn’t set up yet.' },
      { status: 400 },
    );
  }

  // Resolve a Contact for this send — explicit contactId wins, else match
  // against the workspace's Contacts by phone. ContactActivity.contactId is
  // NOT NULL, so we need one to audit the send. Sends to numbers without a
  // matching contact are rejected with a copy-ready message — the realtor
  // adds the person first, then sends.
  let resolvedContactId: string | null = null;
  if (typeof body.contactId === 'string' && body.contactId.trim()) {
    const { data: c } = await supabase
      .from('Contact')
      .select('id')
      .eq('id', body.contactId.trim())
      .eq('spaceId', space.id)
      .maybeSingle();
    if (c) resolvedContactId = (c as { id: string }).id;
  }
  if (!resolvedContactId) {
    const { data: c } = await supabase
      .from('Contact')
      .select('id')
      .eq('spaceId', space.id)
      .eq('phone', phone)
      .maybeSingle();
    if (c) resolvedContactId = (c as { id: string }).id;
  }
  if (!resolvedContactId) {
    return NextResponse.json(
      {
        error:
          'No contact has that phone yet. Add the person on the People page, then text them.',
      },
      { status: 400 },
    );
  }

  const result = await sendSmsThrough({ to: phone, body: text });
  if (!result.ok) {
    logger.warn('[api/sms/send] send failed', {
      spaceId: space.id,
      err: result.error ?? null,
    });
    return NextResponse.json(
      { error: 'That didn’t go through.' },
      { status: 502 },
    );
  }

  // Audit the send. We mirror the metadata shape the agent send + send_sms
  // tool already write so the list/thread routes pick it up uniformly.
  try {
    await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      contactId: resolvedContactId,
      type: 'note',
      content: `SMS: ${text.slice(0, 140)}${text.length > 140 ? '…' : ''}`,
      metadata: {
        channel: 'sms',
        via: 'communication_surface',
        body: text,
        to: phone,
        sentAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.warn('[api/sms/send] activity insert failed (non-fatal)', {}, err);
  }

  return NextResponse.json({
    ok: true,
    channel: 'sms',
    contactId: resolvedContactId,
  });
}
