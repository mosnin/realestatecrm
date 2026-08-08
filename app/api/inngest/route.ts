/**
 * Inngest serve endpoint. Inngest calls this route to execute functions, one
 * HTTP invocation per step. Node runtime — the steps touch Wasabi (AWS SDK)
 * and Composio.
 *
 * SCHEDULING LIVES IN THE BACKGROUND WORKER (worker/ service — BullMQ over
 * Redis, docs/WORKER.md), which invokes the app/api/cron/* routes with
 * `Authorization: Bearer CRON_SECRET`. The Inngest cron mirrors in
 * lib/inngest/cron-functions.ts are registered ONLY when
 * INNGEST_CRONS_ENABLED is set, so two schedulers can never double-tick a
 * route; event-driven functions (scheduled posts, Composio triggers, work
 * sessions) remain registered unconditionally.
 */

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import {
  publishScheduledPost,
  handleComposioTrigger,
  workSessionPlan,
  workSessionExecute,
} from '@/lib/inngest/functions';
import { cronFunctions } from '@/lib/inngest/cron-functions';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    publishScheduledPost,
    handleComposioTrigger,
    workSessionPlan,
    workSessionExecute,
    // Cron mirrors — opt-in only (see header note); Vercel cron is the
    // production scheduler.
    ...(process.env.INNGEST_CRONS_ENABLED ? cronFunctions : []),
  ],
});
