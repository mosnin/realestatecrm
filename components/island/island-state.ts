/**
 * The Island — pure state derivation for the ambient work-session pill.
 *
 * Everything time- and status-dependent lives here as pure functions so the
 * behavior is testable without a DOM: given the WorkSession rows (initial
 * REST load + Supabase Realtime overlay, same feed the workspace strip uses),
 * what the user has dismissed, when terminal states were first observed, and
 * the current time, decide exactly what the pill shows.
 *
 * No React, no I/O — the component (`chippi-island.tsx`) owns those.
 */

import type { PlanStep, WorkSessionRow } from '@/lib/work-sessions/types';

/** WorkSession row as it actually arrives over REST/Realtime — the shared
 *  type omits timestamps, but the table has them and `select('*')` returns
 *  them. Optional here so a missing column degrades to "no elapsed time",
 *  never a crash. */
export interface IslandSessionRow extends WorkSessionRow {
  createdAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
}

const ACTIVE = new Set<IslandSessionRow['status']>([
  'planning',
  'awaiting_approval',
  'awaiting_input',
  'running',
]);
const ATTENTION = new Set<IslandSessionRow['status']>([
  'awaiting_approval',
  'awaiting_input',
]);

/** How long the success state lingers before the island retreats. */
export const SUCCESS_LINGER_MS = 6_000;

/** A failure discovered on page load (no live transition observed) still
 *  surfaces if it happened this recently — the realtor probably hasn't seen
 *  it yet. Older failures stay in the workspace strip only. */
export const FRESH_FAILURE_WINDOW_MS = 5 * 60_000;

export type IslandTone = 'working' | 'attention' | 'success' | 'failure';

export interface IslandDisplayState {
  mode: 'hidden' | 'active' | 'success' | 'failure';
  tone: IslandTone;
  session: IslandSessionRow | null;
  /** Compact one-liner rendered after "Chippi · ". */
  statusLine: string;
  /** Expanded-card detail: completion summary or failure error. */
  detailLine: string | null;
  plan: PlanStep[];
  doneCount: number;
  totalCount: number;
  /** Other active sessions beyond the primary one. */
  moreCount: number;
  /** Elapsed run time — live for active sessions, frozen for finished ones. */
  elapsedMs: number | null;
  /** When the success state should retreat (null = no auto-retreat). */
  expiresAtMs: number | null;
}

const HIDDEN: IslandDisplayState = {
  mode: 'hidden',
  tone: 'working',
  session: null,
  statusLine: '',
  detailLine: null,
  plan: [],
  doneCount: 0,
  totalCount: 0,
  moreCount: 0,
  elapsedMs: null,
  expiresAtMs: null,
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Attention states outrank plain work; newer sessions outrank older. */
const PRIORITY: Record<string, number> = {
  awaiting_input: 3,
  awaiting_approval: 2,
  running: 1,
  planning: 0,
};

/**
 * Dismissal semantics (dismissed = { sessionId: statusAtDismissal }):
 *  - Dismissing a finished session hides its terminal display for good.
 *  - Dismissing an active session hides it while it keeps working, but it
 *    resurfaces when something genuinely new happens: it starts needing the
 *    realtor (a different attention state) or it finishes.
 */
export function isSessionDismissed(
  dismissed: Record<string, string>,
  session: IslandSessionRow,
): boolean {
  const at = dismissed[session.id];
  if (!at) return false;
  const activeNow = ACTIVE.has(session.status);
  const activeThen = ACTIVE.has(at as IslandSessionRow['status']);
  if (activeThen !== activeNow) return false; // crossed the active/terminal line — resurface
  if (activeNow && ATTENTION.has(session.status) && at !== session.status) {
    return false; // newly needs the realtor — resurface
  }
  return true;
}

/**
 * Track when terminal states are first observed, so success can linger for a
 * fixed window and stale outcomes don't replay on every page load.
 *
 * Returns `seen` unchanged (same reference) when nothing new happened, so
 * callers can use it directly as React state without extra renders.
 *
 *  - active → completed/failed observed live: record `now`.
 *  - failed discovered cold (no previous status) but fresh (updatedAt within
 *    FRESH_FAILURE_WINDOW_MS): record `now` — an unseen failure is shown, not
 *    swallowed.
 *  - completed discovered cold: not recorded — no success ceremony for work
 *    that finished before the page existed (the strip still shows it).
 */
export function trackTerminalTransitions(
  seen: Record<string, number>,
  prevStatuses: Record<string, string>,
  sessions: IslandSessionRow[],
  now: number,
): Record<string, number> {
  let next: Record<string, number> | null = null;
  for (const s of sessions) {
    if (s.status !== 'completed' && s.status !== 'failed') continue;
    if (seen[s.id] !== undefined) continue;
    const prev = prevStatuses[s.id];
    const observedLive = prev !== undefined && ACTIVE.has(prev as IslandSessionRow['status']);
    const finishedAt = parseMs(s.updatedAt) ?? parseMs(s.completedAt);
    const freshFailure =
      prev === undefined &&
      s.status === 'failed' &&
      finishedAt !== null &&
      now - finishedAt <= FRESH_FAILURE_WINDOW_MS;
    if (observedLive || freshFailure) {
      next = next ?? { ...seen };
      next[s.id] = now;
    }
  }
  return next ?? seen;
}

function activeStatusLine(s: IslandSessionRow): string {
  switch (s.status) {
    case 'awaiting_input':
      return 'Has a question for you';
    case 'awaiting_approval':
      return 'Plan ready — waiting on you';
    case 'planning':
      return `Planning: ${s.goal}`;
    default: {
      const runningStep = s.plan.find((p) => p.status === 'running');
      return runningStep?.title ?? s.goal;
    }
  }
}

function elapsedFor(s: IslandSessionRow, now: number, frozen: boolean): number | null {
  const started = parseMs(s.createdAt);
  if (started === null) return null;
  const end = frozen ? (parseMs(s.completedAt) ?? parseMs(s.updatedAt) ?? now) : now;
  return Math.max(0, end - started);
}

/**
 * The reducer: sessions + dismissals + observed-terminal times + now → what
 * the island shows. Precedence: live work always wins; otherwise the most
 * recently finished outcome (success for SUCCESS_LINGER_MS, failure until
 * dismissed); otherwise hidden.
 */
export function deriveIslandState(inputs: {
  sessions: IslandSessionRow[];
  dismissed: Record<string, string>;
  terminalSeenAt: Record<string, number>;
  now: number;
}): IslandDisplayState {
  const { sessions, dismissed, terminalSeenAt, now } = inputs;

  const active = sessions
    .filter((s) => ACTIVE.has(s.status) && !isSessionDismissed(dismissed, s))
    .sort((a, b) => {
      const byPriority = (PRIORITY[b.status] ?? 0) - (PRIORITY[a.status] ?? 0);
      if (byPriority !== 0) return byPriority;
      return (parseMs(b.createdAt) ?? 0) - (parseMs(a.createdAt) ?? 0);
    });

  if (active.length > 0) {
    const primary = active[0];
    return {
      mode: 'active',
      tone: ATTENTION.has(primary.status) ? 'attention' : 'working',
      session: primary,
      statusLine: activeStatusLine(primary),
      detailLine: primary.status === 'awaiting_input' ? primary.question : null,
      plan: primary.plan,
      doneCount: primary.plan.filter((p) => p.status === 'done').length,
      totalCount: primary.plan.length,
      moreCount: active.length - 1,
      elapsedMs: elapsedFor(primary, now, false),
      expiresAtMs: null,
    };
  }

  // No live work — most recently observed outcome, if it should still show.
  const terminal = sessions
    .filter((s) => {
      const seenAt = terminalSeenAt[s.id];
      if (seenAt === undefined) return false;
      if (isSessionDismissed(dismissed, s)) return false;
      if (s.status === 'completed') return now - seenAt < SUCCESS_LINGER_MS;
      return s.status === 'failed'; // failures stay until dismissed — honesty over tidiness
    })
    .sort((a, b) => (terminalSeenAt[b.id] ?? 0) - (terminalSeenAt[a.id] ?? 0));

  const outcome = terminal[0];
  if (!outcome) return HIDDEN;

  if (outcome.status === 'completed') {
    return {
      mode: 'success',
      tone: 'success',
      session: outcome,
      statusLine: outcome.summary?.trim() || `Done — ${outcome.goal}`,
      detailLine: outcome.summary,
      plan: outcome.plan,
      doneCount: outcome.plan.filter((p) => p.status === 'done').length,
      totalCount: outcome.plan.length,
      moreCount: 0,
      elapsedMs: elapsedFor(outcome, now, true),
      expiresAtMs: (terminalSeenAt[outcome.id] ?? now) + SUCCESS_LINGER_MS,
    };
  }

  return {
    mode: 'failure',
    tone: 'failure',
    session: outcome,
    statusLine: `Couldn't finish — ${outcome.goal}`,
    detailLine: outcome.error,
    plan: outcome.plan,
    doneCount: outcome.plan.filter((p) => p.status === 'done').length,
    totalCount: outcome.plan.length,
    moreCount: 0,
    elapsedMs: elapsedFor(outcome, now, true),
    expiresAtMs: null,
  };
}

/** "45s", "3m 12s", "1h 04m" — compact, tabular-friendly. */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m ${String(totalSec % 60).padStart(2, '0')}s`;
  const hours = Math.floor(totalMin / 60);
  return `${hours}h ${String(totalMin % 60).padStart(2, '0')}m`;
}

/** Where "Jump in" lands: the session's chat surface. */
export function jumpInHref(slug: string, session: IslandSessionRow): string {
  const base = `/s/${slug}/chippi`;
  return session.conversationId
    ? `${base}?conversationId=${encodeURIComponent(session.conversationId)}`
    : base;
}
