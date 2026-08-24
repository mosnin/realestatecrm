/**
 * Background-readiness diagnostics.
 *
 * Turns the silent "nothing runs in the background" problem into an explicit
 * checklist. Each prerequisite for autonomous / background execution is probed
 * for PRESENCE (never value — we read booleans off process.env and never echo a
 * secret) and reported as one of three states:
 *
 *   - ok       — configured and ready
 *   - degraded — works, but on a fallback / not the production path
 *   - missing  — a hard gap; the feature won't fire until it's set
 *
 * The headline distinction this surface exists to make: when Modal isn't
 * configured, routines and triggers STILL run via the in-process fallback
 * (lib/agent/run-instruction.ts). So "Modal not configured" is DEGRADED, not
 * broken — the realtor should be reassured the work still happens, just bounded
 * by the web function's duration. Inngest / Composio / cron, by contrast, have
 * no fallback: without them the corresponding path simply never fires, so those
 * are 'missing'.
 *
 * `getBackgroundReadiness` is pure-ish: it reads process.env and (when a
 * spaceId is given) runs ONE defensive Supabase query for recent activity. It
 * never throws — a query failure becomes a 'degraded' check carrying the error
 * detail, not an exception.
 */

import { supabase } from '@/lib/supabase';
import { redis, isRedisConfigured } from '@/lib/redis';
import { workerHealth, readWorkerTick } from '@/lib/queue';
import { CRON_MANIFEST } from '@/lib/inngest/cron-functions';
import { VERCEL_SAFETY_RAIL_CRONS } from '@/lib/jobs/vercel-safety-rail';

export type ReadinessStatus = 'ok' | 'degraded' | 'missing';

export interface ReadinessCheck {
  /** Stable machine key for the check (used as a React key / for tests). */
  key: string;
  /** Short human label. */
  label: string;
  status: ReadinessStatus;
  /** One-sentence explanation of the current state. */
  detail: string;
  /** What to do about it — present when there's an actionable fix. */
  fix?: string;
}

export type OverallStatus = 'ok' | 'degraded' | 'down';

export interface BackgroundReadiness {
  overall: OverallStatus;
  checks: ReadinessCheck[];
}

/** How recent a background run must be to count as "active". A daily routine
 *  plus slack means a run inside ~36h is healthy; older than that and we nudge
 *  ("routines exist but nothing has run lately"). */
const RECENT_RUN_WINDOW_MS = 36 * 60 * 60 * 1000;
/**
 * How old the worker's last master tick may be before the scheduler is
 * reported as down. The trigger fires every 5 minutes; 20 tolerates a few
 * best-effort misses without crying wolf, while still surfacing a genuinely
 * stopped scheduler within a third of an hour (not 60 days).
 */
const WORKER_TICK_STALE_MS = 20 * 60 * 1000;
const COMPOSIO_HEALTH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const COMPOSIO_WEBHOOK_HEALTH_KEY = 'composio:webhook:last-verified-at';

/** Presence-only — never the value. */
function isSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.length > 0;
}

/**
 * a. Autonomous executor — Modal webhook + the shared agent secret.
 *
 * NEVER 'missing': when these are unset, routines/triggers still run through the
 * in-process fallback (lib/agent/run-instruction.ts). Report that honestly as
 * 'degraded' so the realtor is reassured the work happens, just bounded by the
 * web function's duration.
 */
function checkExecutor(): ReadinessCheck {
  const ready = isSet('MODAL_WEBHOOK_URL') && isSet('AGENT_INTERNAL_SECRET');
  if (ready) {
    return {
      key: 'executor',
      label: 'Autonomous executor',
      status: 'ok',
      detail: 'Modal configured — long autonomous runs dispatch to a dedicated worker.',
    };
  }
  return {
    key: 'executor',
    label: 'Autonomous executor',
    status: 'degraded',
    detail:
      'In-process fallback active — routines and triggers run inside the web function. ' +
      'Fine for quick drafting; long runs benefit from Modal.',
    fix: 'Set MODAL_WEBHOOK_URL and AGENT_INTERNAL_SECRET to offload long runs to Modal.',
  };
}

/**
 * b. Chat offload (Modal). Optional like the executor — chat runs in-process
 * without it, which is fine until the background-chat phase lands.
 */
function checkChatOffload(): ReadinessCheck {
  if (isSet('MODAL_CHAT_URL')) {
    return {
      key: 'chat-offload',
      label: 'Chat offload (Modal)',
      status: 'ok',
      detail: 'Chat can offload to Modal for detached background turns.',
    };
  }
  return {
    key: 'chat-offload',
    label: 'Chat offload (Modal)',
    status: 'degraded',
    detail: 'Chat runs in-process — fine until the background-chat phase lands.',
    fix: 'Set MODAL_CHAT_URL to run chat turns on a dedicated worker.',
  };
}

/**
 * c. THE SCHEDULER (Cloudflare worker). The single most important check on
 * this page: every recurring job in the product fires from the worker's
 * scheduled trigger. If it is unconfigured, undeployed, or its trigger has
 * stopped firing, ALL background work stops — and that is precisely the
 * failure that once went undiagnosed for weeks because nothing here looked
 * at it.
 *
 * Two independent signals, because they fail differently:
 *   - /health   → the worker is deployed and reachable (and how many jobs it
 *                 carries — a mismatch means it's running an older deploy).
 *   - last tick → the worker's scheduled() heartbeat, i.e. proof the trigger
 *                 ACTUALLY FIRES. A reachable worker whose cron trigger is
 *                 disabled is still a dead scheduler, and only this catches it.
 *
 * Never reports 'ok' on absence of evidence: when the tick history can't be
 * read (no Redis), it says so as 'degraded' rather than implying health.
 */
async function checkWorker(): Promise<ReadinessCheck> {
  const key = 'worker';
  const label = 'Background scheduler (Cloudflare worker)';

  if (!isSet('WORKER_URL') || !isSet('WORKER_SECRET')) {
    return {
      key,
      label,
      status: 'missing',
      detail:
        'No background worker is configured — every recurring job (lead SLAs, reminders, briefings, drips, billing reconciles) is dead.',
      fix: 'Deploy worker/ and set WORKER_URL + WORKER_SECRET. See docs/WORKER.md.',
    };
  }

  const [health, lastTick] = await Promise.all([workerHealth(), readWorkerTick()]);

  if (!health) {
    return {
      key,
      label,
      status: 'missing',
      detail:
        "The worker is configured but its /health endpoint is unreachable — nothing is running recurring jobs right now.",
      fix: 'Check the Cloudflare deployment (`wrangler tail`) and that WORKER_URL points at it.',
    };
  }

  const expected = CRON_MANIFEST.length;
  if (health.scheduledJobs !== expected) {
    return {
      key,
      label,
      status: 'degraded',
      detail: `The worker is live but carries ${health.scheduledJobs} recurring jobs; this app expects ${expected}. It is probably running an older deploy.`,
      fix: 'Redeploy the worker (`wrangler deploy`) so its schedule matches the app.',
    };
  }

  // Reachable ≠ scheduling. The heartbeat is the real signal.
  if (!isRedisConfigured()) {
    return {
      key,
      label,
      status: 'degraded',
      detail: `The worker is live with all ${expected} jobs, but tick history can't be verified without Redis — whether its trigger is actually firing is unknown.`,
      fix: 'Set KV_REST_API_URL and KV_REST_API_TOKEN so master ticks are recorded.',
    };
  }

  if (!lastTick) {
    return {
      key,
      label,
      status: 'missing',
      detail:
        'The worker is reachable but has never recorded a master tick — its scheduled trigger is not firing, so no recurring job has run.',
      fix: 'Confirm the [triggers] crons block is deployed (`wrangler deploy`) and check `wrangler tail` for "master tick".',
    };
  }

  const ageMs = Date.now() - new Date(lastTick).getTime();
  if (!Number.isFinite(ageMs) || ageMs > WORKER_TICK_STALE_MS) {
    return {
      key,
      label,
      status: 'missing',
      detail: `The worker's last master tick was ${relativeTime(ageMs)} — its trigger has stopped firing, so recurring jobs are not running.`,
      fix: 'Check `wrangler tail` and the Cloudflare dashboard (Workers → Triggers) for the cron schedule.',
    };
  }

  return {
    key,
    label,
    status: 'ok',
    detail: `Live with all ${expected} recurring jobs; last master tick ${relativeTime(ageMs)}.`,
  };
}

/**
 * d. Scheduler conflict. The worker and the legacy Inngest cron mirrors carry
 * the SAME job list. If both are live they double-fire every tick — duplicate
 * reminder emails, double sends, double charges. The mirrors are opt-in for
 * exactly this reason; this check makes the dangerous combination loud instead
 * of silent.
 */
function checkSchedulerConflict(): ReadinessCheck {
  const key = 'scheduler-conflict';
  const label = 'Scheduler exclusivity';
  const workerLive = isSet('WORKER_URL') && isSet('WORKER_SECRET');
  const inngestCrons = isSet('INNGEST_CRONS_ENABLED');

  if (workerLive && inngestCrons) {
    return {
      key,
      label,
      status: 'missing',
      detail:
        'TWO schedulers are enabled at once — the Cloudflare worker and the legacy Inngest cron mirrors run the same jobs, so every recurring job fires twice (duplicate messages and charges).',
      fix: 'Unset INNGEST_CRONS_ENABLED — the worker is the production scheduler.',
    };
  }
  return {
    key,
    label,
    status: 'ok',
    detail: inngestCrons
      ? 'Inngest cron mirrors are the active scheduler; the Cloudflare worker is not configured.'
      : 'Exactly one scheduler is active (the Cloudflare worker).',
  };
}

/**
 * Vercel may only host the three idempotent recovery routes. Extra crons
 * would double-fire with the Worker. The list is imported from the same
 * constant the parity test pins against vercel.json.
 */
function checkVercelSafetyRail(): ReadinessCheck {
  const key = 'vercel-safety-rail';
  const label = 'Vercel recovery safety rail';
  const paths = VERCEL_SAFETY_RAIL_CRONS.map((c) => c.path).join(', ');
  return {
    key,
    label,
    status: 'ok',
    detail:
      `Vercel cron is limited to the three idempotent recovery routes (${paths}). ` +
      'The Worker owns every other recurring job. Do not add more Vercel crons.',
  };
}

/**
 * e. Scheduled runs (cron auth). The worker authenticates to the /api/cron/*
 * routes with `Bearer ${CRON_SECRET}`. No fallback — without it every tick
 * 401s and scheduled routines silently never fire.
 */
function checkCron(): ReadinessCheck {
  if (isSet('CRON_SECRET')) {
    return {
      key: 'cron',
      label: 'Scheduled runs (cron auth)',
      status: 'ok',
      detail: 'CRON_SECRET set — the worker\'s ticks authenticate to the cron routes and fire.',
    };
  }
  return {
    key: 'cron',
    label: 'Scheduled runs (cron auth)',
    status: 'missing',
    detail:
      'The cron routes 401 without CRON_SECRET — the worker\'s ticks cannot authenticate, so scheduled routines never run.',
    fix: 'Set CRON_SECRET on BOTH Vercel and the worker (`wrangler secret put CRON_SECRET`) — they must match.',
  };
}

/**
 * f. Event jobs (Inngest). Inngest is NO LONGER the scheduler (the Cloudflare
 * worker is — see the scheduler check). It still carries the event-driven
 * functions: Studio scheduled posts and Composio trigger dispatch, which have
 * no fallback. Work sessions do not depend on it (they run on the queue).
 */
function checkInngest(): ReadinessCheck {
  if (isSet('INNGEST_EVENT_KEY') && isSet('INNGEST_SIGNING_KEY')) {
    return {
      key: 'inngest',
      label: 'Event jobs (Inngest)',
      status: 'ok',
      detail: 'Inngest keys set — Studio scheduled posts and Composio trigger delivery are wired.',
    };
  }
  return {
    key: 'inngest',
    label: 'Event jobs (Inngest)',
    status: 'degraded',
    detail:
      "Studio scheduled posts and Composio trigger delivery won't fire without both Inngest keys. Recurring jobs are unaffected — the Cloudflare worker schedules those.",
    fix: 'Set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY to enable event-driven jobs. Do NOT set INNGEST_CRONS_ENABLED while the worker is live.',
  };
}

/**
 * e. Browser push (VAPID). All three values are required: the public key is
 * shipped to the client, while the private key and contact subject sign each
 * delivery. Without the complete set, push actions silently reach nobody.
 */
function checkWebPush(): ReadinessCheck {
  if (
    isSet('NEXT_PUBLIC_VAPID_PUBLIC_KEY') &&
    isSet('VAPID_PRIVATE_KEY') &&
    isSet('VAPID_SUBJECT')
  ) {
    return {
      key: 'web-push',
      label: 'Browser push notifications',
      status: 'ok',
      detail: 'VAPID credentials are configured for browser push signing.',
    };
  }
  return {
    key: 'web-push',
    label: 'Browser push notifications',
    status: 'missing',
    detail: 'Push actions cannot deliver without a complete VAPID credential set.',
    fix:
      'Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT, then redeploy.',
  };
}

/**
 * f. Integrations (Composio). Without the API key the app can't connect apps or
 * receive any triggers at all.
 */
async function checkComposio(): Promise<ReadinessCheck> {
  const key = 'composio';
  const label = 'Integrations (Composio)';
  if (!isSet('COMPOSIO_API_KEY') || !isSet('COMPOSIO_WEBHOOK_SECRET')) {
    return {
      key,
      label,
      status: 'missing',
      detail: "Can't connect apps and verify inbound triggers without both Composio credentials.",
      fix: 'Set COMPOSIO_API_KEY and COMPOSIO_WEBHOOK_SECRET, then redeploy.',
    };
  }

  try {
    const lastVerifiedAt = await redis.get<string>(COMPOSIO_WEBHOOK_HEALTH_KEY);
    const verifiedMs = lastVerifiedAt ? new Date(lastVerifiedAt).getTime() : Number.NaN;
    const ageMs = Date.now() - verifiedMs;
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= COMPOSIO_HEALTH_WINDOW_MS) {
      return {
        key,
        label,
        status: 'ok',
        detail: `Signed webhook delivery verified ${relativeTime(ageMs)}.`,
      };
    }
    return {
      key,
      label,
      status: 'degraded',
      detail: 'Credentials are set, but no signed webhook delivery has been verified in the last 7 days.',
      fix: 'Set the Composio webhook URL directly to https://www.usechippi.com/api/webhooks/composio and send a test delivery.',
    };
  } catch (err) {
    return {
      key,
      label,
      status: 'degraded',
      detail: `Credentials are set, but webhook delivery health could not be read: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

/**
 * Public, detail-free Composio readiness signal for server-rendered status
 * surfaces. This deliberately reuses the same verified-webhook probe as the
 * admin diagnostics page so public and internal health cannot disagree.
 */
export async function getComposioReadinessStatus(): Promise<ReadinessStatus> {
  return (await checkComposio()).status;
}

/**
 * g. Recent activity (per-space). Only included when a spaceId is given. Reads
 * the most recent routine run for the space and reports:
 *   - ok       — a routine ran inside the recency window
 *   - degraded — routines exist but none have run (or the last run is stale)
 *   - ok/info  — no routines at all (nothing scheduled is the expected state,
 *                not a problem — reported as 'ok' with an informative detail)
 *
 * DEFENSIVE: any query error becomes a 'degraded' check carrying the detail —
 * this function never throws.
 */
async function checkRecentActivity(spaceId: string): Promise<ReadinessCheck> {
  const key = 'recent-activity';
  const label = 'Recent activity';
  try {
    const { data, error } = await supabase
      .from('Routine')
      .select('lastRunAt, lastRunStatus')
      .eq('spaceId', spaceId)
      .order('lastRunAt', { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) {
      return {
        key,
        label,
        status: 'degraded',
        detail: `Couldn't read recent run history: ${error.message}`,
      };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return {
        key,
        label,
        status: 'ok',
        detail: 'No routines scheduled yet — nothing is expected to run in the background.',
      };
    }

    const lastRunAt = rows[0]?.lastRunAt as string | null | undefined;
    if (!lastRunAt) {
      return {
        key,
        label,
        status: 'degraded',
        detail: 'Routines exist but none have run yet.',
        fix: 'Confirm the executor and scheduled-run checks above are green.',
      };
    }

    const ageMs = Date.now() - new Date(lastRunAt).getTime();
    if (Number.isFinite(ageMs) && ageMs <= RECENT_RUN_WINDOW_MS) {
      const status = rows[0]?.lastRunStatus as string | null | undefined;
      return {
        key,
        label,
        status: 'ok',
        detail: `Last background run ${relativeTime(ageMs)}${status ? ` (${status})` : ''}.`,
      };
    }

    return {
      key,
      label,
      status: 'degraded',
      detail: `Routines exist but the last run was ${relativeTime(ageMs)} — nothing recent.`,
      fix: 'Confirm the executor and scheduled-run checks above are green.',
    };
  } catch (err) {
    // Never throw — a query failure is itself a (soft) readiness signal.
    return {
      key,
      label,
      status: 'degraded',
      detail: `Couldn't read recent run history: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Coarse human relative time for a positive age in ms. */
function relativeTime(ageMs: number): string {
  const mins = Math.round(ageMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Derive the overall status. A single 'missing' (a gap with no fallback) drags
 * the whole surface to 'down'; any 'degraded' without a 'missing' is 'degraded';
 * otherwise 'ok'.
 */
function deriveOverall(checks: ReadinessCheck[]): OverallStatus {
  if (checks.some((c) => c.status === 'missing')) return 'down';
  if (checks.some((c) => c.status === 'degraded')) return 'degraded';
  return 'ok';
}

/**
 * Build the full background-readiness report. Pass a spaceId to include the
 * per-space "recent activity" check; omit it for the env-only view.
 */
export async function getBackgroundReadiness(spaceId?: string): Promise<BackgroundReadiness> {
  // The scheduler leads: it is the prerequisite for every other background
  // path, and the one whose silent death this page exists to catch.
  const checks: ReadinessCheck[] = [
    await checkWorker(),
    checkSchedulerConflict(),
    checkVercelSafetyRail(),
    checkCron(),
    checkExecutor(),
    checkChatOffload(),
    checkInngest(),
    checkWebPush(),
    await checkComposio(),
  ];

  if (spaceId) {
    checks.push(await checkRecentActivity(spaceId));
  }

  return { overall: deriveOverall(checks), checks };
}
