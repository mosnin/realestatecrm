import 'server-only';
/**
 * Work-session dispatch — how a session advances from an API route.
 *
 * Exactly one rail is selected by configuration:
 *   1. Cloudflare queue (WORKER_URL + WORKER_SECRET): enqueue a worker task —
 *      the worker advances the session ONE STEP PER QUEUED JOB and re-enqueues
 *      until done (lib/jobs/tasks.ts), so every step gets its own retry
 *      budget and the session survives any crash between steps.
 *   2. Inngest event — legacy durable path, only when its keys are configured.
 *   3. Inline via next/server after() — previews and bare envs: same engine,
 *      same state machine, just without cross-invocation durability.
 *
 * One contract everywhere: "advance this session id". When Cloudflare is
 * configured, an enqueue failure is surfaced and NEVER falls through to a
 * second rail: a timeout can occur after remote acceptance, and dual dispatch
 * would race the same session. Fallbacks are selected only when Cloudflare is
 * unconfigured.
 */

import { after } from 'next/server';
import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';
import { enqueueWorkerTask, workerQueueConfigured } from '@/lib/queue';
import { planSession, executeSession } from './engine';

function inngestConfigured(): boolean {
  return Boolean(
    process.env.INNGEST_EVENT_KEY?.trim() &&
      process.env.INNGEST_SIGNING_KEY?.trim(),
  );
}

/** Plan phase; when planning lands in 'running' (just_go), execution follows. */
export async function kickPlan(sessionId: string): Promise<void> {
  if (workerQueueConfigured()) {
    if (await enqueueWorkerTask('work-session-plan', { sessionId })) return;
    throw new Error('Cloudflare queue did not accept work-session-plan.');
  }
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
  if (workerQueueConfigured()) {
    if (await enqueueWorkerTask('work-session-advance', { sessionId })) return;
    throw new Error('Cloudflare queue did not accept work-session-advance.');
  }
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
