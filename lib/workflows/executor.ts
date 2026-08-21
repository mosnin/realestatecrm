/**
 * Workflow EXECUTOR — the run engine. Drives one Workflow (or every enabled
 * Workflow matching an event) end to end and writes the run ledger.
 *
 * This is the orchestration half of the executor pass. `runWorkflow` evaluates
 * the IF tree, then runs the THEN actions in order, persisting one WorkflowRun
 * plus its WorkflowRunStep rows as it goes. `runWorkflowsForEvent` is the entry
 * point the (later) trigger-wiring pass calls: it loads the space's enabled
 * workflows whose trigger matches the event type and runs each.
 *
 * Run-status rules (single source of truth):
 *   - Conditions FALSE → run 'skipped'   (one condition step, no actions run);
 *                        Workflow.lastRunStatus = 'skipped'.
 *   - Conditions TRUE  → run 'completed' if every action ended ok/skipped;
 *                        'failed' if ANY action ended failed;
 *                        Workflow.lastRunStatus = 'ok' (completed) / 'error'
 *                        (failed).
 *   - Unexpected throw → run 'failed', Workflow.lastRunStatus = 'error'.
 *
 * Nothing here throws to its caller — the whole body is wrapped so a bad
 * workflow leaves a 'failed' run rather than propagating.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { sendPushToSpace } from '@/lib/push';
import { createAppNotification } from '@/lib/notifications';
import { evaluateConditions } from './conditions';
import { executeAction, type WorkflowContext, type ActionStepResult } from './actions';
import { walkGraph } from './graph-walk';
import { unscoped } from '@/lib/supabase-guard';
import type {
  ConditionGroup,
  TriggerType,
  WorkflowAction,
  WorkflowAutonomy,
  WorkflowGraph,
  WorkflowTrigger,
} from './schema';

/**
 * The persisted Workflow row, as the executor needs it. Mirrors the columns of
 * the "Workflow" table (see supabase/migrations/20260802000000_workflows.sql).
 * The trigger/conditions/actions JSONB columns are already-validated shapes.
 */
export interface WorkflowRow {
  id: string;
  spaceId: string;
  trigger: WorkflowTrigger;
  conditions: ConditionGroup;
  actions: WorkflowAction[];
  autonomy: WorkflowAutonomy;
  /**
   * OPTIONAL advanced-mode branching graph. When present, runWorkflow walks the
   * graph (condition nodes gate their branches, action nodes run) instead of the
   * linear conditions→actions path. Absent/null for every linear workflow.
   */
  graph?: WorkflowGraph | null;
  /** When true, a push notification fires to the space on any failed run. */
  notifyOnError?: boolean;
}

export interface RunWorkflowInput {
  workflow: WorkflowRow;
  context: WorkflowContext;
  triggerEvent: unknown;
}

export interface RunWorkflowResult {
  runId: string;
  status: 'completed' | 'failed' | 'skipped';
}

/** Insert one WorkflowRunStep row. Best-effort: a ledger write must not abort
 *  the run, so we log and continue on error rather than throw. */
async function writeStep(input: {
  runId: string;
  stepIndex: number;
  kind: 'condition' | 'action';
  status: 'ok' | 'failed' | 'skipped';
  actionType?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabase.from('WorkflowRunStep').insert({
    id: crypto.randomUUID(),
    runId: input.runId,
    stepIndex: input.stepIndex,
    kind: input.kind,
    actionType: input.actionType ?? null,
    status: input.status,
    detail: input.detail ?? null,
  });
  if (error) {
    logger.warn('[workflows.executor] step insert failed', {
      runId: input.runId,
      stepIndex: input.stepIndex,
    }, error);
  }
}

/** Patch the WorkflowRun terminal row (status + finishedAt + summary/error). */
async function finishRun(input: {
  runId: string;
  status: 'completed' | 'failed' | 'skipped';
  summary?: string;
  error?: string | null;
}): Promise<void> {
  const { error } = await unscoped(supabase
    .from('WorkflowRun'), 'post-fetch: caller verified parent scope before this id query')
    .update({
      status: input.status,
      summary: input.summary ?? null,
      error: input.error ?? null,
      finishedAt: new Date().toISOString(),
    })
    .eq('id', input.runId);
  if (error) {
    logger.warn('[workflows.executor] run finalize failed', { runId: input.runId }, error);
  }
}

/** Update the parent Workflow's lastRun bookkeeping. */
async function updateWorkflowLastRun(input: {
  workflowId: string;
  lastRunStatus: 'ok' | 'error' | 'skipped';
}): Promise<void> {
  const { error } = await unscoped(supabase
    .from('Workflow'), 'post-fetch: caller verified parent scope before this id query')
    .update({ lastRunAt: new Date().toISOString(), lastRunStatus: input.lastRunStatus })
    .eq('id', input.workflowId);
  if (error) {
    logger.warn('[workflows.executor] workflow lastRun update failed', {
      workflowId: input.workflowId,
    }, error);
  }
}

/**
 * Run one workflow against a context and persist its full run ledger.
 *
 * 1. Insert a WorkflowRun (status 'running').
 * 2. Evaluate conditions. FALSE → a skipped condition step, run 'skipped'.
 * 3. TRUE → an ok condition step, then each action in order: executeAction +
 *    one action step.
 * 4. Mark the run completed (all ok/skipped) or failed (any failed).
 *
 * Never throws — an unexpected error marks the run 'failed' and returns.
 */
export async function runWorkflow(input: RunWorkflowInput): Promise<RunWorkflowResult> {
  const { workflow, context, triggerEvent } = input;
  const runId = crypto.randomUUID();

  // 1. Open the run ledger. If even this fails we have nowhere to record the
  //    outcome — log and report failed with the (unwritten) id.
  const { error: insertErr } = await supabase.from('WorkflowRun').insert({
    id: runId,
    workflowId: workflow.id,
    spaceId: workflow.spaceId,
    status: 'running',
    triggerEvent: triggerEvent ?? null,
    startedAt: new Date().toISOString(),
  });
  if (insertErr) {
    logger.error('[workflows.executor] run insert failed', { workflowId: workflow.id }, insertErr);
    return { runId, status: 'failed' };
  }

  try {
    // 2a. ADVANCED mode — when the workflow carries a branching graph, walk it
    //     instead of the linear conditions→actions path. The graph's own
    //     condition NODES are the gates (the definition-level `conditions` is
    //     not used in graph mode); every action still runs through the same
    //     executeAction + autonomy gating. Steps are persisted in walk order.
    if (workflow.graph) {
      const walk = await walkGraph(workflow.graph, {
        evaluate: (cond) => evaluateConditions(cond, context as Record<string, unknown>),
        runAction: (action) =>
          executeAction(action, context, {
            spaceId: workflow.spaceId,
            autonomy: workflow.autonomy,
            runId,
          }),
      });
      for (let i = 0; i < walk.steps.length; i++) {
        const s = walk.steps[i];
        await writeStep({
          runId,
          stepIndex: i,
          kind: s.kind,
          actionType: s.actionType ?? null,
          status: s.status,
          // Carry the source nodeId in the step detail (no dedicated column) so
          // the canvas can highlight which nodes ran on the executed path.
          detail: { ...(s.detail ?? {}), nodeId: s.nodeId },
        });
      }
      if (walk.status === 'failed') {
        await finishRun({ runId, status: 'failed', summary: 'one or more actions failed' });
        await updateWorkflowLastRun({ workflowId: workflow.id, lastRunStatus: 'error' });
        return { runId, status: 'failed' };
      }
      await finishRun({ runId, status: 'completed', summary: 'graph run completed' });
      await updateWorkflowLastRun({ workflowId: workflow.id, lastRunStatus: 'ok' });
      return { runId, status: 'completed' };
    }

    // 2. The IF gate (linear mode).
    const passed = evaluateConditions(workflow.conditions, context as Record<string, unknown>);
    if (!passed) {
      await writeStep({
        runId,
        stepIndex: 0,
        kind: 'condition',
        status: 'skipped',
        detail: { passed: false },
      });
      await finishRun({ runId, status: 'skipped', summary: 'conditions not met' });
      await updateWorkflowLastRun({ workflowId: workflow.id, lastRunStatus: 'skipped' });
      return { runId, status: 'skipped' };
    }

    // Conditions held — record the passing gate as step 0, actions follow.
    await writeStep({ runId, stepIndex: 0, kind: 'condition', status: 'ok', detail: { passed: true } });

    // 3. Run the actions in order. stepIndex 0 is the condition gate, so action
    //    i lands at stepIndex i + 1.
    let anyFailed = false;
    for (let i = 0; i < workflow.actions.length; i++) {
      const action = workflow.actions[i];

      // Retry loop: when onError='retry' re-run the step up to maxRetries times
      // (default 3) with exponential backoff before giving up.
      const maxAttempts = action.onError === 'retry' ? (action.maxRetries ?? 3) : 1;
      let result: ActionStepResult = { status: 'failed', detail: { error: 'not run' } };
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        result = await executeAction(action, context, {
          spaceId: workflow.spaceId,
          autonomy: workflow.autonomy,
          runId,
        });
        if (result.status !== 'failed') break;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        }
      }
      if (action.onError === 'retry' && result.status === 'failed') {
        result = { ...result, detail: { ...result.detail, retried: maxAttempts } };
      }

      // Stash step output in context so later steps can reference {{step#.*}}.
      (context as Record<string, unknown>)[`step${i + 1}`] = {
        status: result.status,
        ...result.detail,
      };
      const failedAndStop = result.status === 'failed' && action.onError !== 'skip' && action.onError !== 'retry';
      if (result.status === 'failed') anyFailed = true;
      await writeStep({
        runId,
        stepIndex: i + 1,
        kind: 'action',
        actionType: action.type,
        // When onError=skip/retry and the step ultimately failed, record as
        // 'skipped' so the run history makes clear the error was absorbed.
        status: result.status === 'failed' && (action.onError === 'skip' || action.onError === 'retry') ? 'skipped' : result.status,
        detail: result.detail,
      });
      // filter gate: when stop is true (filter condition not met), halt remaining actions.
      if (result.stop) break;
      // Error gate: stop on failure unless onError=skip/retry.
      if (failedAndStop) break;
    }

    // 4. Terminal status.
    if (anyFailed) {
      await finishRun({ runId, status: 'failed', summary: 'one or more actions failed' });
      await updateWorkflowLastRun({ workflowId: workflow.id, lastRunStatus: 'error' });
      if (workflow.notifyOnError) {
        // Durable in-app record + ephemeral push — a failed automation must
        // stay visible in the bell after the push is gone (honest degraded
        // state). Both are best-effort.
        createAppNotification({
          spaceId: workflow.spaceId,
          type: 'automation',
          title: 'Automation failed',
          body: 'One or more steps in your workflow failed. Check the run history for details.',
          spacePath: '/automations',
          priority: 'high',
        }).catch(() => {/* best-effort */});
        sendPushToSpace(workflow.spaceId, {
          title: 'Automation failed',
          body: `One or more steps in your workflow failed. Check the run history for details.`,
        }).catch(() => {/* best-effort */});
      }
      return { runId, status: 'failed' };
    }
    await finishRun({ runId, status: 'completed', summary: 'all actions completed' });
    await updateWorkflowLastRun({ workflowId: workflow.id, lastRunStatus: 'ok' });
    return { runId, status: 'completed' };
  } catch (err) {
    // 5. Unexpected — mark the run failed and report. executeAction itself never
    //    throws, so reaching here means a ledger/eval surprise.
    logger.error('[workflows.executor] run threw', { workflowId: workflow.id, runId }, err);
    await finishRun({
      runId,
      status: 'failed',
      summary: 'workflow run errored',
      error: err instanceof Error ? err.message : String(err),
    });
    await updateWorkflowLastRun({ workflowId: workflow.id, lastRunStatus: 'error' });
    if (workflow.notifyOnError) {
      createAppNotification({
        spaceId: workflow.spaceId,
        type: 'automation',
        title: 'Automation errored',
        body: 'An unexpected error occurred in your workflow. Check the run history for details.',
        spacePath: '/automations',
        priority: 'high',
      }).catch(() => {/* best-effort */});
      sendPushToSpace(workflow.spaceId, {
        title: 'Automation errored',
        body: `An unexpected error occurred in your workflow. Check the run history for details.`,
      }).catch(() => {/* best-effort */});
    }
    return { runId, status: 'failed' };
  }
}

export interface RunWorkflowsForEventInput {
  spaceId: string;
  triggerType: TriggerType;
  context: WorkflowContext;
  triggerEvent: unknown;
}

/**
 * Entry point for the trigger-wiring pass: run every enabled workflow in the
 * space whose trigger fires for `triggerType`.
 *
 * Matching is trigger.type equality, plus a trigger-specific gate: a
 * 'lead_score_threshold' workflow only runs when the event score meets the
 * workflow's `trigger.config.min`. This `min` gate is the REAL enforcement of
 * the threshold (workflow conditions remain an additional, independent filter);
 * without it a lead_score_threshold workflow would fire on every scored lead.
 * An 'integration_event' workflow is likewise narrowed to its configured
 * toolkit+event slug, so a Composio delivery only evaluates the workflows keyed
 * to that exact app/event — replacing the old "every integration_event workflow
 * on every delivery" behavior.
 * Runs are sequential — the volume per event is small and a workflow's actions
 * already bound themselves; sequential keeps the ordering deterministic and
 * avoids hammering the agent runner concurrently.
 */
/** Diagnostic for an integration_event that had candidate workflows but matched
 *  none (so "why didn't it fire?" is answerable, not silent). */
export interface UnmatchedEventDiagnostic {
  candidates: number;
  toolkit: unknown;
  event: unknown;
}

export interface WorkflowMatchResult {
  matching: WorkflowRow[];
  unmatched: UnmatchedEventDiagnostic | null;
}

/**
 * PURE matching: from the space's enabled workflows, pick the ones this event
 * should run — trigger-type equality plus the per-type gates (lead_score `min`,
 * integration_event toolkit+event). For an integration_event that has candidate
 * workflows (right trigger type) but matches none on the slug, returns an
 * `unmatched` diagnostic so a wrong-slug miss is observable rather than silent.
 * Extracted + exported so the gating is unit-tested without a DB.
 */
export function selectMatchingWorkflows(
  workflows: WorkflowRow[],
  input: Pick<RunWorkflowsForEventInput, 'triggerType' | 'context'>,
): WorkflowMatchResult {
  const candidates = workflows.filter((w) => w.trigger?.type === input.triggerType);
  let matching = candidates;
  let unmatched: UnmatchedEventDiagnostic | null = null;

  // lead_score_threshold: only run when the event score meets `min`. Score
  // unknown/non-numeric → fail closed (skip all) since this gates auto-sends.
  if (input.triggerType === 'lead_score_threshold') {
    const rawScore = (input.context.event as Record<string, unknown> | undefined)?.score;
    const score = typeof rawScore === 'number' ? rawScore : Number(rawScore);
    if (!Number.isFinite(score)) {
      matching = [];
    } else {
      matching = candidates.filter((w) => {
        const rawMin = (w.trigger?.config as Record<string, unknown> | undefined)?.min;
        const min = typeof rawMin === 'number' ? rawMin : Number(rawMin) || 0;
        return score >= min;
      });
    }
  }

  // deal_stage_changed: if a workflow scopes its trigger to a specific
  // `toStage`, only run it when the deal actually moved INTO that stage. A
  // workflow with no toStage (blank) fires on every stage change. Matching is
  // case-insensitive on the stage name carried in the event.
  if (input.triggerType === 'deal_stage_changed') {
    const evStage = (input.context.event as Record<string, unknown> | undefined)?.toStage;
    const evStageNorm = typeof evStage === 'string' ? evStage.trim().toLowerCase() : '';
    matching = candidates.filter((w) => {
      const want = (w.trigger?.config as Record<string, unknown> | undefined)?.toStage;
      if (typeof want !== 'string' || !want.trim()) return true; // no scope → any stage
      return want.trim().toLowerCase() === evStageNorm;
    });
  }

  // inbound_message: if a workflow scopes its trigger to a channel (sms|email),
  // only run it when the message arrived on that channel. 'any' (or unset) fires
  // for every inbound channel. The event carries the channel the message came in
  // on. An event channel of 'any'/unknown matches only unscoped workflows.
  if (input.triggerType === 'inbound_message') {
    const evChannelRaw = (input.context.event as Record<string, unknown> | undefined)?.channel;
    const evChannel = typeof evChannelRaw === 'string' ? evChannelRaw.toLowerCase() : '';
    matching = candidates.filter((w) => {
      const wantRaw = (w.trigger?.config as Record<string, unknown> | undefined)?.channel;
      const want = typeof wantRaw === 'string' ? wantRaw.toLowerCase() : '';
      if (!want || want === 'any') return true; // no scope → any channel
      return want === evChannel;
    });
  }

  // integration_event: narrow to the workflow keyed to this exact toolkit+event.
  if (input.triggerType === 'integration_event') {
    const ev = input.context.event as Record<string, unknown> | undefined;
    const eventToolkit = ev?.toolkit;
    const eventSlug = ev?.event;
    matching = candidates.filter((w) => {
      const cfg = w.trigger?.config as Record<string, unknown> | undefined;
      return cfg?.toolkit === eventToolkit && cfg?.event === eventSlug;
    });
    if (candidates.length > 0 && matching.length === 0) {
      unmatched = { candidates: candidates.length, toolkit: eventToolkit, event: eventSlug };
    }
  }

  return { matching, unmatched };
}

/**
 * Load the space's enabled workflows, retrying a transient query failure a few
 * times before giving up. The SELECT is a READ (idempotent), so retrying is
 * safe and turns a transient DB blip — which previously SILENTLY dropped every
 * workflow firing for the event — into a recovery. A persistent failure logs
 * loudly (the event's workflows genuinely couldn't be evaluated) and returns [].
 */
async function loadEnabledWorkflows(spaceId: string): Promise<WorkflowRow[]> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from('Workflow')
      .select('id, spaceId, trigger, conditions, actions, autonomy, graph')
      .eq('spaceId', spaceId)
      .eq('enabled', true);
    if (!error) return (data ?? []) as unknown as WorkflowRow[];
    logger.warn(
      '[workflows.executor] workflow query failed; retrying',
      { spaceId, attempt, maxAttempts: MAX_ATTEMPTS },
      error,
    );
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
  logger.error(
    '[workflows.executor] workflow query failed after retries — workflows NOT evaluated for this event',
    { spaceId },
  );
  return [];
}

/** Summary of a runWorkflowsForEvent pass — `matched` workflows selected for the
 *  event, and `ran` of them that actually ACTED (conditions held and the actions
 *  ran: a 'completed' or 'failed' run). A run that was 'skipped' because its
 *  conditions didn't match is NOT counted — it matched the trigger but did no
 *  work, so it must not look like a fire. A caller uses `ran > 0` to know the
 *  event drove real work even when no other dispatch kind fired (so e.g. a
 *  trigger's lastFiredAt can be stamped). */
export interface RunWorkflowsForEventResult {
  matched: number;
  ran: number;
}

export async function runWorkflowsForEvent(
  input: RunWorkflowsForEventInput,
): Promise<RunWorkflowsForEventResult> {
  const workflows = await loadEnabledWorkflows(input.spaceId);
  const { matching, unmatched } = selectMatchingWorkflows(workflows, input);

  // Most callers dispatch this inside a post-response after(), which has a
  // bounded execution budget on Vercel. A very large fan-out for a single event
  // could see its LATE runs truncated. We don't cap (that would silently DROP a
  // configured workflow); instead surface it so a real fan-out problem is
  // observable rather than a mystery. A durable queue is the structural fix.
  if (matching.length > 20) {
    logger.warn(
      '[workflows.executor] large workflow fan-out for one event; post-response budget may truncate late runs',
      { spaceId: input.spaceId, triggerType: input.triggerType, matched: matching.length },
    );
  }

  // A delivery with candidate workflows but no slug match is the classic
  // "my workflow won't fire" — surface it (wrong/typo'd slug, etc.).
  if (unmatched) {
    logger.warn('[workflows.executor] integration_event matched no workflow', {
      spaceId: input.spaceId,
      candidates: unmatched.candidates,
      toolkit: unmatched.toolkit,
      event: unmatched.event,
    });
  }

  let ran = 0;
  for (const workflow of matching) {
    try {
      const result = await runWorkflow({
        workflow,
        context: input.context,
        triggerEvent: input.triggerEvent,
      });
      // Count only runs that actually acted. A 'skipped' run (conditions didn't
      // match) matched the trigger but did no work, so it must not register as a
      // fire — otherwise an everyday event that fails a workflow's condition
      // would wrongly stamp the trigger 'fired' and the event 'dispatched'.
      if (result.status !== 'skipped') ran++;
    } catch (err) {
      // runWorkflow already swallows; this is belt-and-suspenders so one bad
      // workflow can't stop the rest of the batch.
      logger.error('[workflows.executor] runWorkflow threw in batch', { workflowId: workflow.id }, err);
    }
  }
  return { matched: matching.length, ran };
}
