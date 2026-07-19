/**
 * POST /api/browser-control/poll — the extension's heartbeat. Bearer-authed
 * (verifyExtToken), NOT Clerk — this is called by the extension's background
 * worker, not a logged-in browser tab. In one round-trip: records the result
 * of the action the extension just finished (if any), resolves/attaches this
 * link's control session, and returns the next queued action (or null).
 *
 * `stop: true` tells the extension to tear down its cursor overlay and stop
 * polling this session — either the session was explicitly ended (the
 * realtor's kill switch / a link revoke ended it) while the extension still
 * reports its old sessionId, or the caller announced a foreign sessionId. A
 * fully revoked link fails auth earlier and gets a 401 instead — that's the
 * "unpair me" signal; `stop` is the softer "this run is over, but you're
 * still paired" signal.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { PollBody, BrowserActionResult } from '@/lib/browser-control/protocol';
import { verifyExtToken } from '@/lib/browser-control/auth';
import {
  getOrStartSessionForLink,
  findLinkSession,
  expireStaleQueuedActions,
  dispatchNextAction,
  recordActionResult,
} from '@/lib/browser-control/session';

export async function POST(req: NextRequest) {
  const auth = await verifyExtToken(req.headers.get('authorization'));
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { link } = auth;

  // Heartbeat cadence guard — a runaway/misbehaving extension polling in a
  // tight loop shouldn't be able to hammer the DB. Generous enough for normal
  // ~1s polling (well under 120/min).
  const { allowed } = await checkRateLimit(`browser-control:poll:${link.id}`, 120, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Polling too fast' }, { status: 429 });
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = PollBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid poll body' }, { status: 400 });
  }

  if (parsed.data.completed) {
    const resultCheck = BrowserActionResult.safeParse(parsed.data.completed.result);
    if (resultCheck.success) {
      await recordActionResult(
        parsed.data.completed.actionId,
        { spaceId: link.spaceId, linkId: link.id },
        resultCheck.data,
      );
    }
    // A malformed result is silently dropped rather than failing the whole
    // heartbeat — the action simply stays queued/running and will expire via
    // ACTION_TTL_SECONDS rather than the extension getting stuck retrying.
  }

  let session;
  if (parsed.data.sessionId) {
    const found = await findLinkSession(parsed.data.sessionId, { spaceId: link.spaceId, linkId: link.id });
    if (found && found.status === 'ended') {
      return NextResponse.json({ action: null, stop: true });
    }
    session = found && found.status === 'active' ? found : await getOrStartSessionForLink(link);
  } else {
    session = await getOrStartSessionForLink(link);
  }

  await expireStaleQueuedActions(session.id, { spaceId: link.spaceId });
  const action = await dispatchNextAction(session.id, { spaceId: link.spaceId });

  return NextResponse.json({ action, stop: false, sessionId: session.id });
}
