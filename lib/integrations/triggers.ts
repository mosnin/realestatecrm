/**
 * Composio trigger subscriptions — the inbound half of the integrations
 * story. Triggers are how the platform tells us "something happened in
 * the realtor's connected app" so Chippi can react without being asked.
 *
 * This module owns four things:
 *
 *   1. CURATED_TRIGGERS — the slugs we auto-register per toolkit. Hard-
 *      coded, not realtor-configurable. The realtor's choice surface is
 *      the connect/disconnect button, not a trigger picker.
 *
 *   2. TRIGGER_DISPATCH — what to do when a delivery arrives. One of:
 *        DRAFT     — fire an autonomous run with a templated instruction
 *                    so the agent drafts a response for the realtor to
 *                    approve. Never auto-sends.
 *        NOTICE    — surface a card to the activity toast (Phase 4 —
 *                    NOT WIRED yet; falls through to a logged no-op).
 *        DATA_SYNC — mirror the event directly into our DB (Phase 4 —
 *                    NOT WIRED yet).
 *
 *   3. registerForConnection / deleteForConnection — lifecycle helpers
 *      called from the OAuth callback (after status becomes active) and
 *      from `connections.revoke` (before the connection is torn down).
 *
 *   4. DB helpers + dispatcher + templater the Inngest handler depends on.
 *
 * Scope discipline (Musk lens): v1 ships with one trigger (`gmail`) and
 * one dispatch kind (`DRAFT`). The other toolkits have empty arrays and
 * the dispatcher falls through to a logged no-op. Expanding coverage is
 * a matter of adding slugs here AFTER verifying them against
 * `composio.triggers.listTypes()` — never guess slugs into this map.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { createTrigger, deleteTrigger } from './composio';
import { fireRoutineRun } from '@/lib/routines';
import type { IntegrationConnectionRow } from './connections';

export type TriggerStatus = 'active' | 'paused' | 'failed';
export type TriggerKind = 'DRAFT' | 'NOTICE' | 'DATA_SYNC';

export interface IntegrationTriggerRow {
  id: string;
  connectionId: string;
  composioTriggerId: string | null;
  triggerSlug: string;
  status: TriggerStatus;
  lastFiredAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-toolkit list of trigger slugs to auto-register at connect time.
 *
 * ONLY add a slug here after confirming it exists via:
 *   const types = await composio.triggers.listTypes({ toolkits: ['<slug>'] });
 * Guessing a slug into this map fails silently at registration time and
 * the realtor never sees Chippi "noticing" what the catalog implied.
 *
 * Empty array = we ingest no triggers for that toolkit yet. The connect
 * flow still works; only the inbound half is dark.
 */
export const CURATED_TRIGGERS: Record<string, string[]> = {
  // Documented in Composio's setting-up-triggers guide.
  gmail: ['GMAIL_NEW_GMAIL_MESSAGE'],

  // All other toolkits: intentionally empty until we've verified slugs
  // against Composio's catalog and confirmed the model has enough
  // payload context to do something useful with the delivery. See module
  // preamble for the discipline.
  outlook: [],
  outlook_calendar: [],
  googlecalendar: [],
  calendly: [],
  cal: [],
  twilio: [],
  whatsapp: [],
  slack: [],
  discord: [],
  microsoft_teams: [],
  facebook: [],
  instagram: [],
  linkedin: [],
  reddit: [],
  youtube: [],
  google_ads: [],
  stripe: [],
  notion: [],
  googledocs: [],
  googlesheets: [],
  googledrive: [],
  onedrive: [],
  dropbox: [],
  hubspot: [],
  salesforce: [],
  pipedrive: [],
  zoho: [],
  docusign: [],
  dropbox_sign: [],
  asana: [],
  trello: [],
  typeform: [],
  googleforms: [],
  zoom: [],
  googlemeet: [],
  loom: [],
  airtable: [],
  mailchimp: [],
};

/**
 * What to do when a given trigger fires. A slug missing from this map
 * falls through to a logged no-op in the dispatcher — registration
 * still works but the delivery does nothing useful.
 */
const TRIGGER_DISPATCH: Record<string, TriggerKind> = {
  GMAIL_NEW_GMAIL_MESSAGE: 'DRAFT',
};

/**
 * Per-slug instruction templater. Given the trigger's payload, produces
 * the natural-language instruction the autonomous Modal run receives.
 *
 * The instruction is the only context the model gets at run time — it
 * has to be enough for the model to act intelligently. The default
 * template is intentionally vague ("a trigger fired, look around"); a
 * slug-specific override is far better.
 *
 * Returns null when the payload is too thin to act on — the dispatcher
 * skips the run in that case so we don't burn Modal time on a no-op.
 */
function templateInstruction(
  triggerSlug: string,
  payload: Record<string, unknown> | undefined,
): string | null {
  const p = payload ?? {};

  if (triggerSlug === 'GMAIL_NEW_GMAIL_MESSAGE') {
    // Gmail's payload shape varies (V1 vs V2 vs V3 vs the toolkit-shaped
    // fields the trigger config emits). Pull the most-likely fields
    // defensively; bail if we can't find anything to anchor on.
    const subject =
      pickString(p, 'subject') ?? pickString(p, 'messageSubject') ?? null;
    const from =
      pickString(p, 'sender') ?? pickString(p, 'from') ?? pickString(p, 'fromEmail') ?? null;
    const snippet =
      pickString(p, 'preview') ?? pickString(p, 'snippet') ?? pickString(p, 'messageText') ?? null;

    if (!subject && !from && !snippet) return null;

    const lines = [
      'A new email arrived in the realtor\'s inbox. Here\'s what we know:',
      '',
      subject ? `Subject: ${subject}` : null,
      from ? `From: ${from}` : null,
      snippet ? `Snippet: ${snippet}` : null,
      '',
      'If this looks like it needs a response — it\'s from a known contact, references a property/showing/offer, or asks a real question — read the full thread and draft a reply for me to approve. If it\'s noise (newsletter, system message, cold pitch), do nothing.',
    ].filter(Boolean);
    return lines.join('\n');
  }

  return null;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Register every curated trigger for a freshly-active connection.
 *
 * Called from the OAuth callback AFTER `upsertByComposioId` confirms the
 * row is active. Each (connection, slug) pair becomes one IntegrationTrigger
 * row. A registration failure for one slug is logged + recorded with
 * status='failed' and does NOT block the rest — a realtor with three
 * triggers should get the two that work even if one slug is wrong.
 *
 * Best-effort overall: a Composio outage here doesn't reject the OAuth
 * completion. The realtor sees the connection succeed; missing triggers
 * surface later via the health endpoint and can be re-registered on
 * reconnect.
 */
export async function registerForConnection(args: {
  connection: IntegrationConnectionRow;
}): Promise<{ registered: number; failed: number }> {
  const slugs = CURATED_TRIGGERS[args.connection.toolkit] ?? [];
  if (slugs.length === 0) {
    return { registered: 0, failed: 0 };
  }

  let registered = 0;
  let failed = 0;

  for (const slug of slugs) {
    try {
      const { triggerId } = await createTrigger({
        entityId: args.connection.userId,
        slug,
        connectedAccountId: args.connection.composioConnectionId,
      });
      const ok = await upsertTriggerRow({
        connectionId: args.connection.id,
        triggerSlug: slug,
        composioTriggerId: triggerId,
        status: 'active',
      });
      if (ok) registered++;
      else failed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[integrations.triggers] registration failed', {
        toolkit: args.connection.toolkit,
        slug,
        connectionId: args.connection.id,
        err: message,
      });
      // Record the failure so a later reconcile can see we tried.
      await upsertTriggerRow({
        connectionId: args.connection.id,
        triggerSlug: slug,
        composioTriggerId: null,
        status: 'failed',
        lastError: message,
      });
      failed++;
    }
  }

  if (registered > 0 || failed > 0) {
    logger.info('[integrations.triggers] registered for connection', {
      toolkit: args.connection.toolkit,
      connectionId: args.connection.id,
      registered,
      failed,
    });
  }
  return { registered, failed };
}

/**
 * Delete every trigger subscription for a connection — at Composio AND
 * locally. Called from `connections.revoke` BEFORE the connection itself
 * is torn down, so a disconnected realtor doesn't keep paying for
 * webhook deliveries that go nowhere.
 *
 * If the connection row is hard-deleted (ON DELETE CASCADE removes our
 * IntegrationTrigger rows), the Composio side still needs explicit
 * cleanup — this function is the one path that guarantees both.
 */
export async function deleteForConnection(connectionId: string): Promise<void> {
  const rows = await listTriggersForConnection(connectionId);
  for (const row of rows) {
    if (row.composioTriggerId) {
      await deleteTrigger(row.composioTriggerId);
    }
  }
  // DB-side cleanup. CASCADE on connection delete handles the case where
  // the connection row is removed; this covers the live revoke path where
  // the connection row sticks around as status='revoked'.
  const { error } = await supabase
    .from('IntegrationTrigger')
    .delete()
    .eq('connectionId', connectionId);
  if (error) {
    logger.warn('[integrations.triggers] db delete failed', {
      connectionId,
      err: error.message,
    });
  }
}

/**
 * Flip every IntegrationTrigger row for a connection between 'active'
 * and 'paused'. Realtor-facing — the integrations panel offers ONE
 * toggle per connected app, not one per trigger. Per-trigger granularity
 * is a settings rabbit hole the realtor does not need.
 *
 * Idempotent: pausing an already-paused connection is a no-op.
 * Failed rows (status='failed') are left alone — those are a separate
 * recovery path (re-register on reconnect).
 */
export async function setPausedForConnection(args: {
  connectionId: string;
  paused: boolean;
}): Promise<{ updated: number }> {
  const targetStatus: TriggerStatus = args.paused ? 'paused' : 'active';
  const oppositeStatus: TriggerStatus = args.paused ? 'active' : 'paused';
  const { data, error } = await supabase
    .from('IntegrationTrigger')
    .update({ status: targetStatus, updatedAt: new Date().toISOString() })
    .eq('connectionId', args.connectionId)
    .eq('status', oppositeStatus)
    .select('id');
  if (error) {
    logger.warn('[integrations.triggers] setPausedForConnection failed', {
      connectionId: args.connectionId,
      paused: args.paused,
      err: error.message,
    });
    return { updated: 0 };
  }
  return { updated: (data ?? []).length };
}

/**
 * Did this connection have ANY active trigger at the time of the check?
 * Used by the integrations list endpoint to render the per-connection
 * "Chippi is watching" / "Paused" affordance. Returns false when the
 * connection has no rows at all (nothing curated for that toolkit).
 */
export async function hasActiveTriggers(connectionId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('IntegrationTrigger')
    .select('id', { count: 'exact', head: true })
    .eq('connectionId', connectionId)
    .eq('status', 'active');
  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Per-connection trigger summary for the integrations list endpoint.
 * Three states:
 *   - "off"     → no triggers registered (toolkit has empty CURATED_TRIGGERS)
 *   - "active"  → at least one trigger active
 *   - "paused"  → at least one trigger registered but all paused
 * Returns null entries for connection IDs with no rows.
 */
export async function summariesForConnections(connectionIds: string[]): Promise<
  Record<string, 'off' | 'active' | 'paused'>
> {
  if (connectionIds.length === 0) return {};
  const { data, error } = await supabase
    .from('IntegrationTrigger')
    .select('connectionId, status')
    .in('connectionId', connectionIds);
  if (error) {
    logger.warn('[integrations.triggers] summariesForConnections failed', { err: error.message });
    return {};
  }
  const rows = (data ?? []) as Array<{ connectionId: string; status: TriggerStatus }>;
  const map: Record<string, 'off' | 'active' | 'paused'> = {};
  for (const id of connectionIds) map[id] = 'off';
  for (const r of rows) {
    // 'active' wins over 'paused' wins over 'off'.
    if (r.status === 'active') map[r.connectionId] = 'active';
    else if (r.status === 'paused' && map[r.connectionId] !== 'active') {
      map[r.connectionId] = 'paused';
    }
  }
  return map;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Dispatch one delivery to the right downstream path. Called by the
 * Inngest handler — keeps the inngest function thin and the dispatch
 * logic testable in isolation.
 *
 * Idempotency lives upstream of this (the receiver dedupes on the
 * webhook delivery id). This function may be called more than once for
 * the same logical event if Inngest retries; the downstream paths must
 * be idempotent on their own terms.
 */
export async function dispatchTrigger(args: {
  triggerSlug: string;
  connection: IntegrationConnectionRow;
  payload: Record<string, unknown> | undefined;
}): Promise<{ dispatched: 'DRAFT' | 'NOTICE' | 'DATA_SYNC' | 'noop'; reason?: string }> {
  const kind: TriggerKind | undefined = TRIGGER_DISPATCH[args.triggerSlug];
  if (!kind) {
    logger.info('[integrations.triggers] no dispatch handler — dropping', {
      slug: args.triggerSlug,
      connectionId: args.connection.id,
    });
    return { dispatched: 'noop', reason: 'no_dispatch' };
  }

  if (kind === 'DRAFT') {
    const instruction = templateInstruction(args.triggerSlug, args.payload);
    if (!instruction) {
      logger.info('[integrations.triggers] payload too thin — skipping draft', {
        slug: args.triggerSlug,
        connectionId: args.connection.id,
      });
      return { dispatched: 'noop', reason: 'thin_payload' };
    }
    await fireRoutineRun(args.connection.spaceId, instruction, args.connection.userId);
    return { dispatched: 'DRAFT' };
  }

  // NOTICE and DATA_SYNC paths are wired to no-ops for v1 — the dispatch
  // table never routes to them today (no slugs use them), but if a future
  // slug gets added with kind='NOTICE' it should not silently break. Log
  // loudly so the gap is obvious in production.
  logger.warn('[integrations.triggers] dispatch kind not yet wired', {
    slug: args.triggerSlug,
    kind,
    connectionId: args.connection.id,
  });
  return { dispatched: 'noop', reason: 'unwired_kind' };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

interface UpsertTriggerArgs {
  connectionId: string;
  triggerSlug: string;
  composioTriggerId: string | null;
  status: TriggerStatus;
  lastError?: string;
}

async function upsertTriggerRow(args: UpsertTriggerArgs): Promise<boolean> {
  // Unique (connectionId, triggerSlug) — onConflict makes this an upsert.
  const { error } = await supabase
    .from('IntegrationTrigger')
    .upsert(
      {
        connectionId: args.connectionId,
        triggerSlug: args.triggerSlug,
        composioTriggerId: args.composioTriggerId,
        status: args.status,
        lastError: args.lastError ?? null,
        updatedAt: new Date().toISOString(),
      },
      { onConflict: 'connectionId,triggerSlug' },
    );
  if (error) {
    logger.error('[integrations.triggers] upsert failed', {
      connectionId: args.connectionId,
      slug: args.triggerSlug,
      err: error.message,
    });
    return false;
  }
  return true;
}

export async function listTriggersForConnection(
  connectionId: string,
): Promise<IntegrationTriggerRow[]> {
  const { data, error } = await supabase
    .from('IntegrationTrigger')
    .select('*')
    .eq('connectionId', connectionId);
  if (error) {
    logger.warn('[integrations.triggers] list failed', { connectionId, err: error.message });
    return [];
  }
  return (data ?? []) as IntegrationTriggerRow[];
}

/**
 * Look up an IntegrationTrigger by Composio's trigger id — the join key
 * the webhook receiver has on hand. Returns null when the delivery
 * arrives for a trigger we don't track (stale registration, mid-disconnect).
 */
export async function findByComposioTriggerId(
  composioTriggerId: string,
): Promise<IntegrationTriggerRow | null> {
  const { data } = await supabase
    .from('IntegrationTrigger')
    .select('*')
    .eq('composioTriggerId', composioTriggerId)
    .maybeSingle();
  return (data ?? null) as IntegrationTriggerRow | null;
}

/** Stamp `lastFiredAt`. Non-blocking: a failure here doesn't fail dispatch. */
export async function stampFired(triggerRowId: string): Promise<void> {
  const { error } = await supabase
    .from('IntegrationTrigger')
    .update({ lastFiredAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .eq('id', triggerRowId);
  if (error) {
    logger.warn('[integrations.triggers] stampFired failed', { triggerRowId, err: error.message });
  }
}
