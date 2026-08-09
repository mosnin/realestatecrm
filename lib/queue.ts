/**
 * App-side handle to the Cloudflare background worker (server-only).
 *
 * `enqueueWorkerTask(task, payload)` POSTs the job to the Worker's /enqueue
 * endpoint (Bearer WORKER_SECRET); the Worker pushes it onto Cloudflare
 * Queues and its consumer executes the matching handler from
 * lib/jobs/tasks.ts by calling back into /api/worker/execute. Retries with
 * backoff and the dead-letter queue live on the Cloudflare side
 * (worker/wrangler.toml).
 *
 * Degrades honestly: without WORKER_URL + WORKER_SECRET the queue is inert —
 * enqueue returns null and logs once. Callers must treat null as "not
 * offloaded" and either run inline or surface the degraded state. Never
 * pretend a job was queued.
 */

let warned = false;

function workerConfig(): { url: string; secret: string } | null {
  const url = process.env.WORKER_URL?.replace(/\/$/, '');
  const secret = process.env.WORKER_SECRET;
  if (!url || !secret) {
    if (!warned) {
      console.warn('[queue] WORKER_URL/WORKER_SECRET not set — background task offload is inert.');
      warned = true;
    }
    return null;
  }
  return { url, secret };
}

export interface EnqueueOptions {
  /** Delay before the worker picks the job up, in seconds (max 12h on CF Queues). */
  delaySeconds?: number;
}

/**
 * Queue a named task for the background worker. Returns true when the worker
 * accepted the job, or null when offload is unavailable (unconfigured,
 * worker unreachable, or rejected) — never a false success.
 */
export async function enqueueWorkerTask(
  task: string,
  payload: unknown = null,
  opts: EnqueueOptions = {},
): Promise<true | null> {
  const cfg = workerConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/enqueue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task, payload, delaySeconds: opts.delaySeconds }),
    });
    if (!res.ok) {
      console.error(`[queue] worker rejected ${task}: ${res.status}`);
      return null;
    }
    return true;
  } catch (err) {
    console.error('[queue] enqueue failed:', err);
    return null;
  }
}

/**
 * Worker liveness: hits the Worker's /health endpoint. Returns its status
 * (with the recurring-job count it's carrying) or null when unreachable.
 */
export async function workerHealth(): Promise<{ ok: boolean; scheduledJobs: number } | null> {
  const url = process.env.WORKER_URL?.replace(/\/$/, '');
  if (!url) return null;
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; scheduledJobs?: number };
    return { ok: body.ok === true, scheduledJobs: body.scheduledJobs ?? 0 };
  } catch {
    return null;
  }
}
