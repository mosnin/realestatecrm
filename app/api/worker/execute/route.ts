/**
 * Execution callback for the background worker (worker/src/index.ts).
 *
 * The worker consumes the `chippi-tasks` Redis queue and POSTs each job here
 * with `Authorization: Bearer ${WORKER_SECRET}`; this route dispatches to the
 * matching handler in lib/jobs/tasks.ts. Splitting queue (worker) from
 * execution (here) keeps handlers inside the app runtime — full lib/* access,
 * normal tenant-scoping rules — while the worker stays a thin, dependency-free
 * process.
 *
 * Fail-closed like the cron routes: no WORKER_SECRET on the server → 500
 * (misconfiguration must be loud, never an open endpoint); wrong/missing
 * bearer → 401. Non-2xx responses make the worker's BullMQ job retry.
 */

import { NextResponse } from 'next/server';
import { WORKER_TASKS } from '@/lib/jobs/tasks';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.WORKER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'WORKER_SECRET is not configured.' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { task?: unknown; payload?: unknown }
    | null;
  const task = typeof body?.task === 'string' ? body.task : null;
  if (!task || !(task in WORKER_TASKS)) {
    return NextResponse.json({ error: `Unknown task: ${String(task)}` }, { status: 400 });
  }

  try {
    const result = await WORKER_TASKS[task](body?.payload ?? null);
    return NextResponse.json({ ok: true, task, result });
  } catch (err) {
    // 500 → the worker's job fails → BullMQ retries with backoff.
    const message = err instanceof Error ? err.message : 'Task failed.';
    return NextResponse.json({ ok: false, task, error: message }, { status: 500 });
  }
}
