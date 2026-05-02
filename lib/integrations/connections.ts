/**
 * DB-side helpers for IntegrationConnection rows. The Composio SDK holds
 * the OAuth tokens; this table holds the pointer + status + audit. One
 * active row per (space, user, toolkit) — a reconnect flips the prior
 * row to 'revoked' and inserts a new 'active' row.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { deleteConnection as composioDelete } from './composio';

export type IntegrationStatus = 'active' | 'expired' | 'revoked' | 'failed';

export interface IntegrationConnectionRow {
  id: string;
  spaceId: string;
  userId: string;
  toolkit: string;
  composioConnectionId: string;
  status: IntegrationStatus;
  label: string | null;
  lastError: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** All connections for a space, regardless of status. UI filters as needed. */
export async function listConnections(spaceId: string): Promise<IntegrationConnectionRow[]> {
  const { data, error } = await supabase
    .from('IntegrationConnection')
    .select('*')
    .eq('spaceId', spaceId)
    .order('createdAt', { ascending: false });
  if (error) {
    logger.warn('[integrations.connections] list failed', { spaceId, err: error.message });
    return [];
  }
  return (data ?? []) as IntegrationConnectionRow[];
}

/** Active toolkit slugs for a given (space, user) — the chat agent reads this
 *  on every turn to decide which Composio tools to load. Hot path; keep tight. */
export async function activeToolkits(args: {
  spaceId: string;
  userId: string;
}): Promise<string[]> {
  const { data, error } = await supabase
    .from('IntegrationConnection')
    .select('toolkit')
    .eq('spaceId', args.spaceId)
    .eq('userId', args.userId)
    .eq('status', 'active');
  if (error) {
    logger.warn('[integrations.connections] activeToolkits failed', {
      spaceId: args.spaceId,
      err: error.message,
    });
    return [];
  }
  return ((data ?? []) as Array<{ toolkit: string }>).map((r) => r.toolkit);
}

/** Look up by composio connection id — used by the OAuth callback. */
export async function findByComposioId(composioConnectionId: string) {
  const { data } = await supabase
    .from('IntegrationConnection')
    .select('*')
    .eq('composioConnectionId', composioConnectionId)
    .maybeSingle();
  return (data ?? null) as IntegrationConnectionRow | null;
}

/** Look up by our own row id. */
export async function getById(id: string) {
  const { data } = await supabase
    .from('IntegrationConnection')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return (data ?? null) as IntegrationConnectionRow | null;
}

/**
 * Insert a new connection row. Caller is responsible for revoking any
 * prior active row for the same (space, user, toolkit) BEFORE calling
 * this — the unique-active index will reject otherwise.
 */
export async function insertConnection(args: {
  spaceId: string;
  userId: string;
  toolkit: string;
  composioConnectionId: string;
  label?: string;
}): Promise<IntegrationConnectionRow | null> {
  const { data, error } = await supabase
    .from('IntegrationConnection')
    .insert({
      spaceId: args.spaceId,
      userId: args.userId,
      toolkit: args.toolkit,
      composioConnectionId: args.composioConnectionId,
      label: args.label ?? null,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) {
    logger.error('[integrations.connections] insert failed', { args, err: error.message });
    return null;
  }
  return data as IntegrationConnectionRow;
}

/** Flip a row's status. Used for reconnect (prior → revoked) and on errors. */
export async function setStatus(args: {
  id: string;
  status: IntegrationStatus;
  lastError?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('IntegrationConnection')
    .update({
      status: args.status,
      lastError: args.lastError ?? null,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', args.id);
  if (error) {
    logger.warn('[integrations.connections] setStatus failed', { id: args.id, err: error.message });
  }
}

/** Revoke at Composio AND mark our row revoked. Idempotent. */
export async function revoke(row: IntegrationConnectionRow): Promise<void> {
  await composioDelete(row.composioConnectionId);
  await setStatus({ id: row.id, status: 'revoked' });
}

/**
 * Flip the row matching this Composio connection id to 'expired'. Used by
 * the chat agent when the SDK reports the connected account is gone or
 * unauthorized — typically because the realtor revoked our OAuth grant on
 * the provider's side. Reflects truth on the integrations panel (amber
 * dot + "Reconnect") the moment we discover the drift; no toast, no
 * notification, just the page being honest the next time they look.
 *
 * Idempotent: a no-op if no row matches (the connection may have been
 * deleted on our side already).
 */
export async function markExpiredByComposioId(
  composioConnectionId: string,
  error: unknown,
): Promise<void> {
  const row = await findByComposioId(composioConnectionId);
  if (!row) return;
  // Don't downgrade an already-revoked or already-expired row — the
  // realtor's already seen the truth, and a chat-time write would be
  // pure churn.
  if (row.status === 'revoked' || row.status === 'expired') return;
  const message = error instanceof Error ? error.message : String(error);
  await setStatus({ id: row.id, status: 'expired', lastError: message });
  logger.info('[integrations.connections] marked expired from chat', {
    id: row.id,
    composioConnectionId,
    err: message,
  });
}

/**
 * Same as `markExpiredByComposioId` but keyed by (space, user, toolkit) —
 * the chat agent's catch path knows the toolkit it tried to load tools
 * for, but not necessarily the Composio connected-account id (the SDK
 * doesn't always surface it on the error). Idempotent.
 */
export async function markExpiredByToolkit(args: {
  spaceId: string;
  userId: string;
  toolkit: string;
  error: unknown;
}): Promise<void> {
  const row = await findActive({
    spaceId: args.spaceId,
    userId: args.userId,
    toolkit: args.toolkit,
  });
  if (!row) return;
  const message = args.error instanceof Error ? args.error.message : String(args.error);
  await setStatus({ id: row.id, status: 'expired', lastError: message });
  logger.info('[integrations.connections] marked expired from chat', {
    id: row.id,
    toolkit: args.toolkit,
    err: message,
  });
}

/** Find any active row for this (space, user, toolkit). Helper for callback. */
export async function findActive(args: {
  spaceId: string;
  userId: string;
  toolkit: string;
}): Promise<IntegrationConnectionRow | null> {
  const { data } = await supabase
    .from('IntegrationConnection')
    .select('*')
    .eq('spaceId', args.spaceId)
    .eq('userId', args.userId)
    .eq('toolkit', args.toolkit)
    .eq('status', 'active')
    .maybeSingle();
  return (data ?? null) as IntegrationConnectionRow | null;
}
