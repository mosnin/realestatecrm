/**
 * POST /api/browser-control/headless/poll — the Modal headless worker's
 * heartbeat. Authed by AGENT_INTERNAL_SECRET (Bearer), NOT Clerk — same
 * fail-closed contract as app/api/internal/notify/route.ts and
 * app/api/internal/area-research/route.ts: this is called by the trusted
 * Modal runtime, not a logged-in browser tab. Missing secret -> 500
 * (misconfigured), wrong/absent bearer -> 401.
 *
 * Body is the SAME PollBody shape (lib/browser-control/protocol.ts) the
 * extension's /poll uses — one shared contract, two executors. Unlike the
 * extension path, `sessionId` is REQUIRED here: a headless worker has no
 * paired link to auto-resolve a session from, so it always passes back the
 * sessionId POST /headless/start gave it.
 *
 * Every read/write below is scoped by the spaceId the SESSION LOOKUP
 * (getHeadlessSessionById) returns — never a client-supplied spaceId
 * (PollBody doesn't even carry one; this comment documents the invariant
 * for anyone tempted to add one later).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { PollBody, BrowserActionResult } from '@/lib/browser-control/protocol';
import {
  getHeadlessSessionById,
  endHeadlessSession,
  pollHeadlessWorker,
} from '@/lib/browser-control/session';
import { isResearchWorkspaceEnabled, isResearchWorkspaceEnabledForSpace } from '@/lib/chippi/research-workspace-flag';

const MAX_POLL_BODY_BYTES = 1_000_000;

export async function POST(req: NextRequest) {
  const secret = process.env.CHIPPI_BROWSER_WORKER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_POLL_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
    }
    const text = await req.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_POLL_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
    }
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = PollBody.safeParse(body);
  if (!parsed.success || !parsed.data.sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }
  const { sessionId } = parsed.data;

  // The Modal worker is fenced by a per-session lease token. A late worker
  // stops before it can write a result, heartbeat, or receive another action.
  if (!parsed.data.workerLeaseToken) {
    return NextResponse.json({ action: null, stop: true });
  }
  // Heartbeat cadence guard, same shape as the extension poll route's
  // per-link limit — keyed by sessionId since a shared internal secret has
  // no per-worker identity to key on.
  const rl = await checkRateLimit(`browser-control:headless-poll:${sessionId}`, 120, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Polling too fast' }, { status: 429 });
  }

  const session = await getHeadlessSessionById(sessionId);
  if (!session || session.status !== 'active') {
    // Unknown, foreign-source, or already-ended session: tell the worker to
    // stop rather than silently doing nothing (mirrors the extension poll's
    // "reported session has already ended" handling).
    return NextResponse.json({ action: null, stop: true });
  }
  if (!isResearchWorkspaceEnabled() || !isResearchWorkspaceEnabledForSpace(session.spaceId)) {
    await endHeadlessSession(session.id, { spaceId: session.spaceId });
    return NextResponse.json({ action: null, stop: true });
  }

  // The user hit the in-page kill switch (oversight panel) — end the
  // session and tell the worker to stop immediately, skipping dispatch.
  if (parsed.data.killed) {
    await endHeadlessSession(session.id, { spaceId: session.spaceId });
    return NextResponse.json({ action: null, stop: true });
  }

  const resultCheck = parsed.data.completed
    ? BrowserActionResult.safeParse(parsed.data.completed.result)
    : null;
  const polled = await pollHeadlessWorker({
    sessionId: session.id,
    leaseToken: parsed.data.workerLeaseToken,
    completed: parsed.data.completed && resultCheck?.success
      ? { actionId: parsed.data.completed.actionId, result: resultCheck.data }
      : undefined,
    frame: parsed.data.frame,
  });
  return NextResponse.json({ ...polled, sessionId: session.id });
}
