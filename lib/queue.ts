/**
 * App-side handle to the background worker's Redis queues (server-only).
 *
 * `enqueueWorkerTask(task, payload)` pushes a named job onto the
 * `chippi-tasks` queue; the always-on worker (worker/src/index.ts) consumes
 * it and executes the matching handler from lib/jobs/tasks.ts by calling
 * back into /api/worker/execute. Retries/backoff/run-history live in BullMQ.
 *
 * Degrades honestly: without REDIS_URL the queue is inert — enqueue returns
 * null and logs once, callers must treat null as "not offloaded" and either
 * run inline or surface the degraded state. Never pretend a job was queued.
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const TASKS_QUEUE = 'chippi-tasks';

let queue: Queue | null | undefined;
let warned = false;

function getTaskQueue(): Queue | null {
  if (queue !== undefined) return queue;
  const url = process.env.REDIS_URL;
  if (!url) {
    if (!warned) {
      console.warn('[queue] REDIS_URL not set — background task offload is inert.');
      warned = true;
    }
    queue = null;
    return queue;
  }
  const connection = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
  queue = new Queue(TASKS_QUEUE, { connection });
  return queue;
}

export interface EnqueueOptions {
  /** Delay before the worker picks the job up, in ms. */
  delayMs?: number;
  /** Override retry attempts (worker default: 3). */
  attempts?: number;
  /** Idempotency: two enqueues with the same jobId collapse into one. */
  jobId?: string;
}

/**
 * Queue a named task for the background worker. Returns the BullMQ job id,
 * or null when the queue is unavailable (no REDIS_URL / Redis down).
 */
export async function enqueueWorkerTask(
  task: string,
  payload: unknown = null,
  opts: EnqueueOptions = {},
): Promise<string | null> {
  const q = getTaskQueue();
  if (!q) return null;
  try {
    const job = await q.add(
      task,
      { task, payload },
      {
        delay: opts.delayMs,
        attempts: opts.attempts ?? 3,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
        ...(opts.jobId ? { jobId: opts.jobId } : {}),
      },
    );
    return job.id ?? null;
  } catch (err) {
    console.error('[queue] enqueue failed:', err);
    return null;
  }
}

/** Worker liveness, from the heartbeat the worker refreshes every 30s.
 *  Null = no worker seen (or Redis unavailable). */
export async function workerHeartbeat(): Promise<string | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const redis = new IORedis(url, { maxRetriesPerRequest: 1, connectTimeout: 3_000, lazyConnect: true });
    await redis.connect();
    const beat = await redis.get('chippi:worker:heartbeat');
    redis.disconnect();
    return beat;
  } catch {
    return null;
  }
}
