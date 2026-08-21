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
import { tenantTable } from '@/lib/tenant-db';
import { unscoped } from '@/lib/supabase-guard';
import { assertPublicHttpUrl } from '@/lib/browser-proxy';
import { ACTION_TTL_SECONDS, type BrowserActionInput, type BrowserActionResult, type LiveFrame } from './protocol';

/** Who is executing this session's actions — see 20260903000000_browser_control_headless.sql. */
export type BrowserSessionSource = 'extension' | 'headless';

export interface BrowserSessionRow {
  id: string;
  spaceId: string;
  userId: string;
  /** Null for headless sessions — they aren't tied to a paired device. */
  linkId: string | null;
  status: 'active' | 'ended';
  /** 'extension' (default, realtor's own logged-in browser) or 'headless'
   *  (cloud browser, no login). Defaults to 'extension' at the DB layer for
   *  every row this file's extension-facing functions create. */
  source: BrowserSessionSource;
  startedAt: string;
  endedAt: string | null;
  lastPolledAt?: string | null;
  /** Present only for a feature-on cloud research worker. Never exposed to clients. */
  workerLeaseExpiresAt?: string | null;
  workerStartedAt?: string | null;
  workerFinishedAt?: string | null;
  workerLastError?: string | null;
}

const SESSION_COLUMNS = 'id, spaceId, userId, linkId, status, source, startedAt, endedAt, lastPolledAt, workerLeaseExpiresAt, workerStartedAt, workerFinishedAt, workerLastError';

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
  const { data, error } = await tenantTable(supabase, 'BrowserSession', { spaceId })
    .select(SESSION_COLUMNS)
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

/** Exact personal-browser lookup. A cloud research session must never mask a
 * usable paired extension for login-required or explicit browser control. */
export async function getActiveExtensionSession(
  spaceId: string,
  userId: string,
): Promise<BrowserSessionRow | null> {
  const { data, error } = await tenantTable(supabase, 'BrowserSession', { spaceId })
    .select(SESSION_COLUMNS)
    .eq('userId', userId)
    .eq('source', 'extension')
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
  await tenantTable(supabase, 'BrowserSession', { spaceId: opts.spaceId })
    .update({ status: 'ended', endedAt: new Date().toISOString() })
    .eq('linkId', opts.linkId)
    .eq('status', 'active');

  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const { error } = await tenantTable(supabase, 'BrowserSession', { spaceId: opts.spaceId }).insert({
    id,
    spaceId: opts.spaceId,
    userId: opts.userId,
    linkId: opts.linkId,
    status: 'active',
    source: 'extension',
    startedAt,
  });
  if (error) throw error;

  return {
    id,
    spaceId: opts.spaceId,
    userId: opts.userId,
    linkId: opts.linkId,
    status: 'active',
    source: 'extension',
    startedAt,
    endedAt: null,
  };
}

export async function endSession(sessionId: string, opts: { spaceId: string }): Promise<void> {
  const { error } = await tenantTable(supabase, 'BrowserSession', { spaceId: opts.spaceId })
    .update({ status: 'ended', endedAt: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

/** End every active session belonging to a link — called when a link is revoked. */
export async function endSessionsForLink(linkId: string, opts: { spaceId: string }): Promise<void> {
  const { error } = await tenantTable(supabase, 'BrowserSession', { spaceId: opts.spaceId })
    .update({ status: 'ended', endedAt: new Date().toISOString() })
    .eq('linkId', linkId)
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
  const { data, error } = await tenantTable(supabase, 'BrowserSession', { spaceId: link.spaceId })
    .select(SESSION_COLUMNS)
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
  const { data, error } = await tenantTable(supabase, 'BrowserSession', { spaceId: opts.spaceId })
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('linkId', opts.linkId)
    .maybeSingle();
  if (error) throw error;
  return (data as BrowserSessionRow) ?? null;
}

// ── Headless (cloud) session lifecycle ──────────────────────────────────────

/**
 * Start (or reuse) a HEADLESS control session for a user: a cloud browser
 * with NO login, not tied to any BrowserLink (linkId is null — see
 * 20260903000000_browser_control_headless.sql). Called by POST
 * /api/browser-control/headless/start and by resolveBrowserRuntime
 * (lib/browser-control/index.ts) when routing picks headless.
 *
 * Reuses an existing active headless session for this user when one exists
 * and is still alive (same staleness rule as getActiveSession — a headless
 * worker that died without cleanly ending its session must not be reported
 * as live forever); otherwise closes the stale one out and starts fresh.
 */
export async function startHeadlessSession(opts: {
  spaceId: string;
  userId: string;
}): Promise<BrowserSessionRow> {
  const { data, error } = await tenantTable(supabase, 'BrowserSession', { spaceId: opts.spaceId })
    .select(SESSION_COLUMNS)
    .eq('userId', opts.userId)
    .eq('status', 'active')
    .eq('source', 'headless')
    .order('startedAt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const existing = (data as BrowserSessionRow) ?? null;

  if (existing) {
    if (!isSessionStale(existing)) return existing;
    await endSession(existing.id, { spaceId: opts.spaceId });
  }

  // The partial unique index introduced with the Research Workspace prevents
  // duplicate active cloud sessions.  Do the create-or-reuse decision in the
  // database so simultaneous tool calls cannot each launch a Chromium worker.
  const requestedId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const { data: sessionId, error: startError } = await supabase.rpc('start_headless_browser_session', {
    p_space_id: opts.spaceId,
    p_user_id: opts.userId,
    p_session_id: requestedId,
    p_started_at: startedAt,
  });
  if (startError) throw startError;
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new Error('Unable to start the cloud research session.');
  }

  const { data: created, error: lookupError } = await tenantTable(supabase, 'BrowserSession', { spaceId: opts.spaceId })
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('userId', opts.userId)
    .eq('source', 'headless')
    .eq('status', 'active')
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!created) {
    throw new Error('The cloud research session was not available after it started.');
  }
  return created as BrowserSessionRow;
}

/** End a headless session. Scoped by source='headless' too, so this can never
 *  accidentally tear down an extension-driven session by id collision. */
export async function endHeadlessSession(sessionId: string, opts: { spaceId: string }): Promise<void> {
  const { error } = await supabase.rpc('stop_headless_browser_session', {
    p_session_id: sessionId,
    p_space_id: opts.spaceId,
    p_reason: 'Cloud research session stopped.',
  });
  if (error) throw error;
}

/** Exact lookup for the cloud workspace Stop control. Unlike getActiveSession,
 * this is not masked when the user reconnects their personal extension. */
export async function getActiveHeadlessSession(
  spaceId: string,
  userId: string,
): Promise<BrowserSessionRow | null> {
  const { data, error } = await tenantTable(supabase, 'BrowserSession', { spaceId })
    .select(SESSION_COLUMNS)
    .eq('userId', userId)
    .eq('source', 'headless')
    .eq('status', 'active')
    .order('startedAt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as BrowserSessionRow) ?? null;
}

/** Latest exact cloud workspace row, including a terminal result, for the
 * Research panel's honest lifecycle state. */
export async function getLatestHeadlessSession(
  spaceId: string,
  userId: string,
): Promise<BrowserSessionRow | null> {
  const { data, error } = await tenantTable(supabase, 'BrowserSession', { spaceId })
    .select(SESSION_COLUMNS)
    .eq('userId', userId)
    .eq('source', 'headless')
    .order('startedAt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as BrowserSessionRow) ?? null;
}

export async function getLatestHeadlessFrame(spaceId: string, userId: string): Promise<{ sessionId: string; frame: LatestFrame } | null> {
  const session = await getActiveHeadlessSession(spaceId, userId);
  if (!session) return null;
  const { data, error } = await tenantTable(supabase, 'BrowserSession', { spaceId })
    .select('lastFrame, lastFrameAt')
    .eq('id', session.id)
    .eq('source', 'headless')
    .maybeSingle();
  if (error) throw error;
  const row = data as { lastFrame: LiveFrame | null; lastFrameAt: string | null } | null;
  if (!row?.lastFrame || !row.lastFrameAt) return null;
  return { sessionId: session.id, frame: { image: row.lastFrame.image, pageUrl: row.lastFrame.pageUrl, pageTitle: row.lastFrame.pageTitle, at: row.lastFrameAt } };
}

export async function getHeadlessSessionForUser(sessionId: string, opts: { spaceId: string; userId: string }): Promise<BrowserSessionRow | null> {
  const { data, error } = await tenantTable(supabase, 'BrowserSession', { spaceId: opts.spaceId })
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('userId', opts.userId)
    .eq('source', 'headless')
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return (data as BrowserSessionRow) ?? null;
}

/**
 * POST /headless/poll's session lookup. Unlike findLinkSession, there is no
 * paired-device auth to derive a scope from — the Modal worker authenticates
 * with AGENT_INTERNAL_SECRET (a shared bearer for the whole runtime, not a
 * per-session identity) and passes back the sessionId it was handed by
 * /headless/start. That sessionId (an unguessable UUID) IS the identity/
 * capability check here, the same way a bearer token is in verifyExtToken —
 * so this lookup is deliberately NOT spaceId-scoped (nothing to scope it BY
 * yet). Every subsequent read/write in the poll route MUST use the spaceId
 * THIS function returns, never a body-supplied one.
 */
export async function getHeadlessSessionById(sessionId: string): Promise<BrowserSessionRow | null> {
  const { data, error } = await unscoped(
    supabase.from('BrowserSession').select(SESSION_COLUMNS),
    'headless /poll session lookup — the sessionId is an unguessable capability token (minted by /headless/start), not user input; it IS the identity check, mirroring verifyExtToken\'s token-hash lookup',
  )
    .eq('id', sessionId)
    .eq('source', 'headless')
    .maybeSingle();
  if (error) throw error;
  return (data as BrowserSessionRow) ?? null;
}

/**
 * Atomically take the right to launch the one cloud worker for a headless
 * session. A caller that loses the claim must not start a second Chromium
 * process. The migration backs this with a fenced RPC rather than a racy
 * read-then-write sequence.
 */
export async function claimHeadlessWorkerLaunch(opts: {
  sessionId: string;
  leaseToken: string;
  leaseSeconds?: number;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_headless_browser_worker', {
    p_session_id: opts.sessionId,
    p_lease_token: opts.leaseToken,
    p_lease_seconds: opts.leaseSeconds ?? 30,
  });
  if (error) throw error;
  return data === true;
}

/** Renew a fenced lease; false means a stop, expiry, or newer worker won. */
export async function renewHeadlessWorkerLease(opts: {
  sessionId: string;
  leaseToken: string;
  leaseSeconds?: number;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('renew_headless_browser_worker_lease', {
    p_session_id: opts.sessionId,
    p_lease_token: opts.leaseToken,
    p_lease_seconds: opts.leaseSeconds ?? 30,
  });
  if (error) throw error;
  return data === true;
}

/** Best-effort terminal bookkeeping. A timeout/crash is recovered by expiry. */
export async function finishHeadlessWorker(opts: {
  sessionId: string;
  leaseToken: string;
  error?: string;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('finish_headless_browser_worker', {
    p_session_id: opts.sessionId,
    p_lease_token: opts.leaseToken,
    p_error: opts.error ?? null,
  });
  if (error) throw error;
  return data === true;
}

/** Atomic fenced poll: only the current lease can complete prior work, record
 * a frame, expire stale entries, and claim the next FIFO action. */
export async function pollHeadlessWorker(opts: {
  sessionId: string;
  leaseToken: string;
  completed?: { actionId: string; result: BrowserActionResult };
  frame?: LiveFrame;
}): Promise<{ stop: boolean; action: { id: string; sessionId: string; input: BrowserActionInput } | null }> {
  const { data, error } = await supabase.rpc('poll_headless_browser_worker', {
    p_session_id: opts.sessionId,
    p_lease_token: opts.leaseToken,
    p_completed_action_id: opts.completed?.actionId ?? null,
    p_completed_result: opts.completed?.result ?? null,
    p_frame: opts.frame ?? null,
  });
  if (error) throw error;
  const result = data as { stop?: unknown; action?: unknown } | null;
  if (!result || typeof result.stop !== 'boolean') throw new Error('Invalid cloud research worker poll response.');
  return {
    stop: result.stop,
    action: result.action && typeof result.action === 'object'
      ? result.action as { id: string; sessionId: string; input: BrowserActionInput }
      : null,
  };
}

/**
 * Record the result the headless worker posted for an action it just
 * finished. Verifies the action actually belongs to THIS headless session
 * before writing — mirrors recordActionResult's link check, just without a
 * link table in the middle. Silently ignores a mismatched/foreign actionId
 * (same tolerance as recordActionResult) rather than erroring the heartbeat.
 */
export async function recordHeadlessActionResult(
  actionId: string,
  opts: { spaceId: string; sessionId: string },
  result: BrowserActionResult,
): Promise<void> {
  const { data: action, error } = await tenantTable(supabase, 'BrowserAction', { spaceId: opts.spaceId })
    .select('id, sessionId')
    .eq('id', actionId)
    .maybeSingle();
  if (error) throw error;
  if (!action) return;

  const row = action as { id: string; sessionId: string };
  if (row.sessionId !== opts.sessionId) return; // belongs to a different session — ignore

  const { data: updated, error: updateErr } = await tenantTable(supabase, 'BrowserAction', { spaceId: opts.spaceId })
    .update({
      status: result.ok ? 'done' : 'error',
      result,
      completedAt: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'running')
    .select('id')
    .maybeSingle();
  if (updateErr) throw updateErr;
  if (!updated) return;
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
  const { error } = await tenantTable(supabase, 'BrowserSession', { spaceId: opts.spaceId })
    .update(update)
    .eq('id', sessionId)
    .eq('status', 'active');
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

  const { data, error } = await tenantTable(supabase, 'BrowserSession', { spaceId })
    .select('lastFrame, lastFrameAt')
    .eq('id', session.id)
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

  return enqueueActionForSession({ ...opts, sessionId: session.id });
}

/**
 * Queue work against the exact runtime session chosen by resolveBrowserRuntime.
 * This closes the resolve→enqueue race where an extension could reconnect
 * between calls and silently receive a cloud-research action (or vice versa).
 */
export async function enqueueActionForSession(opts: {
  spaceId: string;
  userId: string;
  sessionId: string;
  input: BrowserActionInput;
}): Promise<{ actionId: string } | { error: string }> {
  const { data: session, error: sessionError } = await tenantTable(supabase, 'BrowserSession', { spaceId: opts.spaceId })
    .select('id, source')
    .eq('id', opts.sessionId)
    .eq('userId', opts.userId)
    .eq('status', 'active')
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return { error: 'no_session' };
  const sessionRow = session as { id: string; source: BrowserSessionSource };
  // Durable defense-in-depth: tool callers are not the authority. The
  // anonymous headless queue never accepts typing, key presses, or blind
  // coordinate clicks; the worker applies the stricter inspected-link policy.
  if (sessionRow.source === 'headless' && (
    opts.input.type === 'type'
    || opts.input.type === 'press'
    || (opts.input.type === 'click' && opts.input.selector == null)
  )) return { error: 'headless_action_blocked' };

  if (opts.input.type === 'navigate') {
    try {
      await assertPublicHttpUrl(opts.input.url);
    } catch {
      return { error: 'blocked_url' };
    }
  }

  const id = crypto.randomUUID();
  const { error } = await tenantTable(supabase, 'BrowserAction', { spaceId: opts.spaceId }).insert({
    id,
    spaceId: opts.spaceId,
    sessionId: opts.sessionId,
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
    const { data, error } = await tenantTable(supabase, 'BrowserAction', { spaceId: opts.spaceId })
      .select('status, result')
      .eq('id', actionId)
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
  const { error } = await tenantTable(supabase, 'BrowserAction', { spaceId: opts.spaceId })
    .update({ status: 'expired', completedAt: new Date().toISOString() })
    .eq('sessionId', sessionId)
    .eq('status', 'queued')
    .lt('createdAt', cutoff);
  if (error) throw error;
}

/** Next queued action for a session, FIFO by createdAt, marked running + dispatched. */
export async function dispatchNextAction(
  sessionId: string,
  opts: { spaceId: string },
): Promise<{ id: string; sessionId: string; input: BrowserActionInput } | null> {
  const { data, error } = await tenantTable(supabase, 'BrowserAction', { spaceId: opts.spaceId })
    .select('id, sessionId, type, params')
    .eq('sessionId', sessionId)
    .eq('status', 'queued')
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as { id: string; sessionId: string; type: string; params: BrowserActionInput };
  const { data: claimed, error: updateErr } = await tenantTable(supabase, 'BrowserAction', { spaceId: opts.spaceId })
    .update({ status: 'running', dispatchedAt: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'queued') // only claim it if still queued (guards a racing second poll)
    .select('id')
    .maybeSingle();
  if (updateErr) throw updateErr;
  if (!claimed) return null;

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
  const { data: action, error } = await tenantTable(supabase, 'BrowserAction', { spaceId: opts.spaceId })
    .select('id, sessionId')
    .eq('id', actionId)
    .maybeSingle();
  if (error) throw error;
  if (!action) return;

  const row = action as { id: string; sessionId: string };
  const session = await findLinkSession(row.sessionId, { spaceId: opts.spaceId, linkId: opts.linkId });
  if (!session) return; // action's session doesn't belong to this link — ignore

  const { error: updateErr } = await tenantTable(supabase, 'BrowserAction', { spaceId: opts.spaceId })
    .update({
      status: result.ok ? 'done' : 'error',
      result,
      completedAt: new Date().toISOString(),
    })
    .eq('id', row.id);
  if (updateErr) throw updateErr;
}
