/**
 * POST /api/mail/send — send an email through the realtor's connected
 * provider via Composio. The realtor's address is the From; their domain
 * is the domain; replies route back to them.
 *
 * v1 cuts:
 *   - Gmail-only write. Outlook reads (list + per-message body) work today,
 *     but sending from Outlook is gated until we verify the Composio send
 *     slug shape against the realtor's actual connection. Better to refuse
 *     a send the realtor expects to succeed than to silently misdeliver.
 *   - Plain text body. Rich text is a follow-up — `is_html` is hard-coded
 *     off in `sendEmailThrough`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import {
  findEmailConnection,
  sendEmailThrough,
} from '@/lib/mail/mirror';
import {
  validateSendPayload,
  type SendMailBody,
} from '@/lib/mail/validation';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: SendMailBody;
  try {
    body = (await req.json()) as SendMailBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const validated = validateSendPayload(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const connection = await findEmailConnection(space.id);
  if (!connection) {
    return NextResponse.json(
      { error: 'Connect a mailbox first.' },
      { status: 400 },
    );
  }

  if (connection.toolkit !== 'gmail') {
    // v1: refuse rather than risk a slug-shape mismatch on Outlook send.
    // Surface this clearly so the realtor knows it's a temporary limit,
    // not a configuration problem on their side.
    return NextResponse.json(
      {
        error:
          'Sending from Outlook isn’t live yet — reading works. Open the email in Outlook to reply.',
      },
      { status: 400 },
    );
  }

  const v = validated.value;
  const result = await sendEmailThrough({
    entityId: connection.userId,
    provider: connection.toolkit,
    to: v.to,
    cc: v.cc,
    bcc: v.bcc,
    subject: v.subject,
    body: v.body,
  });

  if (!result.ok) {
    logger.warn('[api/mail/send] external send failed', {
      spaceId: space.id,
      provider: connection.toolkit,
      err: result.error ?? null,
    });
    return NextResponse.json(
      { error: 'Could not send. Try again in a moment.' },
      { status: 502 },
    );
  }

  logger.info('[api/mail/send] sent', {
    spaceId: space.id,
    provider: connection.toolkit,
    externalMessageId: result.externalMessageId,
  });

  return NextResponse.json({
    ok: true,
    provider: connection.toolkit,
    messageId: result.externalMessageId,
  });
}
