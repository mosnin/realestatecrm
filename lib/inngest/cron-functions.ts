/**
 * Inngest cron functions — the scheduler for the app/api/cron/* routes.
 *
 * Vercel cron is removed (vercel.json no longer declares a `crons` array);
 * these Inngest functions fire on the exact same 5-field crontab expressions
 * instead. Inngest cron triggers evaluate in UTC unless prefixed with `TZ=`,
 * and Vercel crons also evaluated in UTC, so tick times are unchanged.
 *
 * Each function does NOT reimplement its job. It invokes the existing route
 * handler in-process with a synthetic request carrying
 * `Authorization: Bearer ${CRON_SECRET}` — which preserves everything the
 * routes already guarantee and their tests pin:
 *
 *   - fail-closed auth (no CRON_SECRET on the server → the route 500s and the
 *     function throws → Inngest retries + Sentry check-in 'error')
 *   - monitorCron Sentry dead-man check-ins (the wrapper runs unchanged)
 *   - per-route kill-switch flags (e.g. CRON_ROUTINES_DISABLED)
 *
 * The routes stay reachable over HTTP for manual ops runs:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/<slug>
 *
 * A non-2xx route response throws so Inngest retries (bounded: retries: 2).
 * Escape hatch: set INNGEST_CRONS_DISABLED (any non-empty value) and every
 * cron function returns { skipped: 'disabled' } without touching its route.
 */

import { NextRequest } from 'next/server';
import { inngest } from './client';

/** Shape every app/api/cron/* route module exposes (monitorCron-wrapped GET). */
interface CronRouteModule {
  GET: (req: NextRequest) => Promise<Response>;
}

export interface CronManifestEntry {
  /** Stable Inngest function id — renaming orphans the run history. */
  id: string;
  /** Route path (identical to the removed vercel.json `path`). */
  path: string;
  /** 5-field crontab, UTC (identical to the removed vercel.json `schedule`). */
  cron: string;
  /** Lazy route-module loader — a cron's heavy deps load only when it fires. */
  load: () => Promise<CronRouteModule>;
}

/**
 * One entry per cron that lived in vercel.json's `crons` array at cutover.
 * Schedules must stay byte-identical to what the routes' monitorCron calls
 * declare — Sentry tracks missed runs against that crontab.
 */
export const CRON_MANIFEST: readonly CronManifestEntry[] = [
  {
    id: 'cron-lead-sla',
    path: '/api/cron/lead-sla',
    cron: '*/15 * * * *',
    load: () => import('@/app/api/cron/lead-sla/route'),
  },
  {
    id: 'cron-follow-up-reminders',
    path: '/api/cron/follow-up-reminders',
    cron: '0 9 * * *',
    load: () => import('@/app/api/cron/follow-up-reminders/route'),
  },
  {
    id: 'cron-deal-checklist-reminders',
    path: '/api/cron/deal-checklist-reminders',
    cron: '0 8 * * *',
    load: () => import('@/app/api/cron/deal-checklist-reminders/route'),
  },
  {
    id: 'cron-tour-reminders',
    path: '/api/cron/tour-reminders',
    cron: '*/15 * * * *',
    load: () => import('@/app/api/cron/tour-reminders/route'),
  },
  {
    id: 'cron-broker-weekly-report',
    path: '/api/cron/broker-weekly-report',
    cron: '0 9 * * 1',
    load: () => import('@/app/api/cron/broker-weekly-report/route'),
  },
  {
    id: 'cron-agent-sweep',
    path: '/api/cron/agent-sweep',
    cron: '0 */4 * * *',
    load: () => import('@/app/api/cron/agent-sweep/route'),
  },
  {
    id: 'cron-agent-run-reconcile',
    path: '/api/cron/agent-run-reconcile',
    cron: '*/15 * * * *',
    load: () => import('@/app/api/cron/agent-run-reconcile/route'),
  },
  {
    id: 'cron-agent-tasks',
    path: '/api/cron/agent-tasks',
    cron: '*/15 * * * *',
    load: () => import('@/app/api/cron/agent-tasks/route'),
  },
  {
    id: 'cron-routines',
    path: '/api/cron/routines',
    cron: '0 * * * *',
    load: () => import('@/app/api/cron/routines/route'),
  },
  {
    id: 'cron-workflows',
    path: '/api/cron/workflows',
    cron: '0 * * * *',
    load: () => import('@/app/api/cron/workflows/route'),
  },
  {
    id: 'cron-scheduled-messages',
    path: '/api/cron/scheduled-messages',
    cron: '*/15 * * * *',
    load: () => import('@/app/api/cron/scheduled-messages/route'),
  },
  {
    id: 'cron-broker-routines',
    path: '/api/cron/broker-routines',
    cron: '0 * * * *',
    load: () => import('@/app/api/cron/broker-routines/route'),
  },
  {
    id: 'cron-draft-outcomes',
    path: '/api/cron/draft-outcomes',
    cron: '0 3 * * *',
    load: () => import('@/app/api/cron/draft-outcomes/route'),
  },
  {
    id: 'cron-sweep-paused-runs',
    path: '/api/cron/sweep-paused-runs',
    cron: '0 4 * * *',
    load: () => import('@/app/api/cron/sweep-paused-runs/route'),
  },
  {
    id: 'cron-cleanup',
    path: '/api/cron/cleanup',
    cron: '0 3 * * *',
    load: () => import('@/app/api/cron/cleanup/route'),
  },
  {
    id: 'cron-storage-gc',
    path: '/api/cron/storage-gc',
    cron: '0 5 * * *',
    load: () => import('@/app/api/cron/storage-gc/route'),
  },
  {
    id: 'cron-seat-reconcile',
    path: '/api/cron/seat-reconcile',
    cron: '30 4 * * *',
    load: () => import('@/app/api/cron/seat-reconcile/route'),
  },
  {
    id: 'cron-daily-briefing',
    path: '/api/cron/daily-briefing',
    cron: '0 * * * *',
    load: () => import('@/app/api/cron/daily-briefing/route'),
  },
  {
    id: 'cron-notification-digest',
    path: '/api/cron/notification-digest',
    cron: '0 8 * * *',
    load: () => import('@/app/api/cron/notification-digest/route'),
  },
  {
    id: 'cron-next-moves',
    path: '/api/cron/next-moves',
    cron: '0 10 * * *',
    load: () => import('@/app/api/cron/next-moves/route'),
  },
  {
    id: 'cron-extraction-backfill',
    path: '/api/cron/extraction-backfill',
    cron: '15 * * * *',
    load: () => import('@/app/api/cron/extraction-backfill/route'),
  },
  {
    id: 'cron-review-nudge',
    path: '/api/cron/review-nudge',
    cron: '30 16 * * *',
    load: () => import('@/app/api/cron/review-nudge/route'),
  },
  {
    id: 'cron-drip-tick',
    path: '/api/drip/tick',
    cron: '*/30 * * * *',
    load: () => import('@/app/api/drip/tick/route'),
  },
];

/**
 * Invoke one cron route the way Vercel cron used to: a GET carrying the
 * Bearer secret. Returns the route's status + parsed JSON body (the tick
 * summary) so it lands in Inngest run history; throws on any non-2xx so
 * Inngest retries and the failure is visible.
 *
 * Deliberately does NOT pre-check CRON_SECRET: when it's unset the route
 * itself fail-closes with a 500, and that (thrown, retried, Sentry-visible)
 * is the honest signal — not a silent skip.
 */
export async function runCronTick(
  entry: Pick<CronManifestEntry, 'path' | 'load'>,
): Promise<{ status: number; body: unknown }> {
  const mod = await entry.load();
  const req = new NextRequest(`https://cron.internal${entry.path}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  });
  const res = await mod.GET(req);

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (shouldn't happen — every cron route returns JSON).
  }

  if (!res.ok) {
    throw new Error(
      `[inngest-cron] ${entry.path} returned ${res.status}: ${JSON.stringify(body)}`,
    );
  }

  console.log(`[inngest-cron] ${entry.path} tick complete`, { status: res.status, body });
  return { status: res.status, body };
}

function makeCronFunction(entry: CronManifestEntry) {
  return inngest.createFunction(
    {
      id: entry.id,
      retries: 2,
      // Same 5-field expression the vercel.json entry carried; Inngest
      // evaluates it in UTC (no TZ= prefix), matching Vercel's semantics.
      triggers: [{ cron: entry.cron }],
    },
    async () => {
      if (process.env.INNGEST_CRONS_DISABLED) {
        return { skipped: 'disabled' };
      }
      return runCronTick(entry);
    },
  );
}

/** All scheduled cron functions — registered in app/api/inngest/route.ts. */
export const cronFunctions = CRON_MANIFEST.map(makeCronFunction);
