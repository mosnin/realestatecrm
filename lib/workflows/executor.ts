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
import { evaluateConditions } from './conditions';
import { executeAction, type WorkflowContext, type ActionStepResult } from './actions';
import type {
  ConditionGroup,
  TriggerType,
  WorkflowAction,
  WorkflowAutonomy,
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
  const { error } = await supabase
    .from('WorkflowRun')
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
  const { error } = await supabase
    .from('Workflow')
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
    // 2. The IF gate.
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
      const result: ActionStepResult = await executeAction(action, context, {
        spaceId: workflow.spaceId,
        autonomy: workflow.autonomy,
        runId,
      });
      if (result.status === 'failed') anyFailed = true;
      await writeStep({
        runId,
        stepIndex: i + 1,
        kind: 'action',
        actionType: action.type,
        status: result.status,
        detail: result.detail,
      });
    }

    // 4. Terminal status.
    if (anyFailed) {
      await finishRun({ runId, status: 'failed', summary: 'one or more actions failed' });
      await updateWorkflowLastRun({ workflowId: workflow.id, lastRunStatus: 'error' });
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
export async function runWorkflowsForEvent(input: RunWorkflowsForEventInput): Promise<void> {
  const { data: rows, error } = await supabase
    .from('Workflow')
    .select('id, spaceId, trigger, conditions, actions, autonomy')
    .eq('spaceId', input.spaceId)
    .eq('enabled', true);
  if (error) {
    logger.error('[workflows.executor] workflow query failed', { spaceId: input.spaceId }, error);
    return;
  }

  const workflows = (rows ?? []) as unknown as WorkflowRow[];
  let matching = workflows.filter((w) => w.trigger?.type === input.triggerType);

  // Trigger-specific gate for lead_score_threshold: only run a workflow whose
  // configured `min` is met by the event's score. The score rides on
  // context.event.score (see app/api/public/apply/route.ts). This is the real
  // enforcement of `min`; conditions are a further filter on top.
  if (input.triggerType === 'lead_score_threshold') {
    const rawScore = (input.context.event as Record<string, unknown> | undefined)?.score;
    const score = typeof rawScore === 'number' ? rawScore : Number(rawScore);
    // Score unknown / non-numeric → skip every threshold workflow: this gates
    // auto-sends, so when we can't compare we fail closed rather than fire.
    if (!Number.isFinite(score)) {
      matching = [];
    } else {
      matching = matching.filter((w) => {
        const rawMin = (w.trigger?.config as Record<string, unknown> | undefined)?.min;
        // A malformed/missing min coerces to 0 (treat as "any score qualifies"),
        // so a well-formed event still runs rather than silently dropping.
        const min = typeof rawMin === 'number' ? rawMin : Number(rawMin) || 0;
        return score >= min;
      });
    }
  }

  // Trigger-specific gate for integration_event: only run a workflow whose
  // configured toolkit+event matches the delivery. The delivery's app/event
  // ride on context.event.toolkit/event (set in dispatchTrigger). This replaces
  // the old behavior of running EVERY integration_event workflow on EVERY
  // Composio delivery; per-event narrowing now happens here, not in conditions.
  if (input.triggerType === 'integration_event') {
    const ev = input.context.event as Record<string, unknown> | undefined;
    const eventToolkit = ev?.toolkit;
    const eventSlug = ev?.event;
    matching = matching.filter((w) => {
      const cfg = w.trigger?.config as Record<string, unknown> | undefined;
      return cfg?.toolkit === eventToolkit && cfg?.event === eventSlug;
    });
  }

  for (const workflow of matching) {
    try {
      await runWorkflow({ workflow, context: input.context, triggerEvent: input.triggerEvent });
    } catch (err) {
      // runWorkflow already swallows; this is belt-and-suspenders so one bad
      // workflow can't stop the rest of the batch.
      logger.error('[workflows.executor] runWorkflow threw in batch', { workflowId: workflow.id }, err);
    }
  }
}
