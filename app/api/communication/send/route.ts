/**
 * POST /api/communication/send
 *
 * Send a message through whichever channel the realtor picked.
 * Body: { slug, channel, to, subject?, body, cc?, bcc? }
 *
 *   - channel: 'email' → routes through `sendEmailThrough` (Gmail in v1)
 *   - channel: 'whatsapp' → routes through `sendWhatsAppThrough`
 *
 * The send route is the only place where the channel value flips a
 * Composio tool. The compose modal in the UI is responsible for
 * collecting the right fields per channel; the validator
 * (`lib/communication/validation.ts`) rejects mismatched shapes before
 * we ever reach Composio.
 *
 * After a successful send, we invalidate the feed memo so the next GET
 * reflects the new state from the source of truth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import {
  findAnyCommunicationConnections,
  sendEmailThrough,
  sendWhatsAppThrough,
} from '@/lib/communication/connect';
import { invalidateCommunicationMemo } from '@/lib/communication/memo';
import {
  validateSendPayload,
  type SendBody,
} from '@/lib/communication/validation';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface SendRequestBody extends SendBody {
  slug?: unknown;
}

export async function POST(req: NextRequest) {
  let body: SendRequestBody;
  try {
    body = (await req.json()) as SendRequestBody;
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

  const validated = validateSendPayload(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const conns = await findAnyCommunicationConnections(space.id);

  if (validated.value.channel === 'email') {
    if (!conns.email) {
      return NextResponse.json(
        { error: 'Connect email first.' },
        { status: 400 },
      );
    }
    if (conns.email.toolkit === 'outlook') {
      // Outlook send isn't wired in v1 — the slug shape needs verification
      // against Composio's live catalog before we can ship it honestly.
      return NextResponse.json(
        { error: 'Outlook send isn’t supported yet. Connect Gmail to send.' },
        { status: 400 },
      );
    }
    const v = validated.value;
    const result = await sendEmailThrough({
      entityId: conns.email.userId,
      provider: 'gmail',
      to: v.to,
      cc: v.cc.length > 0 ? v.cc : undefined,
      bcc: v.bcc.length > 0 ? v.bcc : undefined,
      subject: v.subject,
      body: v.body,
    });
    if (!result.ok) {
      logger.warn('[api/communication/send] email send failed', {
        error: result.error,
      });
      return NextResponse.json(
        { error: 'That didn’t go through.' },
        { status: 502 },
      );
    }
    invalidateCommunicationMemo(space.id);
    return NextResponse.json({
      ok: true,
      channel: 'email',
      externalMessageId: result.externalMessageId,
    });
  }

  // whatsapp
  if (!conns.whatsapp) {
    return NextResponse.json(
      { error: 'Connect WhatsApp first.' },
      { status: 400 },
    );
  }
  const v = validated.value;
  const result = await sendWhatsAppThrough({
    entityId: conns.whatsapp.userId,
    to: v.to,
    body: v.body,
  });
  if (!result.ok) {
    logger.warn('[api/communication/send] whatsapp send failed', {
      error: result.error,
    });
    return NextResponse.json(
      { error: 'That didn’t go through.' },
      { status: 502 },
    );
  }
  invalidateCommunicationMemo(space.id);
  return NextResponse.json({
    ok: true,
    channel: 'whatsapp',
    externalMessageId: result.externalMessageId,
  });
}
