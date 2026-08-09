/**
 * Chippi background worker — Cloudflare Worker.
 *
 * Makes background work run on Cloudflare's infrastructure, independent of
 * any browser tab and of the app's serverless functions:
 *
 *   scheduled() — the 5-minute master trigger (wrangler.toml). Each firing checks
 *     every recurring job (./schedule.ts) against the current UTC instant
 *     and enqueues one queue message per due job. Per-job queue delivery
 *     means per-job retries — a failing briefing never blocks lead SLAs.
 *
 *   queue() — the chippi-jobs consumer. Executes:
 *       tick  → GET  ${APP_BASE_URL}${path} with `Bearer ${CRON_SECRET}`
 *       task  → POST ${APP_BASE_URL}/api/worker/execute with
 *               `Bearer ${WORKER_SECRET}` (handlers: lib/jobs/tasks.ts)
 *     Failures retry with exponential backoff (max_retries in wrangler.toml),
 *     then land in the chippi-dlq dead-letter queue instead of vanishing.
 *
 *   fetch() — POST /enqueue: the app's producer entrypoint (lib/queue.ts →
 *     enqueueWorkerTask), auth `Bearer ${WORKER_SECRET}`, supports
 *     delaySeconds. GET /health: liveness + schedule count for monitoring.
 *
 * Secrets (wrangler secret put): CRON_SECRET, WORKER_SECRET — the same
 * values the Vercel app holds. Vars: APP_BASE_URL.
 */

import { RECURRING_JOBS } from './schedule';
import { cronMatches } from './cron-match';

export interface Env {
  JOBS: Queue<JobMessage>;
  APP_BASE_URL: string;
  CRON_SECRET: string;
  WORKER_SECRET: string;
}

export type JobMessage =
  | { type: 'tick'; id: string; path: string }
  | { type: 'task'; task: string; payload: unknown };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

async function callApp(env: Env, path: string, init: RequestInit, label: string): Promise<void> {
  const res = await fetch(`${env.APP_BASE_URL.replace(/\/$/, '')}${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${label} ${path} → ${res.status}: ${body.slice(0, 500)}`);
  }
}

async function processMessage(env: Env, msg: JobMessage): Promise<void> {
  if (msg.type === 'tick') {
    await callApp(
      env,
      msg.path,
      { method: 'GET', headers: { Authorization: `Bearer ${env.CRON_SECRET}` } },
      `tick:${msg.id}`,
    );
    console.log(`[worker] tick ${msg.id} ok`);
    return;
  }
  await callApp(
    env,
    '/api/worker/execute',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WORKER_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task: msg.task, payload: msg.payload ?? null }),
    },
    `task:${msg.task}`,
  );
  console.log(`[worker] task ${msg.task} ok`);
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const now = new Date(controller.scheduledTime);
    const due = RECURRING_JOBS.filter((jobDef) => cronMatches(jobDef.pattern, now));
    for (const jobDef of due) {
      await env.JOBS.send({ type: 'tick', id: jobDef.id, path: jobDef.path });
    }
    console.log(
      `[worker] master tick ${now.toISOString()} — enqueued ${due.length}/${RECURRING_JOBS.length} jobs`,
    );
  },

  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processMessage(env, message.body);
        message.ack();
      } catch (err) {
        console.error(
          `[worker] job failed (attempt ${message.attempts}):`,
          err instanceof Error ? err.message : err,
        );
        // Exponential backoff: 30s, 60s, 120s, capped 10 min. After
        // max_retries the message lands in chippi-dlq (wrangler.toml).
        message.retry({ delaySeconds: Math.min(30 * 2 ** (message.attempts - 1), 600) });
      }
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, scheduledJobs: RECURRING_JOBS.length, at: new Date().toISOString() });
    }

    if (url.pathname === '/enqueue' && request.method === 'POST') {
      if (request.headers.get('authorization') !== `Bearer ${env.WORKER_SECRET}`) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const body = (await request.json().catch(() => null)) as {
        task?: unknown;
        payload?: unknown;
        delaySeconds?: unknown;
      } | null;
      if (!body || typeof body.task !== 'string' || !body.task) {
        return json({ error: 'task (string) is required' }, 400);
      }
      const delaySeconds =
        typeof body.delaySeconds === 'number' && body.delaySeconds > 0
          ? Math.min(Math.floor(body.delaySeconds), 42_300) // CF Queues max delay: 12h
          : undefined;
      await env.JOBS.send(
        { type: 'task', task: body.task, payload: body.payload ?? null },
        delaySeconds ? { delaySeconds } : undefined,
      );
      return json({ ok: true, queued: body.task, delaySeconds: delaySeconds ?? 0 });
    }

    return json({ error: 'Not found' }, 404);
  },
};
