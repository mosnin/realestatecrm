/**
 * Cross-request stop signal for in-flight chat turns.
 *
 * Since the disconnect-survival work, the server deliberately does NOT
 * abort a turn when the response stream is cancelled — a closed tab and a
 * lost connection must not kill the turn. That made the composer's Stop
 * button indistinguishable from a disconnect: it stopped the RENDERING but
 * the turn kept generating, spending, and persisting to history.
 *
 * This restores a real Stop: the client POSTs /api/ai/stop (which calls
 * requestChatStop) and the streaming paths poll shouldStopChatTurn at a
 * bounded cadence, aborting generation when the flag is set. The partial
 * text the user saw is persisted honestly — Stop means "stop generating",
 * not "pretend it never happened".
 *
 * Redis-backed (works across serverless instances); without Redis the
 * no-op proxy returns null and Stop degrades to client-only rendering
 * stop — the pre-existing behavior, never worse.
 */

import { redis, isRedisConfigured } from '@/lib/redis';

const STOP_TTL_SECONDS = 600;
/** Minimum interval between Redis polls from a streaming loop. */
export const STOP_POLL_INTERVAL_MS = 750;

function stopKey(conversationId: string): string {
  return `chat-stop:${conversationId}`;
}

/** Mark the active turn on this conversation as stop-requested. */
export async function requestChatStop(conversationId: string): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  try {
    await redis.set(stopKey(conversationId), '1', { ex: STOP_TTL_SECONDS });
    return true;
  } catch {
    return false;
  }
}

/**
 * True when a stop was requested for this conversation. Consumes the flag
 * so it can't bleed into the NEXT turn on the same conversation.
 */
export async function consumeChatStop(conversationId: string): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  try {
    const val = await redis.getdel(stopKey(conversationId));
    return val !== null && val !== undefined;
  } catch {
    return false;
  }
}

/**
 * Throttled poller for streaming loops: cheap to call on every delta/event;
 * only touches Redis every STOP_POLL_INTERVAL_MS. Once it reports true it
 * stays true (the flag was consumed).
 */
export function createStopPoller(conversationId: string): () => Promise<boolean> {
  let stopped = false;
  let lastCheck = 0;
  let inFlight: Promise<boolean> | null = null;
  return async () => {
    if (stopped) return true;
    const now = Date.now();
    if (now - lastCheck < STOP_POLL_INTERVAL_MS) return false;
    lastCheck = now;
    if (!inFlight) {
      inFlight = consumeChatStop(conversationId).finally(() => {
        inFlight = null;
      });
      const result = await inFlight;
      if (result) stopped = true;
      return stopped;
    }
    return false;
  };
}
