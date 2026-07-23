/**
 * Cross-request turn presence — "is a turn running on this conversation?"
 *
 * The disconnect-survival contract keeps a turn generating server-side when
 * the browser leaves — including CLOSING the browser entirely. What was
 * missing is the way back in: a client that reopens later had no way to
 * know a turn was still in flight, so it rendered a dead transcript until
 * a manual reload found the persisted answer.
 *
 * This is the marker that closes the loop. The chat route marks a turn
 * started before it begins streaming; every server path clears it when the
 * turn's work (including persistence) finishes. GET /api/ai/turn-status
 * exposes it, and the workspace polls briefly on load when the transcript
 * ends in an unanswered user message — reopening the app mid-turn shows
 * "Chippi is still working" and lands the answer the moment it persists.
 *
 * Redis-backed with a TTL well past the longest bounded turn (Modal's 600s
 * ceiling), so a crashed function can never leave a conversation marked
 * busy forever. Without Redis it degrades to "unknown" (null) and the
 * client just doesn't poll — the pre-existing behavior, never worse.
 * Same shape and philosophy as lib/chat/stop-signal.ts.
 */

import { redis, isRedisConfigured } from '@/lib/redis';

/** Modal turns are bounded at 600s; direct/TS turns far lower. 15 minutes
 *  means even a function that died mid-turn clears within one coffee. */
const PRESENCE_TTL_SECONDS = 15 * 60;

function presenceKey(conversationId: string): string {
  return `chat-turn:${conversationId}`;
}

/** Mark a turn as running on this conversation. Fire-and-forget safe. */
export async function markTurnStarted(conversationId: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    await redis.set(presenceKey(conversationId), String(Date.now()), {
      ex: PRESENCE_TTL_SECONDS,
    });
  } catch {
    /* best-effort — presence is a UX signal, never load-bearing */
  }
}

/** Clear the marker once the turn's work (incl. persistence) is done. */
export async function markTurnEnded(conversationId: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    await redis.del(presenceKey(conversationId));
  } catch {
    /* best-effort */
  }
}

/**
 * Whether a turn is in flight for this conversation.
 *  - { inFlight: true, startedAt }  — a turn is running
 *  - { inFlight: false }            — nothing running
 *  - null                           — unknown (Redis not configured/reachable)
 */
export async function getTurnPresence(
  conversationId: string,
): Promise<{ inFlight: boolean; startedAt?: number } | null> {
  if (!isRedisConfigured()) return null;
  try {
    const val = await redis.get(presenceKey(conversationId));
    if (val === null || val === undefined) return { inFlight: false };
    const startedAt = Number(val);
    return { inFlight: true, ...(Number.isFinite(startedAt) ? { startedAt } : {}) };
  } catch {
    return null;
  }
}
