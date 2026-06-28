/**
 * Workflow STORE — thin DB helpers over the "Workflow" table.
 *
 * Keeps the API routes skinny and unit-testable: a route validates the request
 * (auth, space-ownership, name bounds, parseWorkflowDefinition) and then calls
 * one of these helpers, which own the row ↔ WorkflowRow mapping and the
 * jsonb-column writes. Every read/write is scoped by spaceId so a workflow that
 * isn't the caller's simply doesn't match — ownership and "not found" in one.
 *
 * The trigger / conditions / actions columns are jsonb; supabase returns them as
 * plain objects, so the mapping here is a straight cast of the already-validated
 * shapes. version is bumped by updateWorkflow whenever the definition changes so
 * a run can record which shape ran.
 */

import { supabase } from '@/lib/supabase';
import type { WorkflowRow } from './executor';
import type { WorkflowDefinition } from './schema';

/**
 * Cap on workflows per space — a wall of standing automations is its own mess,
 * and each enabled workflow is work the dispatcher does per event. Mirrors the
 * MAX_ROUTINES cap on the Routine routes.
 */
export const MAX_WORKFLOWS_PER_SPACE = 50;

/**
 * The columns we read back for a WorkflowRow. We always select the full set the
 * executor and the routes need (the executor's WorkflowRow plus the
 * presentation columns: name, enabled, version, lastRun*, timestamps).
 */
const SELECT =
  'id, spaceId, name, enabled, trigger, conditions, actions, autonomy, version, lastRunAt, lastRunStatus, createdAt, updatedAt';

/**
 * The full persisted row as the routes surface it — the executor's WorkflowRow
 * plus the management/presentation columns. The executor only needs the subset
 * declared on WorkflowRow; the routes return everything.
 */
export interface WorkflowRecord extends WorkflowRow {
  name: string;
  enabled: boolean;
  version: number;
  lastRunAt: string | null;
  lastRunStatus: 'ok' | 'error' | 'skipped' | null;
  createdAt: string;
  updatedAt: string;
}

/** Map a raw DB row (jsonb columns already objects) to a WorkflowRecord. */
function mapRow(row: Record<string, unknown>): WorkflowRecord {
  return row as unknown as WorkflowRecord;
}

/** List the space's workflows, newest first. */
export async function listWorkflows(spaceId: string): Promise<WorkflowRecord[]> {
  const { data, error } = await supabase
    .from('Workflow')
    .select(SELECT)
    .eq('spaceId', spaceId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** Load one workflow by id, scoped to the space. Null when not found/owned. */
export async function getWorkflow(
  spaceId: string,
  id: string,
): Promise<WorkflowRecord | null> {
  const { data, error } = await supabase
    .from('Workflow')
    .select(SELECT)
    .eq('id', id)
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/**
 * Create a workflow from an ALREADY-VALIDATED definition (the route runs
 * parseWorkflowDefinition first). Spreads the definition's trigger / conditions
 * / actions / autonomy into their columns; enabled defaults true.
 */
export async function createWorkflow(
  spaceId: string,
  input: { name: string; definition: WorkflowDefinition },
): Promise<WorkflowRecord> {
  const { name, definition } = input;
  const { data, error } = await supabase
    .from('Workflow')
    .insert({
      spaceId,
      name,
      enabled: true,
      trigger: definition.trigger,
      conditions: definition.conditions,
      actions: definition.actions,
      autonomy: definition.autonomy,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

/** Patch accepted by updateWorkflow. A new definition replaces the four shape
 *  columns and bumps version. */
export interface UpdateWorkflowPatch {
  name?: string;
  enabled?: boolean;
  definition?: WorkflowDefinition;
}

/**
 * Update name / enabled / definition, scoped by id + spaceId. When `definition`
 * is present (already validated by the route) we replace trigger / conditions /
 * actions / autonomy together and bump `version` so runs can record which shape
 * ran. Returns null when no row matched (not found/owned).
 */
export async function updateWorkflow(
  spaceId: string,
  id: string,
  patch: UpdateWorkflowPatch,
): Promise<WorkflowRecord | null> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.definition) {
    update.trigger = patch.definition.trigger;
    update.conditions = patch.definition.conditions;
    update.actions = patch.definition.actions;
    update.autonomy = patch.definition.autonomy;
    // The definition shape changed — bump version so a run records which ran.
    update.version = await nextVersion(spaceId, id);
  }

  const { data, error } = await supabase
    .from('Workflow')
    .update(update)
    .eq('id', id)
    .eq('spaceId', spaceId)
    .select(SELECT)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/** Read the current version (scoped) and return current + 1 for a bump. A
 *  missing row falls back to 1 — the update itself will then match nothing. */
async function nextVersion(spaceId: string, id: string): Promise<number> {
  const { data } = await supabase
    .from('Workflow')
    .select('version')
    .eq('id', id)
    .eq('spaceId', spaceId)
    .maybeSingle();
  const current = (data as { version?: number } | null)?.version ?? 0;
  return current + 1;
}

/** Delete a workflow, scoped by id + spaceId. True when a matching row existed. */
export async function deleteWorkflow(spaceId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('Workflow')
    .delete()
    .eq('id', id)
    .eq('spaceId', spaceId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Count the space's workflows — used by the create cap. */
export async function countWorkflows(spaceId: string): Promise<number> {
  const { count, error } = await supabase
    .from('Workflow')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', spaceId);
  if (error) throw error;
  return count ?? 0;
}

// ── Run history (read-only audit trail) ──────────────────────────────────────
//
// The executor writes WorkflowRun + WorkflowRunStep rows as it runs; these
// helpers surface them so a realtor can see what fired, when, and what each step
// did. Read-only: nothing here writes. Both reads carry a spaceId guard so a run
// (or its steps) that isn't the caller's never matches — cross-tenant isolation
// is enforced at the query, not just by trusting an upstream id.

/** Cap on how many runs we ever surface per workflow — the audit trail is a
 *  recent-history view, not an unbounded export. */
export const MAX_WORKFLOW_RUNS = 20;

/** Columns read back for a WorkflowRun row (the run-history list). */
const RUN_SELECT =
  'id, workflowId, spaceId, status, triggerEvent, summary, error, startedAt, finishedAt';

/** Columns read back for a WorkflowRunStep row (a run's timeline). */
const RUN_STEP_SELECT = 'id, runId, stepIndex, kind, actionType, status, detail, createdAt';

/** One execution of a workflow, as the run-history surface presents it. */
export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  spaceId: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  triggerEvent: unknown;
  summary: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** One step within a run: a condition gate or an action. */
export interface WorkflowRunStepRecord {
  id: string;
  runId: string;
  stepIndex: number;
  kind: 'condition' | 'action';
  actionType: string | null;
  status: 'ok' | 'failed' | 'skipped';
  detail: unknown;
  createdAt: string;
}

/**
 * List a workflow's recent runs, newest first. We verify the workflow belongs to
 * the space FIRST (getWorkflow is itself id + spaceId scoped) and return [] when
 * it isn't owned — a caller can't probe another space's run history by guessing a
 * workflow id. The WorkflowRun query is then doubly scoped by workflowId AND
 * spaceId, so even a future cross-space workflowId can't leak rows.
 */
export async function listWorkflowRuns(
  spaceId: string,
  workflowId: string,
  limit = MAX_WORKFLOW_RUNS,
): Promise<WorkflowRunRecord[]> {
  const owned = await getWorkflow(spaceId, workflowId);
  if (!owned) return [];

  const capped = Math.max(1, Math.min(limit, MAX_WORKFLOW_RUNS));
  const { data, error } = await supabase
    .from('WorkflowRun')
    .select(RUN_SELECT)
    .eq('workflowId', workflowId)
    .eq('spaceId', spaceId)
    .order('startedAt', { ascending: false })
    .limit(capped);
  if (error) throw error;
  return (data ?? []) as unknown as WorkflowRunRecord[];
}

/**
 * Fetch one run's steps, ordered by stepIndex. The run is loaded WITH a spaceId
 * filter first, so a runId that belongs to another space resolves to nothing and
 * we return [] — the steps are only ever read once the run's space is confirmed
 * to be the caller's. No cross-tenant step leakage.
 */
export async function getWorkflowRunSteps(
  spaceId: string,
  runId: string,
): Promise<WorkflowRunStepRecord[]> {
  const { data: run, error: runErr } = await supabase
    .from('WorkflowRun')
    .select('id')
    .eq('id', runId)
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (runErr) throw runErr;
  if (!run) return [];

  const { data, error } = await supabase
    .from('WorkflowRunStep')
    .select(RUN_STEP_SELECT)
    .eq('runId', runId)
    .order('stepIndex', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as WorkflowRunStepRecord[];
}
