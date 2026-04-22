/**
 * Redis-backed store for paused turns waiting on user approval.
 *
 * When `runTurn` returns `reason: 'paused'`, the caller stashes the
 * PendingApprovalState here keyed by requestId. The approve endpoint
 * retrieves and deletes it atomically — a pending request is approved or
 * denied exactly once, never replayed.
 *
 * Redis was already chosen for rate limits + Stripe dedup; reusing it here
 * is consistent. If Redis env isn't configured the lib/redis proxy returns
 * no-ops, which means pending approvals effectively don't persist and the
 * user sees a "expired" error on approve — the failure mode is graceful.
 */

import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import type { PendingApprovalState } from './loop';

/**
 * TTL for a pending approval. If the user wanders off, the turn quietly
 * expires rather than hanging forever. 15 minutes is plenty of time for a
 * realistic "let me look at this prompt before clicking Approve" pause.
 */
const PENDING_TTL_SECONDS = 15 * 60;

/**
 * A pending approval as stored on disk. In addition to the loop's
 * `PendingApprovalState` we capture routing context the approve endpoint
 * needs to rebuild a fresh turn: which user, which space, which
 * conversation. Kept tightly scoped so the wire payload stays small.
 */
export interface StoredPendingApproval {
  state: PendingApprovalState;
  /** Clerk userId so only the originator can approve. */
  userId: string;
  /** Workspace slug — fed into resolveToolContext on resume. */
  spaceSlug: string;
  /** Conversation the turn belongs to; the resumer saves its continuation here. */
  conversationId: string;
  /** ISO timestamp; used to surface "this request is old" affordances in the UI. */
  createdAt: string;
}

function keyFor(requestId: string): string {
  return `agent-task:pending:${requestId}`;
}

/**
 * Persist a pending approval. Silently degrades to a no-op when Redis isn't
 * configured — the loop already emitted the `permission_required` event,
 * the route handler logs the miss, and the approve endpoint will return 410
 * when it can't find the state.
 */
export async function savePendingApproval(record: StoredPendingApproval): Promise<void> {
  try {
    await redis.set(keyFor(record.state.requestId), record, { ex: PENDING_TTL_SECONDS });
  } catch (err) {
    logger.error(
      '[agent-task.pending] save failed',
      { requestId: record.state.requestId, tool: record.state.pending.name },
      err,
    );
  }
}

/**
 * Atomic fetch-and-delete. The approve endpoint gets ONE shot at the record:
 * - If it's present, we hand it over and delete it so a double-click doesn't
 *   replay the pending turn.
 * - If it's absent (expired or already consumed), the caller returns 410.
 *
 * Uses Upstash's atomic `getdel` command (single round-trip, no race window
 * between get and delete). Falls back to get+del if the Redis proxy is a
 * no-op (env vars not set in dev) — the proxy's get returns null, so we
 * never reach the delete.
 */
export async function consumePendingApproval(
  requestId: string,
): Promise<StoredPendingApproval | null> {
  try {
    const key = keyFor(requestId);
    // @upstash/redis ^1.20 exposes `getdel`; we runtime-guard it so a
    // downgrade to an older version still returns something sensible.
    const rAny = redis as unknown as {
      getdel?: (k: string) => Promise<unknown>;
      get: (k: string) => Promise<unknown>;
      del: (k: string) => Promise<unknown>;
    };
    if (typeof rAny.getdel === 'function') {
      const raw = (await rAny.getdel(key)) as StoredPendingApproval | null;
      return raw ?? null;
    }
    // Fallback for older clients. Single-user approval UI makes the race
    // window benign; a shout in the logs warns us if we end up here.
    logger.warn('[agent-task.pending] atomic getdel unavailable — using get+del fallback');
    const raw = (await redis.get(key)) as StoredPendingApproval | null;
    if (!raw) return null;
    await redis.del(key);
    return raw;
  } catch (err) {
    logger.error('[agent-task.pending] consume failed', { requestId }, err);
    return null;
  }
}

/**
 * Peek at a pending approval WITHOUT removing it. Used by diagnostics +
 * potential Phase 4 "list my pending approvals on page load" UI.
 */
export async function peekPendingApproval(
  requestId: string,
): Promise<StoredPendingApproval | null> {
  try {
    const raw = (await redis.get(keyFor(requestId))) as StoredPendingApproval | null;
    return raw ?? null;
  } catch (err) {
    logger.error('[agent-task.pending] peek failed', { requestId }, err);
    return null;
  }
}
