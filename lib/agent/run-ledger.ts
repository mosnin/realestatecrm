/**
 * AgentRunLedger helper — per-dispatch lifecycle tracking for autonomous runs.
 *
 * Every autonomous Modal run is dispatched fire-and-forget: the Modal endpoint
 * only returns once the WHOLE run finishes, so a client-side dispatch timeout is
 * the NORMAL case, not a failure. That left the app blind to whether a run
 * actually started and with no honest record of a genuine dispatch failure.
 *
 * This module writes one row per dispatch to the AgentRunLedger table
 * (supabase/migrations/20260709000000_agent_run_ledger.sql) and transitions its
 * status as we learn more:
 *
 *   recordDispatch()  → status 'dispatched'   (row written the moment we POST)
 *   markInFlight()    → status 'in_flight'    (2xx accepted OR timed out — the
 *                                              run is presumed live; do NOT retry)
 *   markFailed()      → status 'failed'       (genuine dispatch failure: non-2xx
 *                                              after retries, or a non-timeout
 *                                              network error; the run never started)
 *   markConfirmed()   → status 'confirmed'    (reconcile saw a run artifact)
 *
 * Every function is BEST-EFFORT and never throws: ledger bookkeeping must not
 * break the dispatch path (which is also a money path — a failed INSERT here
 * must never abort or double-fire a run). Failures are logged and swallowed,
 * exactly like the sweep's KV mark and chargeWorkflow.
 *
 * Forward-compat note: precise per-run correlation + auto-retry would need a
 * Modal-side run_id echoed back via a completion callback. We forward `run_id`
 * in the dispatch body today (Modal ignores unknown fields), so the wire is
 * ready; reconcile currently correlates by (spaceId, time window) instead.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// Canonical row + status types live in lib/types.ts alongside the other model
// types; re-exported here so callers of this helper get them from one import.
export type { AgentRunLedger, AgentRunLedgerStatus } from '@/lib/types';

/** Where a dispatch originated. Free text in the DB (no CHECK) — kept as a
 *  union here for call-site safety; add a member when a new source appears. */
export type AgentRunTrigger = 'sweep' | 'routine' | 'run_now' | 'composio_trigger';

const TABLE = 'AgentRunLedger';

/**
 * Record a dispatch attempt. Generates a runId (caller forwards it to Modal in
 * the POST body) and inserts a 'dispatched' row. Returns the runId so the caller
 * can transition it later. Best-effort: on a DB error the runId is still
 * returned (so the dispatch + its later mark calls proceed) — we just lose the
 * row, logged. Pass a pre-generated `runId` to keep the wire body and the ledger
 * in sync when the caller builds the body before calling this.
 */
export async function recordDispatch(
  spaceId: string,
  trigger: AgentRunTrigger,
  runId: string = crypto.randomUUID(),
): Promise<string> {
  try {
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from(TABLE).insert({
      runId,
      spaceId,
      trigger,
      status: 'dispatched',
      dispatchedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    if (error) {
      logger.warn('[run-ledger] recordDispatch insert failed', { spaceId, runId, trigger }, error);
    }
  } catch (err) {
    logger.warn('[run-ledger] recordDispatch threw', { spaceId, runId, trigger }, err);
  }
  return runId;
}

/**
 * Transition a row to 'in_flight' — the POST was accepted (2xx) or timed out
 * (the run is presumed live). Best-effort.
 */
export async function markInFlight(runId: string): Promise<void> {
  await patch(runId, { status: 'in_flight', updatedAt: new Date().toISOString() });
}

/**
 * Transition a row to 'failed' — a genuine dispatch failure (the run never
 * started). Records the reason for observability. Best-effort.
 */
export async function markFailed(runId: string, failureReason: string): Promise<void> {
  await patch(runId, {
    status: 'failed',
    failureReason: failureReason.slice(0, 500),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Transition a row to 'confirmed' — reconcile observed a run artifact for the
 * space at/after dispatch. Stamps confirmedAt. Best-effort.
 */
export async function markConfirmed(runId: string, confirmedAt: string = new Date().toISOString()): Promise<void> {
  await patch(runId, { status: 'confirmed', confirmedAt, updatedAt: confirmedAt });
}

async function patch(runId: string, fields: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await supabase.from(TABLE).update(fields).eq('runId', runId);
    if (error) {
      logger.warn('[run-ledger] update failed', { runId, fields }, error);
    }
  } catch (err) {
    logger.warn('[run-ledger] update threw', { runId, fields }, err);
  }
}
