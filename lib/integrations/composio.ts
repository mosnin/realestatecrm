/**
 * Composio SDK wrapper. Single instance, env-gated, lazy-initialized.
 *
 * Why a wrapper, not direct SDK usage in routes: Composio is a vendor we
 * want to be able to swap. Every Composio touch goes through this file —
 * if we ever need to move (cost, reliability, feature gap), one file
 * changes and the rest of the codebase doesn't notice. Same invariant
 * we hold for the OpenAI Agents SDK behind `lib/ai-tools/sdk-bridge.ts`.
 *
 * Config:
 *   - COMPOSIO_API_KEY (required) — server-side only
 *   - COMPOSIO_REDIRECT_URL (optional) — where Composio sends the user
 *     after OAuth. Defaults to `${NEXT_PUBLIC_APP_URL}/integrations/callback`.
 */

import { Composio, type ConnectionRequest } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { logger } from '@/lib/logger';

let _client: Composio<ReturnType<typeof makeProvider>['provider']> | null = null;

function makeProvider() {
  // Strict mode is the default — schemas are passed to the model verbatim
  // and the model must follow them exactly. Trade is slightly slower
  // responses for fewer malformed tool calls. For a CRM where the wrong
  // contactId is a real failure mode, strict wins.
  const provider = new OpenAIAgentsProvider({ strict: true });
  return { provider };
}

/**
 * Get the singleton Composio client. Throws if `COMPOSIO_API_KEY` is
 * missing — the caller should handle this gracefully (return 500 with
 * a realtor-friendly message, NOT show a stack trace).
 */
export function getComposio() {
  if (_client) return _client;
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not set');
  }
  const { provider } = makeProvider();
  _client = new Composio({ apiKey, provider });
  return _client;
}

/** True when the SDK is configured. UI uses this to hide the connect surface. */
export function composioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

/**
 * Initiate a connection for a user against a toolkit. Returns the redirect
 * URL Composio expects the user to visit to complete OAuth, plus the
 * pending connection id we'll persist on callback.
 *
 * `entityId` should be the realtor's Clerk userId — Composio scopes
 * connections per "entity" so a future broker dashboard can list a
 * realtor's connected accounts cleanly.
 */
export async function initiateConnection(args: {
  entityId: string;
  toolkit: string;
  callbackUrl?: string;
}): Promise<ConnectionRequest> {
  const composio = getComposio();
  try {
    return await composio.connectedAccounts.initiate(args.entityId, args.toolkit, {
      callbackUrl: args.callbackUrl,
    });
  } catch (err) {
    logger.error(
      '[integrations.composio] initiate failed',
      { entityId: args.entityId, toolkit: args.toolkit },
      err,
    );
    throw err;
  }
}

/** Look up a connected account by id (the one Composio returned at initiate). */
export async function getConnection(connectedAccountId: string) {
  const composio = getComposio();
  return composio.connectedAccounts.get(connectedAccountId);
}

/** Revoke + delete a connected account at Composio. Idempotent on our side. */
export async function deleteConnection(connectedAccountId: string): Promise<void> {
  const composio = getComposio();
  try {
    await composio.connectedAccounts.delete(connectedAccountId);
  } catch (err) {
    // Connection may already be gone on Composio's side — log + swallow.
    logger.warn(
      '[integrations.composio] delete failed (may be already gone)',
      { connectedAccountId },
      err,
    );
  }
}

/**
 * Fetch the SDK Tool[] for a given user across the toolkits they have
 * connected. Returned tools drop straight into our SDK Agent's `tools`
 * array via the bridge — that's the whole point of the OpenAI Agents
 * provider above.
 */
export async function loadToolsForEntity(args: {
  entityId: string;
  toolkits: string[];
}) {
  if (args.toolkits.length === 0) return [];
  const composio = getComposio();
  return composio.tools.get(args.entityId, { toolkits: args.toolkits });
}
