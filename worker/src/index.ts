/**
 * Chippi background worker — the always-on process that makes background work
 * real regardless of any browser tab or serverless scheduler.
 *
 * Architecture (BullMQ over Redis):
 *
 *   ticks queue  — recurring jobs (worker/src/schedule.ts). On boot the
 *                  worker upserts one BullMQ job scheduler per entry and
 *                  deletes stale ones, then processes each tick by invoking
 *                  the app route with `Authorization: Bearer ${CRON_SECRET}`.
 *                  The route owns the work + its Sentry monitoring; the
 *                  worker owns firing, retries (3, exponential backoff), and
 *                  run history in Redis.
 *
 *   tasks queue  — agentic job offload. The app enqueues named tasks
 *                  (lib/queue.ts → enqueueWorkerTask) and this worker
 *                  executes them by POSTing /api/worker/execute with
 *                  `Authorization: Bearer ${WORKER_SECRET}`. Retries and
 *                  backoff come free from BullMQ.
 *
 *   heartbeat    — `chippi:worker:heartbeat` refreshed every 30s (90s TTL)
 *                  so the app can tell whether a worker is actually alive
 *                  instead of assuming.
 *
 * Deploy anywhere a Node process can run continuously (Railway / Render /
 * Fly.io — see docs/WORKER.md). Env:
 *   REDIS_URL      required — Redis connection string (Upstash/Railway/etc).
 *   APP_BASE_URL   required — e.g. https://www.usechippi.com
 *   CRON_SECRET    required — same value the Vercel app holds.
 *   WORKER_SECRET  required — same value the Vercel app holds.
 *   TICK_TIMEOUT_MS optional — per-tick HTTP timeout (default 290s, just
 *                   under the app's maxDuration=300 routes).
 */

import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { RECURRING_JOBS } from './schedule';

const REDIS_URL = process.env.REDIS_URL;
const APP_BASE_URL = (process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const WORKER_SECRET = process.env.WORKER_SECRET ?? '';
const TICK_TIMEOUT_MS = Number(process.env.TICK_TIMEOUT_MS ?? 290_000);

// Fail fast and loud — a worker booted without its env silently doing
// nothing is exactly the failure mode this service exists to end.
const missing = [
  !REDIS_URL && 'REDIS_URL',
  !APP_BASE_URL && 'APP_BASE_URL',
  !CRON_SECRET && 'CRON_SECRET',
  !WORKER_SECRET && 'WORKER_SECRET',
].filter(Boolean);
if (missing.length) {
  console.error(`[worker] refusing to start — missing env: ${missing.join(', ')}`);
  process.exit(1);
}

export const TICKS_QUEUE = 'chippi-ticks';
export const TASKS_QUEUE = 'chippi-tasks';
const HEARTBEAT_KEY = 'chippi:worker:heartbeat';

const connection = new IORedis(REDIS_URL!, {
  // BullMQ requirement: blocking commands must never give up mid-wait.
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const ticksQueue = new Queue(TICKS_QUEUE, { connection });

/** HTTP call with timeout; throws on non-2xx so BullMQ retries and the
 *  failure is visible in the queue's run history instead of swallowed. */
async function callApp(
  path: string,
  init: RequestInit & { label: string },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TICK_TIMEOUT_MS);
  try {
    const res = await fetch(`${APP_BASE_URL}${path}`, { ...init, signal: controller.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      throw new Error(`[worker] ${init.label} ${path} → ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Reconcile Redis job schedulers with the manifest: upsert every current
 *  entry, delete anything left over from a previous deploy. */
async function reconcileSchedulers(): Promise<void> {
  const existing = await ticksQueue.getJobSchedulers(0, 1000);
  const wanted = new Set(RECURRING_JOBS.map((j) => j.id));

  for (const s of existing) {
    if (s.key && !wanted.has(s.key)) {
      await ticksQueue.removeJobScheduler(s.key);
      console.log(`[worker] removed stale scheduler ${s.key}`);
    }
  }
  for (const jobDef of RECURRING_JOBS) {
    await ticksQueue.upsertJobScheduler(
      jobDef.id,
      { pattern: jobDef.pattern, utc: true },
      {
        name: jobDef.id,
        data: { path: jobDef.path },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 100 },
        },
      },
    );
  }
  console.log(`[worker] ${RECURRING_JOBS.length} recurring jobs scheduled`);
}

const tickWorker = new Worker(
  TICKS_QUEUE,
  async (job: Job<{ path: string }>) => {
    const body = await callApp(job.data.path, {
      method: 'GET',
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      label: 'tick',
    });
    console.log(`[worker] tick ${job.data.path} ok`);
    return body;
  },
  // Ticks are independent routes — a slow briefing must not delay lead SLAs.
  { connection, concurrency: 4 },
);

const taskWorker = new Worker(
  TASKS_QUEUE,
  async (job: Job<{ task: string; payload?: unknown }>) => {
    const body = await callApp('/api/worker/execute', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WORKER_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task: job.data.task, payload: job.data.payload ?? null }),
      label: `task:${job.data.task}`,
    });
    console.log(`[worker] task ${job.data.task} ok`);
    return body;
  },
  { connection, concurrency: 8 },
);

for (const w of [tickWorker, taskWorker]) {
  w.on('failed', (job, err) => {
    console.error(`[worker] job failed (${job?.name ?? 'unknown'}, attempt ${job?.attemptsMade}):`, err.message);
  });
}

const heartbeat = setInterval(() => {
  connection.set(HEARTBEAT_KEY, new Date().toISOString(), 'EX', 90).catch(() => {});
}, 30_000);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} — draining…`);
  clearInterval(heartbeat);
  await Promise.allSettled([tickWorker.close(), taskWorker.close(), ticksQueue.close()]);
  await connection.quit().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

reconcileSchedulers()
  .then(() => console.log(`[worker] up — app=${APP_BASE_URL} ticks+tasks consuming`))
  .catch((err) => {
    console.error('[worker] failed to schedule recurring jobs:', err);
    process.exit(1);
  });
