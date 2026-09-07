/** Routine dispatch with correlated receipts and no ambiguous network retries. */

import {
  recordDispatch,
  markConfirmed,
  markFailed,
  type AgentRunTrigger,
} from '@/lib/agent/run-ledger';
import { claimRoutineSlot } from '@/lib/agent/routine-budget';
import { resolveRoutinePolicy } from '@/lib/agent/routine-policy';
import { dispatchAgentRun } from '@/lib/agent/dispatch-run';
import { runAutonomousInstruction } from '@/lib/agent/run-instruction';

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
  // The TS runtime supports exact native-tool grants from saved instructions.
  // Use it for automatic routines regardless of the optional Python deployment.
  if (trigger === 'routine') {
    try {
      const policy = await resolveRoutinePolicy(spaceId, trigger, instruction);
      if (!policy) return 'error';
      if (policy.executionMode === 'autonomous') return fireInProcessRun(spaceId, instruction, trigger);
    } catch {
      return 'error';
    }
  }
  // Read env at call time, not module load — see /api/cron/agent-sweep for why.
  const url = process.env.MODAL_WEBHOOK_URL ?? '';
  const secret = process.env.AGENT_INTERNAL_SECRET ?? '';
  if (!url || !secret) {
    // Modal isn't configured — run the instruction IN-PROCESS instead of
    // failing silently. The same TS agent obeys the workspace's saved policy.
    return fireInProcessRun(spaceId, instruction, trigger);
  }

  // Correlate the dispatch, worker result and trajectory with one run ID.
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

  return dispatchAgentRun(url, secret, body, runId);
}

/** Local execution uses the saved policy and records completion directly. */
async function fireInProcessRun(
  spaceId: string,
  instruction: string,
  trigger: AgentRunTrigger,
): Promise<RoutineRunStatus> {
  const runId = await recordDispatch(spaceId, trigger);
  let slot: Awaited<ReturnType<typeof claimRoutineSlot>> | undefined;
  try {
    const policy = await resolveRoutinePolicy(spaceId, trigger, instruction);
    if (!policy) {
      await markFailed(runId, 'Agent is paused or settings are missing');
      return 'error';
    }
    slot = await claimRoutineSlot(spaceId, runId, policy.dailyTokenBudget);
    const result = await runAutonomousInstruction({ spaceId, instruction, executionMode: policy.executionMode, authorizedInstruction: policy.authorizedInstruction, onUsage: slot.recordUsage });
    if (result.ok) {
      await markConfirmed(runId);
      return 'ok';
    }
    await markFailed(runId, result.error ?? 'in-process run failed');
    return 'error';
  } catch (err) {
    // runAutonomousInstruction is designed not to throw, but guard the ledger
    // path anyway so a surprise never leaves the row stuck at 'dispatched'.
    await markFailed(runId, err instanceof Error ? err.message : String(err));
    return 'error';
  } finally {
    await slot?.release().catch(error => console.error('[routines] run lock release failed', error));
  }
}
