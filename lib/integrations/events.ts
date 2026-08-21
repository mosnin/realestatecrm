/**
 * DB-side helpers for IntegrationEvent rows — the durable record of every
 * Composio trigger delivery we accept (see the migration
 * 20260705000000_integration_event.sql for the why).
 *
 * The Inngest handler (lib/inngest/functions.ts:handleComposioTrigger)
 * captures one row per delivery the moment a connection + trigger resolve —
 * BEFORE the cap/paused gates that decide whether to dispatch. So the event
 * is recorded even when the dispatch is skipped, and the activity feed shows
 * "Chippi noticed this" regardless of whether it acted.
 *
 * Idempotency: the table has a partial UNIQUE index on deliveryId. We insert
 * via an upsert with ignoreDuplicates so an Inngest retry (at-least-once)
 * re-running the capture step is a no-op instead of a duplicate row. Every
 * write here is best-effort: a failure is logged, never thrown — persisting
 * the event must never drop the event or break the dispatch downstream.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { normalizeTriggerEvent } from './triggers';
import type { IntegrationEvent, IntegrationEventStatus } from '@/lib/types';
import { unscoped } from '@/lib/supabase-guard';


export interface CaptureEventArgs {
  spaceId: string;
  connectionId: string;
  /** Null when the capturing trigger row couldn't be resolved (shouldn't
   *  happen on the live path — the handler resolves it first — but the column
   *  is nullable so the type allows it). */
  triggerId: string | null;
  toolkit: string;
  /** The trigger slug, stored as eventType. */
  slug: string;
  payload: Record<string, unknown> | undefined;
  deliveryId: string;
  /** Defaults to 'captured'. The handler may pass a terminal status directly
   *  when it already knows the outcome. */
  status?: IntegrationEventStatus;
}

/**
 * Persist one trigger delivery. Idempotent on deliveryId — a retry that
 * re-runs this is swallowed by the unique index (ignoreDuplicates). Returns
 * true on a successful write (or a no-op duplicate), false on a real error.
 * Never throws: capture failure is logged and the caller proceeds with the
 * dispatch regardless.
 */
export async function captureEvent(args: CaptureEventArgs): Promise<boolean> {
  try {
    const { title, actor, snippet, occurredAt } = normalizeTriggerEvent(
      args.toolkit,
      args.slug,
      args.payload,
    );
    const { error } = await supabase
      .from('IntegrationEvent')
      .upsert(
        {
          spaceId: args.spaceId,
          connectionId: args.connectionId,
          triggerId: args.triggerId,
          toolkit: args.toolkit,
          eventType: args.slug,
          title,
          actor,
          snippet,
          occurredAt,
          payload: args.payload ?? null,
          status: args.status ?? 'captured',
          deliveryId: args.deliveryId,
          updatedAt: new Date().toISOString(),
        },
        // Insert-or-ignore on the partial unique index. A duplicate delivery
        // (Inngest retry) is a silent no-op, not a second row.
        { onConflict: 'deliveryId', ignoreDuplicates: true },
      );
    if (error) {
      logger.warn('[integrations.events] capture failed', {
        deliveryId: args.deliveryId,
        slug: args.slug,
        err: error.message,
      });
      return false;
    }
    return true;
  } catch (err) {
    // Defensive: nothing about persisting the event may bubble up and drop
    // the dispatch. Swallow + log.
    logger.warn('[integrations.events] capture threw', {
      deliveryId: args.deliveryId,
      slug: args.slug,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** The realtor-facing slice of an IntegrationEvent — the activity feed never
 *  needs the raw `payload` (potentially large + may carry PII the feed doesn't
 *  render) so the list helper projects it away at the DB boundary. */
export type ActivityFeedEvent = Pick<
  IntegrationEvent,
  | 'id'
  | 'connectionId'
  | 'toolkit'
  | 'eventType'
  | 'title'
  | 'actor'
  | 'snippet'
  | 'occurredAt'
  | 'status'
  | 'deliveryId'
>;

const FEED_COLUMNS =
  'id, connectionId, toolkit, eventType, title, actor, snippet, occurredAt, status, deliveryId';

export interface ListEventsArgs {
  spaceId: string;
  /** Page size. Clamped 1..100 by the caller before it reaches here. */
  limit: number;
  /** Keyset cursor: return events strictly older than this ISO occurredAt. */
  before?: string;
  /** Optional toolkit filter (e.g. 'gmail') — drives the feed's filter chips. */
  toolkit?: string;
  /** Optional single-connection filter. */
  connectionId?: string;
}

/**
 * List a space's persisted activity events, newest first by `occurredAt`.
 *
 * Space-scoped: the `.eq('spaceId', …)` is the privilege boundary — a realtor
 * only ever sees their own space's events. Keyset-paginated on `occurredAt`
 * (the `before` cursor) rather than offset, which stays correct as new events
 * stream in at the head. Projects the feed columns only — never the raw
 * `payload` blob. Best-effort: a DB error logs and returns [] so the page
 * renders an empty feed instead of throwing.
 */
export async function listEvents(args: ListEventsArgs): Promise<ActivityFeedEvent[]> {
  let query = supabase
    .from('IntegrationEvent')
    .select(FEED_COLUMNS)
    .eq('spaceId', args.spaceId)
    .order('occurredAt', { ascending: false })
    .limit(args.limit);

  if (args.before) query = query.lt('occurredAt', args.before);
  if (args.toolkit) query = query.eq('toolkit', args.toolkit);
  if (args.connectionId) query = query.eq('connectionId', args.connectionId);

  const { data, error } = await query;
  if (error) {
    logger.warn('[integrations.events] list failed', {
      spaceId: args.spaceId,
      err: error.message,
    });
    return [];
  }
  return (data ?? []) as ActivityFeedEvent[];
}

/**
 * Move an already-captured event to a terminal status keyed by deliveryId.
 * Used once the handler knows the dispatch outcome ('dispatched' / 'skipped'
 * / 'failed'). Best-effort: a failure here doesn't change what already
 * happened with the dispatch. No-op if no row matches.
 */
export async function setEventStatus(
  deliveryId: string,
  status: IntegrationEventStatus,
): Promise<void> {
  try {
    const { error } = await unscoped(supabase
      .from('IntegrationEvent'), 'post-fetch: caller verified parent scope before this id query')
      .update({ status, updatedAt: new Date().toISOString() })
      .eq('deliveryId', deliveryId);
    if (error) {
      logger.warn('[integrations.events] setEventStatus failed', {
        deliveryId,
        status,
        err: error.message,
      });
    }
  } catch (err) {
    logger.warn('[integrations.events] setEventStatus threw', {
      deliveryId,
      status,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
