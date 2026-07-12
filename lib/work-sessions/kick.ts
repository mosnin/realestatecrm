import 'server-only';
/**
 * Work-session dispatch — how a session advances from an API route.
 *
 * Primary path: an Inngest event ('work-session/plan' | 'work-session/execute')
 * → the durable functions in lib/inngest/functions.ts. Fallback (previews and
 * any env without INNGEST_EVENT_KEY): run the same engine phase inline via
 * next/server after(), so the feature works everywhere — just without
 * Inngest's retries/durability. One contract either way: "advance this id".
 */

import { after } from 'next/server';
import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';
import { planSession, executeSession } from './engine';

function inngestConfigured(): boolean {
  return Boolean(process.env.INNGEST_EVENT_KEY);
}

/** Plan phase; when planning lands in 'running' (just_go), execution follows. */
export async function kickPlan(sessionId: string): Promise<void> {
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
