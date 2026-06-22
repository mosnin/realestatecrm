/**
 * Broker routine dispatch — fires the Modal autonomous run for one broker
 * routine, scoped to a brokerage instead of a single space.
 *
 * Mirrors fireRoutineRun (lib/routines.ts) one-for-one, swapping spaceId for
 * brokerageId and dispatching a BROKER-MODE run: the POST body carries
 * { brokerage_id, mode: 'broker', secret, instruction, run_id }.
 *
 * NOTE: requires the Modal orchestrator to support webhook-triggered
 * broker-mode runs; execution depends on that backend. Until Modal handles
 * mode: 'broker' + brokerage_id, the dispatch will land but the run won't do
 * anything broker-scoped. The dispatch/ledger/retry semantics here are correct
 * and ready the moment the backend supports it.
 *
 * The Modal endpoint only returns once the whole run finishes, so a dispatch
 * timeout is the normal case here, not a failure: the request landed and the
 * run is in flight. Like every autonomous path, the run DRAFTS — it never
 * sends a message unattended.
 *
 * Shared by the hourly cron (/api/cron/broker-routines) and the "Run now"
 * button. Every dispatch writes an AgentRunLedger row so a fired run is visible
 * after the fact; the outcome is recorded honestly (see fireRoutineRun's header
 * for the 2xx / timeout / failure matrix — identical here).
 *
 * The run ledger is keyed by spaceId, so we resolve the brokerage owner's
 * Space.id and record the dispatch against it. The Modal side still receives
 * brokerage_id + mode:'broker' as the authoritative scope.
 */

import { supabase } from '@/lib/supabase';
import {
  recordDispatch,
  markInFlight,
  markFailed,
} from '@/lib/agent/run-ledger';
import type { RoutineRunStatus } from '@/lib/routines';

const DISPATCH_TIMEOUT_MS = 12_000;

// Genuine dispatch failures (non-2xx / non-timeout network errors) are safe to
// retry: the run never started, so a retry can't double-run. Timeouts are NOT
// retried here — see the AbortError branch below.
const MAX_DISPATCH_ATTEMPTS = 3;

// Exponential backoff base (ms) between retry attempts. Read at call time so
// tests can set ROUTINE_DISPATCH_BACKOFF_MS=0 for instant retries; defaults to
// 1s (→ 1s/2s/4s) in production. Shares the realtor env var for parity.
function dispatchBackoffMs(attempt: number): number {
  const raw = Number(process.env.ROUTINE_DISPATCH_BACKOFF_MS);
  const base = Number.isFinite(raw) && raw >= 0 ? raw : 1_000;
  return base * 2 ** (attempt - 1);
}

/**
 * Resolve a spaceId to key the run-ledger row against. The ledger schema
 * requires a spaceId; a broker routine has none of its own, so we use the
 * brokerage owner's Space.id. Returns null if it can't be resolved (no owner
 * space yet) — the caller treats that as a dispatch error.
 */
async function resolveBrokerageLedgerSpaceId(brokerageId: string): Promise<string | null> {
  const { data: brokerage } = await supabase
    .from('Brokerage')
    .select('ownerId')
    .eq('id', brokerageId)
    .maybeSingle();
  const ownerId = (brokerage as { ownerId?: string } | null)?.ownerId;
  if (!ownerId) return null;

  const { data: space } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', ownerId)
    .eq('brokerageId', brokerageId)
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  let spaceId = (space as { id?: string } | null)?.id;
  // Fall back to any space the owner has, even if not brokerage-tagged.
  if (!spaceId) {
    const { data: anySpace } = await supabase
      .from('Space')
      .select('id')
      .eq('ownerId', ownerId)
      .order('createdAt', { ascending: true })
      .limit(1)
      .maybeSingle();
    spaceId = (anySpace as { id?: string } | null)?.id;
  }
  return spaceId ?? null;
}

export async function fireBrokerRoutineRun(
  brokerageId: string,
  instruction: string,
  userId?: string,
): Promise<RoutineRunStatus> {
  // Read env at call time, not module load.
  const url = process.env.MODAL_WEBHOOK_URL ?? '';
  const secret = process.env.AGENT_INTERNAL_SECRET ?? '';
  if (!url || !secret) {
    console.error('[broker-routines] MODAL_WEBHOOK_URL or AGENT_INTERNAL_SECRET missing');
    return 'error';
  }

  // The run ledger is keyed by spaceId. Resolve the brokerage owner's space.
  const ledgerSpaceId = await resolveBrokerageLedgerSpaceId(brokerageId);
  if (!ledgerSpaceId) {
    console.error('[broker-routines] could not resolve a ledger spaceId', { brokerageId });
    return 'error';
  }

  // Write the ledger row up front and forward the runId to Modal in the POST
  // body. Modal ignores unknown fields today — forward-compatible for a future
  // Modal-side run_id + completion callback.
  const runId = await recordDispatch(ledgerSpaceId, 'broker_routine');

  // Broker-mode dispatch body. brokerage_id + mode:'broker' are the
  // authoritative scope the Modal orchestrator must support.
  const body: Record<string, unknown> = {
    brokerage_id: brokerageId,
    mode: 'broker',
    secret,
    instruction,
    run_id: runId,
  };
  if (userId) body.user_id = userId;

  // Retry loop. Each iteration is one POST. We only LOOP on a genuine dispatch
  // failure (non-2xx / non-timeout network error) — the run never started, so a
  // retry is safe. A 2xx or a timeout returns immediately (no retry).
  let lastFailure = 'unknown dispatch error';
  for (let attempt = 1; attempt <= MAX_DISPATCH_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.ok) {
        // Accepted — the run is in flight (awaiting end-of-run artifact).
        await markInFlight(runId);
        return 'ok';
      }
      // Non-2xx: Modal refused the dispatch, so the run did NOT start. Safe to
      // retry. Capture the status for the ledger if this was the last attempt.
      lastFailure = `Modal returned ${res.status}`;
    } catch (err) {
      // AbortError: the POST was sent and Modal just hasn't returned because the
      // run is still going. IN FLIGHT — record it honestly and DO NOT retry (a
      // retry would double-run → double-cost).
      if (err instanceof Error && err.name === 'AbortError') {
        await markInFlight(runId);
        return 'ok';
      }
      // A non-timeout network error means the request never landed — the run
      // did not start. Safe to retry.
      lastFailure = err instanceof Error ? err.message : String(err);
      console.error('[broker-routines] dispatch attempt failed', { attempt, brokerageId }, err);
    } finally {
      clearTimeout(timer);
    }

    // Back off before the next attempt (skip the wait after the final attempt).
    if (attempt < MAX_DISPATCH_ATTEMPTS) {
      await sleep(dispatchBackoffMs(attempt));
    }
  }

  // Every attempt was a genuine failure — the run never started. Record it.
  await markFailed(runId, lastFailure);
  return 'error';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
