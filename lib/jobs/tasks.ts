/**
 * Named background tasks the worker can execute — the registry behind
 * /api/worker/execute.
 *
 * To offload work from a request path:
 *   1. Add a handler here: `myTask: async (payload) => { ... }`.
 *   2. From app code: `await enqueueWorkerTask('myTask', { ... })`
 *      (lib/queue.ts). The worker picks it up from Cloudflare Queues with
 *      retries and backoff and calls back into this registry.
 *
 * Handlers run inside a normal Vercel invocation (auth'd by WORKER_SECRET),
 * so they have full access to lib/* — Supabase, LLM client, email, etc.
 * Tenant scoping rules apply exactly as in any request path: payloads must
 * carry the spaceId/brokerageId and every query must scope by it.
 *
 * A thrown error → 500 → the worker's queue job retries with backoff, so
 * handlers should throw on transient failure and return on terminal states
 * they've already recorded (the work-session engine marks its own row
 * failed/skipped — a completed state transition is a SUCCESS here).
 */

import {
  planSession,
  executeSession,
  advanceSession,
} from '@/lib/work-sessions/engine';
import { executeApprovedWorkSessionAction } from '@/lib/work-sessions/actions';
import {
  dispatchWorkspaceRunTask,
  failSilentAcceptedWorkspaceRunTask,
  rearmRunningWorkspaceTaskTimeout,
} from '@/lib/workspace-runs/server';
import { enqueueWorkerTask, recordWorkerTick } from '@/lib/queue';

export type TaskHandler = (payload: unknown) => Promise<unknown>;

function objectPayload(payload: unknown, task: string): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${task} payload must be an object`);
  }
  return payload as Record<string, unknown>;
}

function requiredString(payload: Record<string, unknown>, field: string, task: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`${task} payload ${field} (string) is required`);
  }
  return value;
}

function rejectUnknownKeys(payload: Record<string, unknown>, keys: readonly string[], task: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(payload).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${task} payload field ${unknown} is not allowed`);
}

interface WorkSessionPayload {
  sessionId: string;
  workspaceRunId?: string;
}

interface WorkSessionActionPayload {
  sessionId: string;
  actionId: string;
  spaceId: string;
}

function workSessionActionPayload(payload: unknown): WorkSessionActionPayload {
  const task = 'work-session-action-execute';
  const object = objectPayload(payload, task);
  rejectUnknownKeys(object, ['sessionId', 'actionId', 'spaceId'], task);
  const input = {
    sessionId: requiredString(object, 'sessionId', task),
    actionId: requiredString(object, 'actionId', task),
    spaceId: requiredString(object, 'spaceId', task),
  };
  if (input.sessionId.length > 200 || input.actionId.length > 200 || input.spaceId.length > 200) {
    throw new Error(`${task} payload identifiers are too long`);
  }
  return input;
}

function workSessionPayload(payload: unknown, task: string): WorkSessionPayload {
  const object = objectPayload(payload, task);
  rejectUnknownKeys(object, ['sessionId', 'workspaceRunId'], task);
  const workspaceRunId = object.workspaceRunId;
  if (workspaceRunId !== undefined && (typeof workspaceRunId !== 'string' || workspaceRunId.length === 0 || workspaceRunId !== workspaceRunId.trim())) {
    throw new Error(`${task} payload workspaceRunId must be a non-empty string when provided`);
  }
  return {
    sessionId: requiredString(object, 'sessionId', task),
    ...(workspaceRunId === undefined ? {} : { workspaceRunId }),
  };
}

interface WorkspaceRunTaskPayload {
  taskId: string;
  runId: string;
  spaceId: string;
}

function workspaceRunTaskPayload(payload: unknown, task: string): WorkspaceRunTaskPayload {
  const object = objectPayload(payload, task);
  rejectUnknownKeys(object, ['taskId', 'runId', 'spaceId'], task);
  return {
    taskId: requiredString(object, 'taskId', task),
    runId: requiredString(object, 'runId', task),
    spaceId: requiredString(object, 'spaceId', task),
  };
}

interface WorkspaceRunTaskAcceptedSilencePayload {
  taskId: string;
  spaceId: string;
  launchToken: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function workspaceRunTaskAcceptedSilencePayload(
  payload: unknown,
): WorkspaceRunTaskAcceptedSilencePayload {
  const task = 'workspace-run-task-accepted-silence-timeout';
  const object = objectPayload(payload, task);
  rejectUnknownKeys(object, ['taskId', 'spaceId', 'launchToken'], task);
  const taskId = requiredString(object, 'taskId', task);
  const spaceId = requiredString(object, 'spaceId', task);
  const launchToken = requiredString(object, 'launchToken', task);
  if (taskId.length > 128 || spaceId.length > 128) {
    throw new Error(`${task} payload identifiers are too long`);
  }
  if (!UUID_PATTERN.test(launchToken)) {
    throw new Error(`${task} payload launchToken must be a UUID`);
  }
  return {
    taskId,
    spaceId,
    launchToken,
  };
}

interface WorkspaceRunLaunchRecoveryPayload {
  sessionId: string;
  workspaceRunId: string;
}

function workspaceRunLaunchRecoveryPayload(payload: unknown): WorkspaceRunLaunchRecoveryPayload {
  const task = 'workspace-run-launch-recovery';
  const object = objectPayload(payload, task);
  rejectUnknownKeys(object, ['sessionId', 'workspaceRunId'], task);
  return {
    sessionId: requiredString(object, 'sessionId', task),
    workspaceRunId: requiredString(object, 'workspaceRunId', task),
  };
}

function workerConfigured(): boolean {
  return Boolean(process.env.WORKER_URL?.trim() && process.env.WORKER_SECRET?.trim());
}

async function chainWorkerTask(
  task: string,
  payload: unknown,
): Promise<true | null> {
  const queued = await enqueueWorkerTask(task, payload);
  // A worker queue job that was accepted and then failed to chain must retry
  // this message. Running the complete session inline here can overlap a
  // remotely accepted enqueue and execute steps twice.
  if (!queued && workerConfigured()) {
    throw new Error(`Cloudflare queue did not accept ${task}`);
  }
  return queued;
}

export const WORKER_TASKS: Record<string, TaskHandler> = {
  /** Health probe — lets ops verify the full app→queue→worker→app loop:
   *  `enqueueWorkerTask('noop', {echo:'hi'})` should land in the worker log
   *  and return the payload here. */
  noop: async (payload) => ({ ok: true, echo: payload ?? null, at: new Date().toISOString() }),

  /**
   * Master-tick heartbeat. Called DIRECTLY by the worker's scheduled() handler
   * on every firing (not via the queue), so the recorded timestamp proves the
   * Cloudflare cron trigger fired even if queue delivery is broken. The
   * background-readiness diagnostics read it and report a stale tick as down —
   * this is the check whose absence hid a dead scheduler for 60 days.
   */
  'worker-heartbeat': async (payload) => {
    const at =
      typeof (payload as { at?: unknown } | null)?.at === 'string'
        ? (payload as { at: string }).at
        : new Date().toISOString();
    await recordWorkerTick(at);
    return { ok: true, at };
  },

  /** Work session, plan phase. just_go sessions land in 'running' and chain
   *  straight into step execution — one queued job per step. */
  'work-session-plan': async (payload) => {
    const input = workSessionPayload(payload, 'work-session-plan');
    const status = input.workspaceRunId
      ? await planSession(input.sessionId, input.workspaceRunId)
      : await planSession(input.sessionId);
    if (status === 'running') {
      const nextPayload = input.workspaceRunId
        ? { sessionId: input.sessionId, workspaceRunId: input.workspaceRunId }
        : { sessionId: input.sessionId };
      const queued = await chainWorkerTask('work-session-advance', nextPayload);
      // Without a configured queue this handler can only be exercised by a
      // local/direct invocation, so preserve the preview fallback.
      if (!queued) {
        if (input.workspaceRunId) await executeSession(input.sessionId, input.workspaceRunId);
        else await executeSession(input.sessionId);
      }
      return { sessionId: input.sessionId, status, chained: Boolean(queued) };
    }
    return { sessionId: input.sessionId, status };
  },

  /** Work session, one step per job. Re-enqueues itself while steps remain,
   *  so a 6-step session is 7 short queued jobs (6 steps + the artifact),
   *  each with its own retry budget — never one long fragile invocation. */
  'work-session-advance': async (payload) => {
    const input = workSessionPayload(payload, 'work-session-advance');
    const progress = input.workspaceRunId
      ? await advanceSession(input.sessionId, input.workspaceRunId)
      : await advanceSession(input.sessionId);
    if (progress === 'more') {
      const nextPayload = input.workspaceRunId
        ? { sessionId: input.sessionId, workspaceRunId: input.workspaceRunId }
        : { sessionId: input.sessionId };
      const queued = await chainWorkerTask('work-session-advance', nextPayload);
      if (!queued) {
        if (input.workspaceRunId) await executeSession(input.sessionId, input.workspaceRunId);
        else await executeSession(input.sessionId); // local/direct preview fallback
      }
      return { sessionId: input.sessionId, progress, chained: Boolean(queued) };
    }
    return { sessionId: input.sessionId, progress };
  },

  /** Durable wake-up for one pre-existing/future explicitly-approved legacy
   * action. The database lease is the authority; queue delivery alone cannot
   * execute a side effect. Product proposal/review entry points remain off. */
  'work-session-action-execute': async (payload) => {
    const input = workSessionActionPayload(payload);
    return executeApprovedWorkSessionAction(input);
  },

  /** Private terminal continuation dispatch. The claim/lease and Modal
   * callback lifecycle remain in the server module; this handler only enters
   * that idempotent dispatch after validating the tenant-scoped identifiers.
   */
  'workspace-run-task': async (payload) => {
    const input = workspaceRunTaskPayload(payload, 'workspace-run-task');
    await dispatchWorkspaceRunTask(input);
    return input;
  },

  /** Delayed lease recovery for a private terminal continuation. It uses the
   * same idempotent dispatcher as the initial task and therefore never trusts
   * a delayed message as proof that Modal accepted the launch.
   */
  'workspace-run-task-recovery': async (payload) => {
    const input = workspaceRunTaskPayload(payload, 'workspace-run-task-recovery');
    await dispatchWorkspaceRunTask(input);
    return input;
  },

  /** A delayed message is only a wake-up signal. The token-fenced database
   * authority checks the accepted timestamp and current lifecycle state before
   * it can terminal-fail a launch that never started or never reached a
   * terminal callback inside the bounded runtime window. */
  'workspace-run-task-accepted-silence-timeout': async (payload) => {
    const input = workspaceRunTaskAcceptedSilencePayload(payload);
    const failed = await failSilentAcceptedWorkspaceRunTask(input);
    // A late Modal start can be younger than the fixed runtime threshold at
    // this first wake. Re-arm only while the exact token is still running;
    // terminal, cancelled, and replaced attempts end here without a loop.
    const rearmed = failed ? false : await rearmRunningWorkspaceTaskTimeout(input);
    return { ...input, failed, rearmed };
  },

  /** Delayed recovery for the parent Workspace Run launch lease. Re-enter the
   * WorkSession state machine with the expected run id so a stale/replayed
   * message cannot advance an unrelated session.
   */
  'workspace-run-launch-recovery': async (payload) => {
    const input = workspaceRunLaunchRecoveryPayload(payload);
    const progress = await advanceSession(input.sessionId, input.workspaceRunId);
    return { ...input, progress };
  },
};
