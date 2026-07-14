/**
 * POST /api/internal/notify — the Python agent runtime's door into web push.
 *
 * Background runs (swarms, delegated Modal work) finish inside Python, which
 * has no path to lib/push.ts — so a completed run used to write its result to
 * the DB and tell NOBODY. This route closes that gap: Modal POSTs here and we
 * fan the payload out to every push subscription for the space via
 * sendPushToSpace (which is itself a VAPID-gated, never-throwing no-op when
 * push is unconfigured).
 *
 * Authed by AGENT_INTERNAL_SECRET (Modal/Python runtime), not Clerk — same
 * contract as /api/internal/messages/send. Fail-closed: missing secret is a
 * 500, wrong bearer is a 401, and nothing downstream throws.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendPushToSpace } from '@/lib/push';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const MAX_TITLE = 200;
const MAX_BODY = 500;
const MAX_URL = 500;

export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { spaceId?: unknown; title?: unknown; body?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE) : '';
  const message = typeof body.body === 'string' ? body.body.trim().slice(0, MAX_BODY) : '';
  const url =
    typeof body.url === 'string' && body.url.trim().length > 0
      ? body.url.trim().slice(0, MAX_URL)
      : undefined;
  if (!spaceId || !title || !message) {
    return NextResponse.json(
      { error: 'spaceId, title, and body are required' },
      { status: 400 },
    );
  }

  // Runaway-loop guard: a looping agent or compromised secret must not be able
  // to spam a realtor's devices. Mirrors /api/internal/messages/send.
  const rl = await checkRateLimit(`notify:internal:${spaceId}`, 60, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many notifications this hour.' }, { status: 429 });
  }

  // sendPushToSpace never throws (VAPID-gated no-op when unconfigured), but
  // belt-and-suspenders: a notification failure must never surface as a 500
  // that the agent could mistake for "the run itself failed".
  let sent = 0;
  try {
    sent = await sendPushToSpace(spaceId, { title, body: message, url });
  } catch (err) {
    logger.error('[internal/notify] push dispatch threw', { spaceId }, err);
  }

  return NextResponse.json({ ok: true, sent });
}
