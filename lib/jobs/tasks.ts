/**
 * Named background tasks the worker can execute — the registry behind
 * /api/worker/execute.
 *
 * To offload work from a request path:
 *   1. Add a handler here: `myTask: async (payload) => { ... }`.
 *   2. From app code: `await enqueueWorkerTask('myTask', { ... })`
 *      (lib/queue.ts). The worker picks it up from Redis with retries and
 *      backoff and calls back into this registry.
 *
 * Handlers run inside a normal Vercel invocation (auth'd by WORKER_SECRET),
 * so they have full access to lib/* — Supabase, LLM client, email, etc.
 * Tenant scoping rules apply exactly as in any request path: payloads must
 * carry the spaceId/brokerageId and every query must scope by it.
 */

export type TaskHandler = (payload: unknown) => Promise<unknown>;

export const WORKER_TASKS: Record<string, TaskHandler> = {
  /** Health probe — lets ops verify the full app→queue→worker→app loop:
   *  `enqueueWorkerTask('noop', {echo:'hi'})` should land in the worker log
   *  and return the payload here. */
  noop: async (payload) => ({ ok: true, echo: payload ?? null, at: new Date().toISOString() }),
};
