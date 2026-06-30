/**
 * GET /api/cron/workflows
 *
 * Hourly tick. Finds every enabled Workflow whose trigger is a `schedule` and
 * is DUE this hour, and runs it through the workflow executor.
 *
 * There is no nextRunAt column on Workflow — UNLIKE the Routine table. The
 * schedule mechanism here is simply "the hourly cron fires + a cadence check":
 * each tick we scan every enabled schedule-triggered workflow and decide, from
 * its `trigger.config` cadence/hour, whether it's due in THIS UTC hour. So the
 * cron MUST run hourly (vercel.json '0 * * * *') for daily/weekdays workflows to
 * land on their hour. See isScheduleDue for the per-cadence rule.
 *
 * IMPORTANT: like every autonomous path, a workflow run DRAFTS — it never sends
 * an outbound channel unattended. The executor owns that contract.
 *
 * Auth: Bearer ${CRON_SECRET}. Disable: set CRON_WORKFLOWS_DISABLED=1.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { runWorkflow, type WorkflowRow } from '@/lib/workflows/executor';
import { monitorCron } from '@/lib/cron-monitor';

export const runtime = 'nodejs';
// A schedule workflow's actions drive the same headless agent runtime the
// routines cron does (draft_message), so give the function the same generous
// budget rather than risk a run cut off mid-flight. Mirrors /api/cron/routines.
export const maxDuration = 300;

// Don't let one tick run an unbounded number of workflows — overflow is picked
// up on the next hourly tick.
const MAX_PER_TICK = 500;
// Parallel workflow runs in flight at once.
const MAX_CONCURRENCY = 5;

/** A `schedule` workflow's trigger.config, as stored. */
interface ScheduleConfig {
  cadence: 'hourly' | 'daily' | 'weekdays';
  hour?: number;
  timezone?: string;
}

/**
 * Derive the local hour and weekday of `now` in the given IANA timezone.
 * Falls back to UTC on any error (unsupported or mis-spelled TZ name).
 */
function localHourAndDay(now: Date, timezone?: string): { hour: number; dow: number } {
  if (!timezone) {
    return { hour: now.getUTCHours(), dow: now.getUTCDay() };
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      weekday: 'short',
      hour12: false,
    }).formatToParts(now);
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? String(now.getUTCHours());
    const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    // hour12:false returns '24' for midnight in some locales — normalise to 0.
    const hour = parseInt(hourStr, 10) % 24;
    const dow = dayMap[weekdayStr] ?? now.getUTCDay();
    return { hour, dow };
  } catch {
    return { hour: now.getUTCHours(), dow: now.getUTCDay() };
  }
}

/**
 * Decide whether a schedule workflow is DUE in the current tick.
 *
 * Pure + exported so the cadence logic is unit-testable without HTTP:
 *   - hourly   → always due (it fires every tick).
 *   - daily    → due only when the LOCAL hour (per timezone, default UTC) equals config.hour.
 *   - weekdays → that AND the LOCAL day is Mon–Fri.
 *
 * A `daily`/`weekdays` config with no `hour` defaults to hour 0.
 */
export function isScheduleDue(config: ScheduleConfig, now: Date): boolean {
  if (config.cadence === 'hourly') return true;

  const { hour: currentHour, dow } = localHourAndDay(now, config.timezone);
  const targetHour = config.hour ?? 0;
  if (currentHour !== targetHour) return false;

  if (config.cadence === 'weekdays') {
    return dow >= 1 && dow <= 5;
  }

  // daily, on its hour.
  return true;
}

interface ScheduleWorkflowRow {
  id: string;
  spaceId: string;
  trigger: { type: string; config?: ScheduleConfig };
  conditions: WorkflowRow['conditions'];
  actions: WorkflowRow['actions'];
  autonomy: WorkflowRow['autonomy'];
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/workflows] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_WORKFLOWS_DISABLED) {
    console.log('[cron/workflows] CRON_WORKFLOWS_DISABLED is set — skipping tick');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();
  const now = new Date();

  // ── 1. Enabled schedule-triggered workflows ────────────────────────────
  // trigger is jsonb; trigger->>'type' = 'schedule' selects the schedule ones
  // server-side so we don't pull every workflow into memory.
  const { data: rows, error: queryErr } = await supabase
    .from('Workflow')
    .select('id, spaceId, trigger, conditions, actions, autonomy')
    .eq('enabled', true)
    .eq('trigger->>type', 'schedule')
    .limit(MAX_PER_TICK);
  if (queryErr) {
    console.error('[cron/workflows] Failed to load schedule workflows', queryErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const scheduled = (rows ?? []) as unknown as ScheduleWorkflowRow[];

  // ── 2. Keep only the ones due THIS hour ────────────────────────────────
  // FOLLOW-UP: due-ness is computed purely from the current UTC hour, so a missed
  // tick (cron outage) drops that hour's schedules. Persist a per-workflow
  // last-fired watermark and catch up missed hours instead of relying on "this hour".
  const due = scheduled.filter((w) => {
    const config = w.trigger?.config;
    if (!config || typeof config.cadence !== 'string') return false;
    return isScheduleDue(config, now);
  });

  if (due.length === 0) {
    return NextResponse.json({
      scanned: scheduled.length,
      due: 0,
      ran: 0,
      errored: 0,
      durationMs: Date.now() - startedAt,
    });
  }

  // ── 3. Run with bounded concurrency ────────────────────────────────────
  const firedAt = now.toISOString();
  let ran = 0;
  let errored = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < due.length) {
      const row = due[cursor++];
      try {
        await runWorkflow({
          workflow: {
            id: row.id,
            spaceId: row.spaceId,
            trigger: row.trigger as WorkflowRow['trigger'],
            conditions: row.conditions,
            actions: row.actions,
            autonomy: row.autonomy,
          },
          context: { event: { type: 'schedule', firedAt } },
          triggerEvent: { type: 'schedule', firedAt },
        });
        ran++;
      } catch (err) {
        // runWorkflow already swallows its own errors; this is belt-and-
        // suspenders so one bad workflow can't abort the loop.
        console.error('[cron/workflows] workflow run threw', { id: row.id }, err);
        errored++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, due.length) }, () => worker()),
  );

  const summary = {
    scanned: scheduled.length,
    due: due.length,
    ran,
    errored,
    durationMs: Date.now() - startedAt,
  };
  console.log('[cron/workflows] Tick complete', summary);
  return NextResponse.json(summary);
}

export const GET = monitorCron('workflows', { crontab: '0 * * * *' }, handler);
