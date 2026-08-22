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
import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';


const STOP_TTL_SECONDS = 600;
/** Minimum interval between Redis polls from a streaming loop. */
export const STOP_POLL_INTERVAL_MS = 750;

function stopKey(turnId: string): string {
  return `chat-stop:turn:${turnId}`;
}

/** Accelerate a stop already durably recorded for this exact turn. */
export async function requestChatStop(turnId: string): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  try {
    await redis.set(stopKey(turnId), '1', { ex: STOP_TTL_SECONDS });
    return true;
  } catch {
    return false;
  }
}

/**
 * Drop any stop flag left over from an EARLIER turn on this conversation.
 *
 * The flag carries a 10-minute TTL and is only consumed by a polling stream,
 * so a Stop that lands after its turn already ended (the common case — the
 * user taps Stop as the last tokens arrive) stays in Redis and the NEXT turn
 * on that conversation consumes it and aborts itself. The realtor sees a
 * message go out and no answer come back.
 *
 * Called once per turn, before any path starts streaming, so a stop can only
 * ever apply to the turn it was requested during.
 */
export async function clearChatStop(turnId: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    await redis.del(stopKey(turnId));
  } catch {
    /* best-effort — a stale flag is a UX bug, not a correctness one */
  }
}

/**
 * True when a stop was requested for this conversation. Consumes the flag
 * so it can't bleed into the NEXT turn on the same conversation.
 */
export async function consumeChatStop(turnId: string): Promise<boolean> {
  try {
    if (isRedisConfigured()) {
      const val = await redis.getdel(stopKey(turnId));
      if (val !== null && val !== undefined) return true;
    }
    // PostgreSQL is authoritative. Redis is only a low-latency wake-up; a
    // restart, eviction, or cross-instance request must not erase Stop.
    const { data } = await unscoped(supabase
      .from('ConversationTurn'), 'post-fetch: caller verified parent scope before this id query')
      .select('id')
      .eq('id', turnId)
      .eq('status', 'running')
      .not('cancelRequestedAt', 'is', null)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * Throttled poller for streaming loops: cheap to call on every delta/event;
 * only touches Redis every STOP_POLL_INTERVAL_MS. Once it reports true it
 * stays true (the flag was consumed).
 */
export function createStopPoller(turnId: string): () => Promise<boolean> {
  let stopped = false;
  let lastCheck = 0;
  let inFlight: Promise<boolean> | null = null;
  return async () => {
    if (stopped) return true;
    const now = Date.now();
    if (now - lastCheck < STOP_POLL_INTERVAL_MS) return false;
    lastCheck = now;
    if (!inFlight) {
      inFlight = consumeChatStop(turnId).finally(() => {
        inFlight = null;
      });
      const result = await inFlight;
      if (result) stopped = true;
      return stopped;
    }
    return false;
  };
}
