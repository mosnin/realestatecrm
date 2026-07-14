/**
 * GET /api/cron/agent-tasks
 *
 * The AgentTask queue's consumer. Producers (POST /api/agent/tasks, the
 * approvals "approve" path, the failed→queued retry button) insert rows with
 * status 'queued' — and until this cron existed, NOTHING ever executed them:
 * a queued task sat in the UI forever, indistinguishable from a live one.
 *
 * Every 15 minutes this tick picks up queued rows and dispatches each through
 * the SAME headless run path routines use (fireRoutineRun → Modal, or the
 * in-process TS agent when Modal isn't configured). Like every autonomous
 * path, the run DRAFTS — it never sends an outbound channel unattended; the
 * draft tools' AgentDraft rows are the output.
 *
 * What is deliberately NOT executed here: tasks with triggerSource 'sla'.
 * Those are durable speed-to-lead follow-ups (lib/broker-sla.ts) whose whole
 * job is to STAY OPEN in the realtor's task list until the lead is actually
 * worked — and whose dedup keys on an open (queued/running/paused) row.
 * Auto-completing one would both dismiss the reminder and make the 15-minute
 * SLA sweep cut a fresh duplicate every tick.
 *
 * Status flow per task (compare-and-swap via transitionTask, so an overlapping
 * tick can't double-run a row):
 *   queued → running → completed  (dispatch accepted / in-process run finished)
 *   queued → running → failed     (dispatch genuinely failed — retryable in UI)
 *
 * Auth: Bearer ${CRON_SECRET}. Disable: set CRON_AGENT_TASKS_DISABLED=1.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fireRoutineRun } from '@/lib/routines';
import { transitionTask } from '@/lib/agent/task-state-machine';
import { isSpaceDisabled } from '@/lib/agent/kill-switch';
import { monitorCron } from '@/lib/cron-monitor';
import { isPremiumAccessBlocked } from '@/lib/api-auth';

export const runtime = 'nodejs';
// The Modal-free in-process fallback blocks until the headless run finishes
// (~120s budget per run) — same generous budget as /api/cron/routines.
export const maxDuration = 300;

// Read a wider window than we run so a handful of blocked/disabled spaces
// parked at the front of the createdAt-ascending queue can't starve runnable
// tasks behind them.
const MAX_SCAN_PER_TICK = 100;
// Bounded work per tick — overflow is picked up on the next 15-minute tick.
const MAX_RUNS_PER_TICK = 20;
// Parallel dispatches in flight at once.
const MAX_CONCURRENCY = 4;

interface QueuedTask {
  id: string;
  spaceId: string;
  title: string;
  description: string | null;
  goalDescription: string | null;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/agent-tasks] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_AGENT_TASKS_DISABLED) {
    console.log('[cron/agent-tasks] CRON_AGENT_TASKS_DISABLED is set — skipping tick');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();

  // ── 1. Queued executable tasks, oldest first ────────────────────────────
  // 'sla' rows are durable follow-up reminders, not executable goals — see
  // the header. Everything else ('manual', approval-requeued, retries) runs.
  const { data: rows, error: queryErr } = await supabase
    .from('AgentTask')
    .select('id, spaceId, title, description, goalDescription')
    .eq('status', 'queued')
    .neq('triggerSource', 'sla')
    .order('createdAt', { ascending: true })
    .limit(MAX_SCAN_PER_TICK);
  if (queryErr) {
    console.error('[cron/agent-tasks] Failed to load queued tasks', queryErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const queued = (rows ?? []) as QueuedTask[];
  if (queued.length === 0) {
    return NextResponse.json({
      scanned: 0,
      ran: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      durationMs: Date.now() - startedAt,
    });
  }

  // ── 2. Space gates: subscription + kill switch ──────────────────────────
  // Mirrors /api/cron/routines: free/inactive spaces run on included credits;
  // only lapsed-paid (or delinquent) states are blocked. Gated tasks are LEFT
  // QUEUED — a renewed subscription or re-enabled space picks them back up —
  // but logged so the silent skip is diagnosable. While loading spaces, pull
  // ownerId so the run carries the owner's Clerk id (Composio entity).
  const spaceIds = [...new Set(queued.map((t) => t.spaceId))];
  const { data: spaceRows, error: spaceErr } = await supabase
    .from('Space')
    .select('id, ownerId, stripeSubscriptionStatus, stripePeriodEnd')
    .in('id', spaceIds);
  if (spaceErr) {
    console.error('[cron/agent-tasks] Failed to load spaces', spaceErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const runnableSpaces = new Set<string>();
  const ownerIdBySpace = new Map<string, string>();
  for (const s of spaceRows ?? []) {
    if (
      isPremiumAccessBlocked(
        s.stripeSubscriptionStatus as string,
        s.stripePeriodEnd as string | null,
      )
    ) {
      continue;
    }
    runnableSpaces.add(s.id as string);
    if (s.ownerId) ownerIdBySpace.set(s.id as string, s.ownerId as string);
  }

  // Kill switch (ops disable) — checked once per space, 30s-cached inside.
  for (const id of [...runnableSpaces]) {
    try {
      if (await isSpaceDisabled(id)) runnableSpaces.delete(id);
    } catch (err) {
      // Fail closed: if we can't tell, don't run agent work for that space.
      console.warn('[cron/agent-tasks] kill-switch check failed — skipping space', { id }, err);
      runnableSpaces.delete(id);
    }
  }

  // Owner DB ids → Clerk userIds, one batch lookup (mirrors /api/cron/routines).
  const clerkIdByOwner = new Map<string, string>();
  const ownerIds = [...new Set(ownerIdBySpace.values())];
  if (ownerIds.length > 0) {
    const { data: userRows, error: userErr } = await supabase
      .from('User')
      .select('id, clerkId')
      .in('id', ownerIds);
    if (userErr) {
      console.warn('[cron/agent-tasks] Failed to load owners — running without userId', userErr);
    } else {
      for (const u of userRows ?? []) {
        if (u.clerkId) clerkIdByOwner.set(u.id as string, u.clerkId as string);
      }
    }
  }

  const runnable = queued.filter((t) => runnableSpaces.has(t.spaceId)).slice(0, MAX_RUNS_PER_TICK);
  const skipped = queued.length - queued.filter((t) => runnableSpaces.has(t.spaceId)).length;
  if (skipped > 0) {
    console.warn('[cron/agent-tasks] tasks left queued (space gated)', {
      taskIds: queued.filter((t) => !runnableSpaces.has(t.spaceId)).map((t) => t.id),
    });
  }

  // ── 3. Execute with bounded concurrency ─────────────────────────────────
  let ran = 0;
  let completed = 0;
  let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < runnable.length) {
      const task = runnable[cursor++];

      // Claim the row: queued → running. transitionTask compare-and-swaps on
      // the status it read, so a concurrent tick (or a cancel racing us) loses
      // or wins cleanly — a lost claim means someone else owns the row; skip.
      const claim = await transitionTask(task.id, 'running', {
        startedAt: new Date().toISOString(),
      });
      if (!claim.ok) {
        console.warn('[cron/agent-tasks] claim lost — skipping task', {
          id: task.id,
          error: claim.error,
        });
        continue;
      }
      ran++;

      const instruction =
        task.goalDescription?.trim() || task.description?.trim() || task.title;
      const ownerId = ownerIdBySpace.get(task.spaceId);
      const ownerClerkId = ownerId ? clerkIdByOwner.get(ownerId) : undefined;

      let status: 'ok' | 'error';
      try {
        status = await fireRoutineRun(
          task.spaceId,
          instruction,
          ownerClerkId,
          undefined,
          'agent_task',
        );
      } catch (err) {
        console.error('[cron/agent-tasks] dispatch threw', { id: task.id }, err);
        status = 'error';
      }

      // 'ok' = the run was accepted and drives to completion on its own
      // (Modal holds it; the in-process path has already finished). The run
      // ledger + reconcile cron own run-level truth; the task row records
      // that its ask was executed. 'error' = the run genuinely never started
      // → 'failed', which the UI's Retry button can re-queue.
      const done = await transitionTask(
        task.id,
        status === 'ok' ? 'completed' : 'failed',
        status === 'ok' ? { completedAt: new Date().toISOString() } : undefined,
      );
      if (!done.ok) {
        console.warn('[cron/agent-tasks] terminal transition failed', {
          id: task.id,
          to: status === 'ok' ? 'completed' : 'failed',
          error: done.error,
        });
      }
      if (status === 'ok') completed++;
      else failed++;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, runnable.length) }, () => worker()),
  );

  const summary = {
    scanned: queued.length,
    ran,
    completed,
    failed,
    skipped,
    durationMs: Date.now() - startedAt,
  };
  console.log('[cron/agent-tasks] Tick complete', summary);
  return NextResponse.json(summary);
}

export const GET = monitorCron('agent-tasks', { crontab: '*/15 * * * *' }, handler);
