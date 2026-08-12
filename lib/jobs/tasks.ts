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

import { planSession, executeSession, advanceSession } from '@/lib/work-sessions/engine';
import { enqueueWorkerTask, recordWorkerTick } from '@/lib/queue';

export type TaskHandler = (payload: unknown) => Promise<unknown>;

function sessionIdOf(payload: unknown): string {
  const id = (payload as { sessionId?: unknown } | null)?.sessionId;
  if (typeof id !== 'string' || !id) throw new Error('sessionId (string) is required');
  return id;
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
    const sessionId = sessionIdOf(payload);
    const status = await planSession(sessionId);
    if (status === 'running') {
      const queued = await enqueueWorkerTask('work-session-advance', { sessionId });
      // The queue accepted THIS job seconds ago; if re-enqueue still fails,
      // finish inline rather than strand a session marked 'running'.
      if (!queued) await executeSession(sessionId);
      return { sessionId, status, chained: Boolean(queued) };
    }
    return { sessionId, status };
  },

  /** Work session, one step per job. Re-enqueues itself while steps remain,
   *  so a 6-step session is 7 short queued jobs (6 steps + the artifact),
   *  each with its own retry budget — never one long fragile invocation. */
  'work-session-advance': async (payload) => {
    const sessionId = sessionIdOf(payload);
    const progress = await advanceSession(sessionId);
    if (progress === 'more') {
      const queued = await enqueueWorkerTask('work-session-advance', { sessionId });
      if (!queued) await executeSession(sessionId); // same never-strand fallback
      return { sessionId, progress, chained: Boolean(queued) };
    }
    return { sessionId, progress };
  },
};
