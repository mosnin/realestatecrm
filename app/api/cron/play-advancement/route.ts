/**
 * GET /api/cron/play-advancement
 *
 * Every 30 minutes. Walks the nurture-play enrollments whose next step is due
 * and stages the step as a pending AgentDraft in the approval inbox.
 *
 * An enrollment is an AgentGoal with metadata `{ playKind, step }` and a
 * `nextActionAt` timestamp (see lib/plays/enroll.ts). For each due goal we:
 *   1. Load the play definition + the current step (metadata.step).
 *   2. Compose a real message for that step's intent via the same quick-draft
 *      composer the chat draft_* tools use — voice-matched, not a raw prompt.
 *   3. Insert an AgentDraft (status 'pending') on the step's channel.
 *   4. Advance metadata.step and set nextActionAt to the next step's delay, OR
 *      mark the goal 'completed' (nextActionAt NULL) after the last step.
 *
 * IMPORTANT: like every autonomous path, this NEVER sends. It drafts. Only the
 * realtor approving a draft fires an outbound channel.
 *
 * Auth: Bearer ${CRON_SECRET}. Disable: set CRON_PLAY_ADVANCEMENT_DISABLED=1.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { monitorCron } from '@/lib/cron-monitor';
import { logger } from '@/lib/logger';
import { getPlay } from '@/lib/plays/definitions';
import { composeQuickDraft } from '@/lib/agent/quick-draft';

export const runtime = 'nodejs';

// One tick can't drain an unbounded backlog — overflow waits for the next tick.
const MAX_PER_TICK = 200;
// Each step does an LLM compose; keep the fan-out modest.
const MAX_CONCURRENCY = 5;
// Don't double-draft: a pending play draft for the same contact+channel inside
// this window means a prior tick (or a manual draft) already covered it.
const DEDUPE_WINDOW_HOURS = 24;
const DRAFT_TTL_DAYS = 7;
// Play-step prompt → composer intent is carried on the step itself.

interface DueGoal {
  id: string;
  spaceId: string;
  contactId: string | null;
  metadata: Record<string, unknown> | null;
}

function addDaysIso(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Mark an enrollment finished — no more steps. */
async function completeGoal(goalId: string, metadata: Record<string, unknown>, step: number) {
  const nowIso = new Date().toISOString();
  await supabase
    .from('AgentGoal')
    .update({
      status: 'completed',
      nextActionAt: null,
      completedAt: nowIso,
      metadata: { ...metadata, step },
      updatedAt: nowIso,
    })
    .eq('id', goalId);
}

async function advanceOne(goal: DueGoal): Promise<'drafted' | 'completed' | 'skipped' | 'error'> {
  const metadata = (goal.metadata ?? {}) as Record<string, unknown>;
  const playKind = typeof metadata.playKind === 'string' ? metadata.playKind : null;
  const step = typeof metadata.step === 'number' ? metadata.step : 0;
  if (!playKind) return 'skipped';

  const play = getPlay(playKind);
  if (!play) {
    // Unknown play (definition removed) — close the goal so it stops being due.
    logger.warn('[cron/play-advancement] unknown playKind, completing goal', { goalId: goal.id, playKind });
    await completeGoal(goal.id, metadata, step);
    return 'completed';
  }

  const current = play.steps[step];
  if (!current) {
    // step index past the end — nothing to do but finish.
    await completeGoal(goal.id, metadata, step);
    return 'completed';
  }

  // Contact may have been deleted (AgentGoal.contactId is SET NULL on delete).
  if (!goal.contactId) {
    await completeGoal(goal.id, metadata, step);
    return 'completed';
  }

  // Dedup: skip drafting if a pending play draft already exists for this
  // contact+channel in the window. We still advance the schedule so the
  // sequence doesn't stall on a single covered step.
  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data: existingDraft } = await supabase
    .from('AgentDraft')
    .select('id')
    .eq('spaceId', goal.spaceId)
    .eq('contactId', goal.contactId)
    .eq('channel', current.actionType)
    .eq('status', 'pending')
    .gte('createdAt', cutoff)
    .limit(1)
    .maybeSingle();

  let drafted = false;
  if (!existingDraft) {
    const composed = await composeQuickDraft({
      kind: 'person',
      id: goal.contactId,
      intent: current.intent,
      channel: current.actionType,
      spaceId: goal.spaceId,
    });

    if (composed) {
      const nowIso = new Date().toISOString();
      const expiresAt = addDaysIso(new Date(), DRAFT_TTL_DAYS);
      const subject =
        current.actionType === 'email'
          ? composed.subject ?? `${play.name}${composed.subjectLabel ? ` — ${composed.subjectLabel}` : ''}`
          : null;
      const { error: draftErr } = await supabase.from('AgentDraft').insert({
        id: crypto.randomUUID(),
        spaceId: goal.spaceId,
        contactId: goal.contactId,
        channel: current.actionType,
        subject,
        content: composed.body,
        reasoning: `${play.name} (step ${step + 1} of ${play.steps.length}). ${current.prompt}`,
        priority: 0,
        status: 'pending',
        expiresAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      if (draftErr) {
        logger.error('[cron/play-advancement] draft insert failed', { goalId: goal.id, playKind }, draftErr);
        return 'error';
      }
      drafted = true;
    }
    // composed === null (unknown contact / compose failed): don't draft, but
    // still advance below so a transient compose miss can't jam the play.
  }

  // ── Advance the schedule ────────────────────────────────────────────────
  const nextStepIndex = step + 1;
  const nextStep = play.steps[nextStepIndex];
  const nowIso = new Date().toISOString();
  if (!nextStep) {
    await completeGoal(goal.id, metadata, nextStepIndex);
  } else {
    await supabase
      .from('AgentGoal')
      .update({
        metadata: { ...metadata, step: nextStepIndex },
        nextActionAt: addDaysIso(new Date(), nextStep.delayDays),
        updatedAt: nowIso,
      })
      .eq('id', goal.id);
  }

  return drafted ? 'drafted' : 'skipped';
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/play-advancement] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.CRON_PLAY_ADVANCEMENT_DISABLED) {
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  // ── 1. Due enrollments ──────────────────────────────────────────────────
  // The partial index idx_agent_goal_next_action covers (nextActionAt) WHERE
  // nextActionAt IS NOT NULL AND status='active'.
  const { data: dueRows, error: dueErr } = await supabase
    .from('AgentGoal')
    .select('id, spaceId, contactId, metadata')
    .eq('status', 'active')
    .lte('nextActionAt', nowIso)
    .not('nextActionAt', 'is', null)
    .not('metadata->>playKind', 'is', null)
    .order('nextActionAt', { ascending: true })
    .limit(MAX_PER_TICK);
  if (dueErr) {
    console.error('[cron/play-advancement] failed to load due goals', dueErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const due = (dueRows ?? []) as DueGoal[];
  if (due.length === 0) {
    return NextResponse.json({ due: 0, drafted: 0, completed: 0, durationMs: Date.now() - startedAt });
  }

  // ── 2. Keep only spaces with a live subscription ────────────────────────
  const spaceIds = [...new Set(due.map((g) => g.spaceId))];
  const { data: spaceRows, error: spaceErr } = await supabase
    .from('Space')
    .select('id, stripeSubscriptionStatus')
    .in('id', spaceIds);
  if (spaceErr) {
    console.error('[cron/play-advancement] failed to load spaces', spaceErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }
  const activeSpaces = new Set(
    (spaceRows ?? [])
      .filter((s) => ['active', 'trialing'].includes(s.stripeSubscriptionStatus as string))
      .map((s) => s.id as string),
  );
  const runnable = due.filter((g) => activeSpaces.has(g.spaceId));
  const skippedInactive = due.length - runnable.length;

  // ── 3. Advance with bounded concurrency ─────────────────────────────────
  let drafted = 0;
  let completed = 0;
  let errored = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < runnable.length) {
      const goal = runnable[cursor++];
      let outcome: Awaited<ReturnType<typeof advanceOne>>;
      try {
        outcome = await advanceOne(goal);
      } catch (err) {
        logger.error('[cron/play-advancement] advance threw', { goalId: goal.id }, err);
        outcome = 'error';
      }
      if (outcome === 'drafted') drafted++;
      else if (outcome === 'completed') completed++;
      else if (outcome === 'error') errored++;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, runnable.length) }, () => worker()),
  );

  const summary = {
    due: due.length,
    drafted,
    completed,
    errored,
    skipped: skippedInactive,
    durationMs: Date.now() - startedAt,
  };
  console.log('[cron/play-advancement] tick complete', summary);
  return NextResponse.json(summary);
}

export const GET = monitorCron('play-advancement', { crontab: '*/30 * * * *' }, handler);
