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
import { redis } from '@/lib/redis';

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
 * c. Scheduled runs (cron auth). No fallback — the hourly routine cron 401s
 * without CRON_SECRET, so scheduled routines silently never fire.
 */
function checkCron(): ReadinessCheck {
  if (isSet('CRON_SECRET')) {
    return {
      key: 'cron',
      label: 'Scheduled runs (cron auth)',
      status: 'ok',
      detail: 'CRON_SECRET set — the hourly routine cron authenticates and fires.',
    };
  }
  return {
    key: 'cron',
    label: 'Scheduled runs (cron auth)',
    status: 'missing',
    detail: 'The hourly routine cron 401s without CRON_SECRET — scheduled routines never run.',
    fix: 'Set CRON_SECRET on Vercel (and in the cron job header) and redeploy.',
  };
}

/**
 * d. Integration triggers (Inngest). Both keys are required for the
 * Composio → Inngest dispatch to deliver; without them background app events
 * never fire.
 */
function checkInngest(): ReadinessCheck {
  if (isSet('INNGEST_EVENT_KEY') && isSet('INNGEST_SIGNING_KEY')) {
    return {
      key: 'inngest',
      label: 'Integration triggers (Inngest)',
      status: 'ok',
      detail: 'Inngest keys set — Composio → Inngest trigger delivery is wired.',
    };
  }
  return {
    key: 'inngest',
    label: 'Integration triggers (Inngest)',
    status: 'missing',
    detail: "Composio → Inngest trigger delivery won't fire without both Inngest keys.",
    fix: 'Set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY and redeploy.',
  };
}

/**
 * e. Integrations (Composio). Without the API key the app can't connect apps or
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
 * f. Recent activity (per-space). Only included when a spaceId is given. Reads
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
  const checks: ReadinessCheck[] = [
    checkExecutor(),
    checkChatOffload(),
    checkCron(),
    checkInngest(),
    await checkComposio(),
  ];

  if (spaceId) {
    checks.push(await checkRecentActivity(spaceId));
  }

  return { overall: deriveOverall(checks), checks };
}
