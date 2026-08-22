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
import { tenantTable } from '@/lib/tenant-db';

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
// notifyOnError is omitted here until migration 20260807000000_workflow_notify_on_error.sql
// is applied to production. The column defaults false in the app layer (mapRow below).
const SELECT =
  'id, spaceId, name, description, enabled, trigger, conditions, actions, autonomy, graph, notifyOnError, version, lastRunAt, lastRunStatus, createdAt, updatedAt';

/**
 * The full persisted row as the routes surface it — the executor's WorkflowRow
 * plus the management/presentation columns. The executor only needs the subset
 * declared on WorkflowRow; the routes return everything.
 */
export interface WorkflowRecord extends WorkflowRow {
  name: string;
  description: string | null;
  enabled: boolean;
  notifyOnError: boolean;
  version: number;
  lastRunAt: string | null;
  lastRunStatus: 'ok' | 'error' | 'skipped' | null;
  createdAt: string;
  updatedAt: string;
}

/** Map a raw DB row (jsonb columns already objects) to a WorkflowRecord. */
function mapRow(row: Record<string, unknown>): WorkflowRecord {
  return { notifyOnError: false, ...row } as unknown as WorkflowRecord;
}

/** List the space's workflows, newest first. */
export async function listWorkflows(spaceId: string): Promise<WorkflowRecord[]> {
  const { data, error } = await tenantTable(supabase, 'Workflow', { spaceId })
    .select(SELECT)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => mapRow(r));
}

/** Load one workflow by id, scoped to the space. Null when not found/owned. */
export async function getWorkflow(
  spaceId: string,
  id: string,
): Promise<WorkflowRecord | null> {
  const { data, error } = await tenantTable(supabase, 'Workflow', { spaceId })
    .select(SELECT)
    .eq('id', id)
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
  input: { name: string; description?: string; definition: WorkflowDefinition; enabled?: boolean; notifyOnError?: boolean },
): Promise<WorkflowRecord> {
  const { name, description, definition, enabled = true, notifyOnError = false } = input;
  const { data, error } = await tenantTable(supabase, 'Workflow', { spaceId })
    .insert({
      spaceId,
      name,
      ...(description ? { description } : {}),
      enabled,
      notifyOnError,
      trigger: definition.trigger,
      conditions: definition.conditions,
      actions: definition.actions,
      autonomy: definition.autonomy,
      // null (not undefined) so a linear workflow explicitly clears any graph.
      graph: definition.graph ?? null,
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
  description?: string | null;
  enabled?: boolean;
  notifyOnError?: boolean;
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
  if (patch.description !== undefined) update.description = patch.description ?? null;
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.notifyOnError !== undefined) update.notifyOnError = patch.notifyOnError;
  if (patch.definition) {
    update.trigger = patch.definition.trigger;
    update.conditions = patch.definition.conditions;
    update.actions = patch.definition.actions;
    update.autonomy = patch.definition.autonomy;
    // null (not undefined) so switching a branching workflow back to linear
    // clears the stored graph rather than leaving a stale one behind.
    update.graph = patch.definition.graph ?? null;
    // The definition shape changed — bump version so a run records which ran.
    // FOLLOW-UP: the read-then-write version bump is non-atomic (two concurrent
    // updates can compute the same next version). Move to an atomic increment.
    update.version = await nextVersion(spaceId, id);
  }

  const { data, error } = await tenantTable(supabase, 'Workflow', { spaceId })
    .update(update)
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/** Read the current version (scoped) and return current + 1 for a bump. A
 *  missing row falls back to 1 — the update itself will then match nothing. */
async function nextVersion(spaceId: string, id: string): Promise<number> {
  const { data } = await tenantTable(supabase, 'Workflow', { spaceId })
    .select('version')
    .eq('id', id)
    .maybeSingle();
  const current = (data as { version?: number } | null)?.version ?? 0;
  return current + 1;
}

/** Delete a workflow, scoped by id + spaceId. True when a matching row existed. */
export async function deleteWorkflow(spaceId: string, id: string): Promise<boolean> {
  const { data, error } = await tenantTable(supabase, 'Workflow', { spaceId })
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Count the space's workflows — used by the create cap. */
export async function countWorkflows(spaceId: string): Promise<number> {
  const { count, error } = await tenantTable(supabase, 'Workflow', { spaceId })
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

/**
 * Return a map of workflowId → total run count for the space's workflows.
 *
 * Uses a grouped-COUNT RPC (count_runs_per_workflow) so the aggregation happens
 * in Postgres and only one row per workflow crosses the wire — the previous
 * implementation SELECTed every WorkflowRun row for the space and counted in
 * JS, an unbounded transfer that grew with run history. Degrades gracefully:
 * any error (e.g. the migration not yet applied) yields an empty map, and the
 * caller renders a 0 count rather than failing the whole workflow list.
 */
export async function countRunsPerWorkflow(spaceId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { data, error } = await supabase.rpc('count_runs_per_workflow', { p_space_id: spaceId });
  if (error || !Array.isArray(data)) return counts;
  for (const row of data as { workflowId: string; run_count: number }[]) {
    if (row?.workflowId != null) counts.set(row.workflowId, Number(row.run_count) || 0);
  }
  return counts;
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
  const { data, error } = await tenantTable(supabase, 'WorkflowRun', { spaceId })
    .select(RUN_SELECT)
    .eq('workflowId', workflowId)
    .order('startedAt', { ascending: false })
    .limit(capped);
  if (error) throw error;
  return (data ?? []) as unknown as WorkflowRunRecord[];
}

/** A run record enriched with the parent workflow's name for the global history view. */
export interface GlobalWorkflowRunRecord extends WorkflowRunRecord {
  workflowName: string;
}

/**
 * List recent runs across ALL workflows in a space, newest first. Used by the
 * global History tab — the equivalent of Zapier's "Zap History" page.
 *
 * Security: scoped entirely by spaceId on the WorkflowRun row — no ownership
 * check on individual workflows needed because the run's own spaceId is the
 * authoritative guard. Workflow names are fetched separately and joined in code
 * (avoids depending on PostgREST FK inference).
 */
export async function listAllWorkflowRuns(
  spaceId: string,
  limit = 50,
): Promise<GlobalWorkflowRunRecord[]> {
  const capped = Math.max(1, Math.min(limit, 100));
  const { data: runs, error } = await tenantTable(supabase, 'WorkflowRun', { spaceId })
    .select(RUN_SELECT)
    .order('startedAt', { ascending: false })
    .limit(capped);
  if (error) throw error;
  if (!runs || runs.length === 0) return [];

  const workflowIds = [...new Set((runs as Record<string, unknown>[]).map((r) => r.workflowId as string))];
  const { data: wfs, error: wErr } = await tenantTable(supabase, 'Workflow', { spaceId })
    .select('id, name')
    .in('id', workflowIds);
  if (wErr) throw wErr;

  const nameMap = new Map<string, string>(
    ((wfs ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]),
  );

  return (runs as unknown as WorkflowRunRecord[]).map((r) => ({
    ...r,
    workflowName: nameMap.get(r.workflowId) ?? 'Unknown workflow',
  }));
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
  const { data: run, error: runErr } = await tenantTable(supabase, 'WorkflowRun', { spaceId })
    .select('id')
    .eq('id', runId)
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
