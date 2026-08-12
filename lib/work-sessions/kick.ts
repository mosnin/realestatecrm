import 'server-only';
/**
 * Work-session dispatch — how a session advances from an API route.
 *
 * Priority order, most durable first:
 *   1. Cloudflare queue (WORKER_URL + WORKER_SECRET): enqueue a worker task —
 *      the worker advances the session ONE STEP PER QUEUED JOB and re-enqueues
 *      until done (lib/jobs/tasks.ts), so every step gets its own retry
 *      budget and the session survives any crash between steps.
 *   2. Inngest event — legacy durable path, only when its keys are configured.
 *   3. Inline via next/server after() — previews and bare envs: same engine,
 *      same state machine, just without cross-invocation durability.
 *
 * One contract everywhere: "advance this session id". enqueueWorkerTask
 * returns null (never throws, never lies) when the queue is unconfigured or
 * unreachable, so a dead worker falls through to the next path instead of
 * stranding the session.
 */

import { after } from 'next/server';
import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';
import { enqueueWorkerTask } from '@/lib/queue';
import { planSession, executeSession } from './engine';

function inngestConfigured(): boolean {
  return Boolean(process.env.INNGEST_EVENT_KEY);
}

/** Plan phase; when planning lands in 'running' (just_go), execution follows. */
export async function kickPlan(sessionId: string): Promise<void> {
  if (await enqueueWorkerTask('work-session-plan', { sessionId })) return;
  if (inngestConfigured()) {
    await inngest.send({ name: 'work-session/plan', data: { sessionId } });
    return;
  }
  after(async () => {
    try {
      const status = await planSession(sessionId);
      if (status === 'running') await executeSession(sessionId);
    } catch (err) {
      logger.error('[work-sessions] inline plan failed', { sessionId }, err);
    }
  });
}

/** Execute phase (after approval, or resumed after an answered question). */
export async function kickExecute(sessionId: string): Promise<void> {
  if (await enqueueWorkerTask('work-session-advance', { sessionId })) return;
  if (inngestConfigured()) {
    await inngest.send({ name: 'work-session/execute', data: { sessionId } });
    return;
  }
  after(async () => {
    try {
      await executeSession(sessionId);
    } catch (err) {
      logger.error('[work-sessions] inline execute failed', { sessionId }, err);
    }
  });
}
