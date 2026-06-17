import 'server-only';
/**
 * Ably real-time pub/sub — the BACKEND half of the live activity feed.
 *
 * The feed loads its history from the IntegrationEvent table (the durable
 * record captured in lib/integrations/events.ts). Ably is the live overlay:
 * when a new Composio trigger delivery is captured, the Inngest handler
 * publishes a lightweight summary here so an already-open feed updates without
 * a poll. The DB is the source of truth; Ably is best-effort decoration.
 *
 * Server-side we publish via the Ably REST client. REST is stateless (no
 * persistent socket), which is the correct fit for Vercel serverless +
 * Inngest steps — there's no long-lived process to hold a Realtime
 * connection, and a fire-and-forget HTTP POST per event is exactly what we
 * want. The browser does the opposite: it subscribes via the Realtime SDK,
 * authenticating with a short-lived TokenRequest minted by
 * /api/ably/token (see createSpaceTokenRequest below).
 *
 * Channel model: ONE channel per space — `space:${spaceId}:events`. Every
 * member of a space subscribes to the same channel; the token capability
 * (below) scopes a client to `space:${spaceId}:*` so a client can never
 * subscribe to another space's events.
 *
 * Security: ABLY_API_KEY is SERVER-ONLY. It is never NEXT_PUBLIC and never
 * shipped to the browser — the browser only ever receives a capability-scoped,
 * time-limited TokenRequest. If the key is unset the whole module is inert:
 * publishing is a silent no-op and the token mint signals "unavailable" so the
 * route can return 503 and the client falls back to its DB-loaded feed.
 */

import { Rest, type TokenRequest } from 'ably';
import { logger } from '@/lib/logger';

// Memoized REST client. Built lazily on first use (not at import time) so the
// module imports cleanly in environments without the key — mirrors the lazy
// singletons in lib/redis.ts and lib/supabase.ts. `undefined` = not yet
// attempted; `null` = attempted and unavailable (no API key).
let _client: Rest | null | undefined;

function getClient(): Rest | null {
  if (_client !== undefined) return _client;
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    // Inert mode: no key configured (local dev / preview / CI). Cache null so
    // we don't re-check process.env on every publish.
    _client = null;
    return null;
  }
  _client = new Rest(apiKey);
  return _client;
}

/** The single channel a space's activity feed publishes to / subscribes from. */
function spaceChannel(spaceId: string): string {
  return `space:${spaceId}:events`;
}

/**
 * Publish one activity-feed event to a space's channel. BEST-EFFORT by
 * contract: this NEVER throws and NEVER blocks the caller's real work
 * (event capture + dispatch). On any failure — or when ABLY_API_KEY is
 * unset — it logs and returns. The live update is a nicety; the event is
 * already durably persisted in IntegrationEvent, so a dropped publish only
 * means the open feed waits for its next load instead of updating instantly.
 *
 * Message name is `integration_event`; data is the caller-supplied summary.
 */
export async function publishSpaceEvent(
  spaceId: string,
  event: Record<string, unknown>,
): Promise<void> {
  const client = getClient();
  if (!client) return; // No key → inert no-op.
  try {
    await client.channels.get(spaceChannel(spaceId)).publish('integration_event', event);
  } catch (err) {
    // Swallow + log. A real-time publish failure must never bubble into the
    // Inngest step and fail/retry the capture+dispatch pipeline.
    logger.warn('[realtime.ably] publish failed', { spaceId }, err);
  }
}

/**
 * Mint a capability-scoped, short-lived Ably TokenRequest for a browser
 * client to authenticate its Realtime subscription. The capability grants
 * `subscribe` ONLY, and ONLY on `space:${spaceId}:*` — so the token cannot be
 * used to publish, nor to read another space's channels. The clientId binds
 * the token to the authenticated user.
 *
 * Returns null when ABLY_API_KEY is unset (the caller maps this to a 503 so
 * the client knows real-time is unavailable and stays on its DB feed). Any
 * genuine signing error propagates — unlike publish, minting a token is the
 * route's whole job, so the route (not this fn) owns the error response.
 */
export async function createSpaceTokenRequest(
  spaceId: string,
  clientId: string,
): Promise<TokenRequest | null> {
  const client = getClient();
  if (!client) return null; // No key → caller returns 503 realtime-unavailable.
  return client.auth.createTokenRequest({
    clientId,
    capability: { [`space:${spaceId}:*`]: ['subscribe'] },
  });
}
