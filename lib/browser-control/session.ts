/**
 * Browser-control session + action-queue plumbing — the agent-facing contract
 * the AI tool track builds on (enqueueAction / awaitActionResult) plus the
 * session lifecycle the pairing + poll routes drive.
 *
 * Tenancy: every read/write here is scoped by spaceId (the .eq() IS the
 * boundary — CLAUDE.md). Callers MUST derive spaceId/userId from the
 * authenticated context, never from request body input.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { assertPublicHttpUrl } from '@/lib/browser-proxy';
import { ACTION_TTL_SECONDS, type BrowserActionInput, type BrowserActionResult, type LiveFrame } from './protocol';

export interface BrowserSessionRow {
  id: string;
  spaceId: string;
  userId: string;
  linkId: string;
  status: 'active' | 'ended';
  startedAt: string;
  endedAt: string | null;
  lastPolledAt?: string | null;
}

/** What GET /frame returns for a live session's latest pushed viewport frame. */
export interface LatestFrame {
  image: string;
  pageUrl?: string;
  pageTitle?: string;
  at: string;
}

/**
 * A session with no poll heartbeat in this long is treated as dead even
 * though its DB row still says `status: 'active'` — the extension went away
 * (crash, laptop closed, network drop) without a clean kill/revoke. Twice
 * the action TTL: generous enough that a normal ~1s poll cadence with one
 * slow round-trip never trips it, but bounded so a stuck session can't
 * report as "live" indefinitely.
 */
const STALE_AFTER_SECONDS = ACTION_TTL_SECONDS * 2;

function isSessionStale(row: { startedAt: string; lastPolledAt?: string | null }): boolean {
  const lastSeenMs = row.lastPolledAt ? new Date(row.lastPolledAt).getTime() : new Date(row.startedAt).getTime();
  if (!Number.isFinite(lastSeenMs)) return false;
  return Date.now() - lastSeenMs > STALE_AFTER_SECONDS * 1000;
}

interface BrowserActionRow {
  id: string;
  spaceId: string;
  sessionId: string;
  type: string;
  params: BrowserActionInput;
  status: 'queued' | 'running' | 'done' | 'error' | 'expired';
  result: BrowserActionResult | null;
  createdAt: string;
  dispatchedAt: string | null;
  completedAt: string | null;
}

const DEFAULT_AWAIT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 400;

// ── Session lifecycle ───────────────────────────────────────────────────────

/**
 * The user's currently active control session, if any (most recent wins).
 * A session whose extension hasn't polled in STALE_AFTER_SECONDS is lazily
 * ended here and reported as absent — the agent/UI must never report a dead
 * session as live just because no one has explicitly killed/revoked it yet
 * (honest UI, CLAUDE.md #5).
 */
export async function getActiveSession(
  spaceId: string,
  userId: string,
): Promise<BrowserSessionRow | null> {
  const { data, error } = await supabase
    .from('BrowserSession')
    .select('id, spaceId, userId, linkId, status, startedAt, endedAt, lastPolledAt')
    .eq('spaceId', spaceId)
    .eq('userId', userId)
    .eq('status', 'active')
    .order('startedAt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = (data as BrowserSessionRow) ?? null;
  if (!row) return null;

  if (isSessionStale(row)) {
    await endSession(row.id, { spaceId });
    return null;
  }
  return row;
}

/**
 * Start a fresh session for a paired link, ending any stale active session on
 * the SAME link first (covers extension reconnect after a crash/reload — a
 * link has at most one live session at a time).
 */
export async function startSession(opts: {
  spaceId: string;
  userId: string;
  linkId: string;
}): Promise<BrowserSessionRow> {
  await supabase
    .from('BrowserSession')
    .update({ status: 'ended', endedAt: new Date().toISOString() })
    .eq('spaceId', opts.spaceId)
    .eq('linkId', opts.linkId)
    .eq('status', 'active');

  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const { error } = await supabase.from('BrowserSession').insert({
    id,
    spaceId: opts.spaceId,
    userId: opts.userId,
    linkId: opts.linkId,
    status: 'active',
    startedAt,
  });
  if (error) throw error;

  return {
    id,
    spaceId: opts.spaceId,
    userId: opts.userId,
    linkId: opts.linkId,
    status: 'active',
    startedAt,
    endedAt: null,
  };
}

export async function endSession(sessionId: string, opts: { spaceId: string }): Promise<void> {
  const { error } = await supabase
    .from('BrowserSession')
    .update({ status: 'ended', endedAt: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('spaceId', opts.spaceId);
  if (error) throw error;
}

/** End every active session belonging to a link — called when a link is revoked. */
export async function endSessionsForLink(linkId: string, opts: { spaceId: string }): Promise<void> {
  const { error } = await supabase
    .from('BrowserSession')
    .update({ status: 'ended', endedAt: new Date().toISOString() })
    .eq('linkId', linkId)
    .eq('spaceId', opts.spaceId)
    .eq('status', 'active');
  if (error) throw error;
}

/**
 * Poll-path helper: the active session for THIS specific link, auto-starting
 * one on first contact. Distinct from getActiveSession (which is keyed by
 * user, for the agent's enqueue side) because a poll always comes from one
 * concrete device/link.
 */
export async function getOrStartSessionForLink(link: {
  id: string;
  spaceId: string;
  userId: string;
}): Promise<BrowserSessionRow> {
  const { data, error } = await supabase
    .from('BrowserSession')
    .select('id, spaceId, userId, linkId, status, startedAt, endedAt')
    .eq('spaceId', link.spaceId)
    .eq('linkId', link.id)
    .eq('status', 'active')
    .order('startedAt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as BrowserSessionRow;

  return startSession({ spaceId: link.spaceId, userId: link.userId, linkId: link.id });
}

/**
 * Look up a specific session scoped to a link, WITHOUT auto-starting one.
 * Used by /poll to honor an explicit stop: if the extension reports a
 * sessionId that has since been ended (by revocation or an explicit stop),
 * we must say so rather than silently spinning up a new session.
 */
export async function findLinkSession(
  sessionId: string,
  opts: { spaceId: string; linkId: string },
): Promise<BrowserSessionRow | null> {
  const { data, error } = await supabase
    .from('BrowserSession')
    .select('id, spaceId, userId, linkId, status, startedAt, endedAt')
    .eq('id', sessionId)
    .eq('spaceId', opts.spaceId)
    .eq('linkId', opts.linkId)
    .maybeSingle();
  if (error) throw error;
  return (data as BrowserSessionRow) ?? null;
}

// ── Screencast frame + liveness heartbeat ───────────────────────────────────

/**
 * Called once per /poll round-trip for a session: records that the
 * extension is still alive (feeds isSessionStale / getActiveSession) and, if
 * the extension piggy-backed a viewport frame this round, OVERWRITES the
 * session's latest frame — this is a live feed, not an accumulating log, so
 * only the most recent frame is ever kept.
 */
export async function recordPollHeartbeat(
  sessionId: string,
  opts: { spaceId: string },
  frame?: LiveFrame,
): Promise<void> {
  const update: Record<string, unknown> = { lastPolledAt: new Date().toISOString() };
  if (frame) {
    update.lastFrame = frame;
    update.lastFrameAt = new Date().toISOString();
  }
  const { error } = await supabase
    .from('BrowserSession')
    .update(update)
    .eq('id', sessionId)
    .eq('spaceId', opts.spaceId);
  if (error) throw error;
}

/**
 * The caller's active session's latest pushed viewport frame, or null when
 * there's no active session or the extension hasn't pushed one yet — honest
 * (CLAUDE.md #5): GET /frame must never fabricate a frame. Routes through
 * getActiveSession so a stale session (no heartbeat) is treated as absent
 * here too, not just for the settings-page "connected" indicator.
 */
export async function getLatestFrame(spaceId: string, userId: string): Promise<LatestFrame | null> {
  const session = await getActiveSession(spaceId, userId);
  if (!session) return null;

  const { data, error } = await supabase
    .from('BrowserSession')
    .select('lastFrame, lastFrameAt')
    .eq('id', session.id)
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (error) throw error;

  const row = data as { lastFrame: LiveFrame | null; lastFrameAt: string | null } | null;
  if (!row?.lastFrame || !row.lastFrameAt) return null;

  return {
    image: row.lastFrame.image,
    pageUrl: row.lastFrame.pageUrl,
    pageTitle: row.lastFrame.pageTitle,
    at: row.lastFrameAt,
  };
}

// ── Action queue (agent-facing) ─────────────────────────────────────────────

/**
 * Enqueue an action for the caller's active session. Returns `{ error:
 * 'no_session' }` when the realtor has no paired extension currently
 * connected — the chat agent surfaces this as "browser control isn't
 * connected right now" (honest UI: never pretend the action ran).
 */
export async function enqueueAction(opts: {
  spaceId: string;
  userId: string;
  input: BrowserActionInput;
}): Promise<{ actionId: string } | { error: string }> {
  const session = await getActiveSession(opts.spaceId, opts.userId);
  if (!session) return { error: 'no_session' };

  if (opts.input.type === 'navigate') {
    try {
      await assertPublicHttpUrl(opts.input.url);
    } catch {
      return { error: 'blocked_url' };
    }
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from('BrowserAction').insert({
    id,
    spaceId: opts.spaceId,
    sessionId: session.id,
    type: opts.input.type,
    params: opts.input,
    status: 'queued',
  });
  if (error) return { error: 'insert_failed' };

  return { actionId: id };
}

/**
 * Poll `BrowserAction.status` for `actionId` (spaceId-scoped) until it
 * reaches a terminal state or `timeoutMs` elapses. Returns the extension's
 * posted result, a synthesized result for `expired`, or `null` on timeout
 * (the caller — the AI tool — treats null as "still running, ask again" or
 * surfaces a timeout, but must NEVER fabricate success).
 */
export async function awaitActionResult(
  actionId: string,
  opts: { spaceId: string; timeoutMs?: number; pollIntervalMs?: number },
): Promise<BrowserActionResult | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_AWAIT_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const { data, error } = await supabase
      .from('BrowserAction')
      .select('status, result')
      .eq('id', actionId)
      .eq('spaceId', opts.spaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as { status: BrowserActionRow['status']; result: BrowserActionResult | null };
    if (row.status === 'done' || row.status === 'error') {
      return row.result ?? { ok: row.status === 'done', error: row.status === 'error' ? 'No result was recorded.' : undefined };
    }
    if (row.status === 'expired') {
      return { ok: false, error: 'The extension did not pick up this action in time.' };
    }

    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(0, deadline - Date.now()))));
  }
}

// ── Action queue (extension-facing, used by /poll) ──────────────────────────

/**
 * Mark any queued action older than ACTION_TTL_SECONDS for this session as
 * expired, so a stale queue entry (extension was closed, browser slept)
 * doesn't sit forever and doesn't get dispatched after the agent has moved
 * on.
 */
export async function expireStaleQueuedActions(sessionId: string, opts: { spaceId: string }): Promise<void> {
  const cutoff = new Date(Date.now() - ACTION_TTL_SECONDS * 1000).toISOString();
  const { error } = await supabase
    .from('BrowserAction')
    .update({ status: 'expired', completedAt: new Date().toISOString() })
    .eq('sessionId', sessionId)
    .eq('spaceId', opts.spaceId)
    .eq('status', 'queued')
    .lt('createdAt', cutoff);
  if (error) throw error;
}

/** Next queued action for a session, FIFO by createdAt, marked running + dispatched. */
export async function dispatchNextAction(
  sessionId: string,
  opts: { spaceId: string },
): Promise<{ id: string; sessionId: string; input: BrowserActionInput } | null> {
  const { data, error } = await supabase
    .from('BrowserAction')
    .select('id, sessionId, type, params')
    .eq('sessionId', sessionId)
    .eq('spaceId', opts.spaceId)
    .eq('status', 'queued')
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as { id: string; sessionId: string; type: string; params: BrowserActionInput };
  const { error: updateErr } = await supabase
    .from('BrowserAction')
    .update({ status: 'running', dispatchedAt: new Date().toISOString() })
    .eq('id', row.id)
    .eq('spaceId', opts.spaceId)
    .eq('status', 'queued'); // only claim it if still queued (guards a racing second poll)
  if (updateErr) throw updateErr;

  return { id: row.id, sessionId: row.sessionId, input: row.params };
}

/**
 * Record the result the extension posted for an action it just finished.
 * Verifies the action belongs to the calling link's own session before
 * writing — a link can only complete actions dispatched to ITS session.
 * Silently ignores a mismatched/foreign actionId rather than erroring, so a
 * stale/duplicate report from a slow extension can't 500 the heartbeat.
 */
export async function recordActionResult(
  actionId: string,
  opts: { spaceId: string; linkId: string },
  result: BrowserActionResult,
): Promise<void> {
  const { data: action, error } = await supabase
    .from('BrowserAction')
    .select('id, sessionId')
    .eq('id', actionId)
    .eq('spaceId', opts.spaceId)
    .maybeSingle();
  if (error) throw error;
  if (!action) return;

  const row = action as { id: string; sessionId: string };
  const session = await findLinkSession(row.sessionId, { spaceId: opts.spaceId, linkId: opts.linkId });
  if (!session) return; // action's session doesn't belong to this link — ignore

  const { error: updateErr } = await supabase
    .from('BrowserAction')
    .update({
      status: result.ok ? 'done' : 'error',
      result,
      completedAt: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('spaceId', opts.spaceId);
  if (updateErr) throw updateErr;
}
