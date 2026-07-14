/**
 * Inngest serve endpoint. Inngest calls this route to execute functions, one
 * HTTP invocation per step. Node runtime — the steps touch Wasabi (AWS SDK)
 * and Composio.
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
    // Scheduled ticks (formerly vercel.json crons) — see lib/inngest/cron-functions.ts.
    ...cronFunctions,
  ],
});
