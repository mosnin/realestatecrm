/**
 * Routine dispatch — fires the Modal autonomous run for one routine.
 *
 * The Modal endpoint only returns once the whole run finishes, so a dispatch
 * timeout is the normal case here, not a failure: the request landed and the
 * run is in flight. Like every autonomous path, the run DRAFTS — it never
 * sends a message unattended.
 *
 * Shared by the hourly cron (/api/cron/routines) and the "Run now" button.
 *
 * Reliability (Fix #5): every dispatch writes an AgentRunLedger row so a fired
 * run is visible after the fact, and the outcome is recorded honestly:
 *   - 2xx response                  → ledger 'in_flight' (run accepted), return 'ok'.
 *   - timeout (AbortError)          → ledger 'in_flight' (run presumed live —
 *                                     Modal holds the connection for the whole
 *                                     run), return 'ok', and do NOT retry
 *                                     (retrying a live run double-runs → double-cost).
 *   - non-2xx OR non-timeout error  → GENUINE dispatch failure (the run never
 *                                     started): retry with exponential backoff;
 *                                     if all attempts fail → ledger 'failed', return 'error'.
 */

import {
  recordDispatch,
  markInFlight,
  markFailed,
  type AgentRunTrigger,
} from '@/lib/agent/run-ledger';

const DISPATCH_TIMEOUT_MS = 12_000;

// Genuine dispatch failures (non-2xx / non-timeout network errors) are safe to
// retry: the run never started, so a retry can't double-run. Timeouts are NOT
// retried here — see fireRoutineRun's AbortError branch.
const MAX_DISPATCH_ATTEMPTS = 3;

// Exponential backoff base (ms) between retry attempts: base, base*2, base*4...
// Read at call time so tests can set ROUTINE_DISPATCH_BACKOFF_MS=0 for instant
// retries; defaults to 1s (→ 1s/2s/4s) in production.
function dispatchBackoffMs(attempt: number): number {
  const raw = Number(process.env.ROUTINE_DISPATCH_BACKOFF_MS);
  const base = Number.isFinite(raw) && raw >= 0 ? raw : 1_000;
  return base * 2 ** (attempt - 1);
}

export type RoutineRunStatus = 'ok' | 'error';

export const ROUTINE_CADENCES = [
  'hourly',
  'daily',
  'weekdays',
  'monthly',
  'custom',
] as const;
export type RoutineCadence = (typeof ROUTINE_CADENCES)[number];

/**
 * Lowercase day codes used by the 'custom' cadence — stored as a text[] in the
 * DB and as a string[] over the wire. ISO weekday convention (Mon=1) is too
 * cute when the API also handles a Sunday-based JS dow elsewhere; codes are
 * unambiguous and survive a serializer round-trip.
 */
export const ROUTINE_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type RoutineWeekday = (typeof ROUTINE_WEEKDAYS)[number];

/** Cap day-of-month at 28 — Feb has 28 every year, so the routine never skips a month. */
export const ROUTINE_MAX_DAY_OF_MONTH = 28;

/**
 * Structured provenance for runs the realtor did not initiate by chat.
 * Currently only `composio_trigger` exists; the kind discriminator is
 * here so future inbound paths (calendar webhook, MLS push, etc.) can
 * layer on the same column without a schema change.
 *
 * The orchestrator stashes this on AgentContext; the drafts tool writes
 * it to AgentDraft.triggerSource. The inbox UI then renders a small
 * "Chippi noticed because..." breadcrumb under each draft.
 */
export interface TriggerSource {
  kind: 'composio_trigger';
  slug: string;
  toolkit: string;
  deliveryId: string;
}

export async function fireRoutineRun(
  spaceId: string,
  instruction: string,
  userId?: string,
  triggerSource?: TriggerSource,
  trigger: AgentRunTrigger = 'routine',
): Promise<RoutineRunStatus> {
  // Read env at call time, not module load — see /api/cron/agent-sweep for why.
  const url = process.env.MODAL_WEBHOOK_URL ?? '';
  const secret = process.env.AGENT_INTERNAL_SECRET ?? '';
  if (!url || !secret) {
    console.error('[routines] MODAL_WEBHOOK_URL or AGENT_INTERNAL_SECRET missing');
    return 'error';
  }

  // Write the ledger row up front and forward the runId to Modal in the POST
  // body. Modal ignores unknown fields today — this is forward-compatible for a
  // future Modal-side run_id + completion callback (see run-ledger.ts header).
  const runId = await recordDispatch(spaceId, trigger);

  // user_id is the workspace owner's Clerk userId — the entity whose
  // Composio connections (Gmail, Slack, Sheets, Calendar) the autonomous
  // run uses. The Modal orchestrator can resolve it server-side too, but
  // passing it explicitly from the cron is cheaper and removes the silent-
  // failure path where the server-side lookup returns null and the routine
  // runs with no integration tools.
  //
  // trigger_source flows through the Python AgentContext so the draft
  // tool can persist it on AgentDraft.triggerSource. Absent for chat /
  // routine / sweep runs — the orchestrator treats null as "realtor-
  // initiated" and renders nothing in the inbox breadcrumb.
  const body: Record<string, unknown> = { space_id: spaceId, secret, instruction, run_id: runId };
  if (userId) body.user_id = userId;
  if (triggerSource) body.trigger_source = triggerSource;

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
      // AbortError: the POST was sent and the Modal endpoint just hasn't
      // returned because the run is still going. The run is IN FLIGHT — record
      // it honestly and DO NOT retry (a retry would double-run → double-cost).
      if (err instanceof Error && err.name === 'AbortError') {
        await markInFlight(runId);
        return 'ok';
      }
      // A non-timeout network error means the request never landed — the run
      // did not start. Safe to retry.
      lastFailure = err instanceof Error ? err.message : String(err);
      console.error('[routines] dispatch attempt failed', { attempt, spaceId }, err);
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
