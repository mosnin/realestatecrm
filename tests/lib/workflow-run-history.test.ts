/**
 * Workflow RUN HISTORY (audit trail) store tests.
 *
 * lib/workflows/store.ts gained two read-only helpers over the executor's ledger:
 *   - listWorkflowRuns  — a workflow's recent runs, newest first, but ONLY after
 *     verifying the workflow belongs to the space (getWorkflow). Returns [] for a
 *     workflow the space doesn't own — no probing another tenant's history.
 *   - getWorkflowRunSteps — a run's steps in stepIndex order, but ONLY after the
 *     run is confirmed to belong to the space (a spaceId-scoped run lookup first).
 *
 * We mock '@/lib/supabase' with a chainable builder (vi.hoisted) that records
 * every query's table, filters, order, and limit, and serves reads from a queue
 * so the multi-query helpers (getWorkflow → runs; run lookup → steps) each get
 * their own row set. The assertions are the OBSERVABLE space-scoping contract:
 * every WorkflowRun / WorkflowRunStep query carries the spaceId guard (directly
 * or via a verified-owned parent), the ordering/limit are correct, and an
 * unowned workflow / foreign run leaks nothing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── supabase mock ────────────────────────────────────────────────────────────
// Records each query (table, op, filters, order, limit). Reads are served FIFO
// from `rowQueue` (for single/maybeSingle) and `rowsQueue` (for list terminals),
// so a helper that issues two queries (e.g. getWorkflow then the runs select)
// pulls a distinct result for each. Chainable + thenable.
const { calls, rowQueue, rowsQueue } = vi.hoisted(() => ({
  calls: [] as Array<{
    table: string;
    op: 'select';
    filters: Record<string, unknown>;
    order?: { col: string; ascending: boolean };
    limit?: number;
  }>,
  rowQueue: { value: [] as unknown[] },
  rowsQueue: { value: [] as unknown[][] },
}));

function nextRow(): unknown {
  return rowQueue.value.length ? rowQueue.value.shift() : null;
}
function nextRows(): unknown[] {
  return rowsQueue.value.length ? (rowsQueue.value.shift() as unknown[]) : [];
}

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const record = {
      table,
      op: 'select' as const,
      filters: {} as Record<string, unknown>,
      order: undefined as { col: string; ascending: boolean } | undefined,
      limit: undefined as number | undefined,
    };

    const chain: Record<string, unknown> = {
      select() {
        return chain;
      },
      eq(col: string, val: unknown) {
        record.filters[col] = val;
        return chain;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        record.order = { col, ascending: opts?.ascending ?? true };
        return chain;
      },
      limit(n: number) {
        record.limit = n;
        // Terminal for list-with-limit: resolve to the next rows set.
        calls.push({ ...record });
        return Promise.resolve({ data: nextRows(), error: null });
      },
      maybeSingle() {
        calls.push({ ...record });
        return Promise.resolve({ data: nextRow(), error: null });
      },
      single() {
        calls.push({ ...record });
        return Promise.resolve({ data: nextRow(), error: null });
      },
      // Terminal for an awaited chain with no .limit (the steps select uses
      // .order(...) then await): resolve to the next rows set.
      then(resolve: (v: Record<string, unknown>) => unknown) {
        calls.push({ ...record });
        return resolve({ data: nextRows(), error: null });
      },
    };
    return chain;
  };
  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

import {
  listWorkflowRuns,
  getWorkflowRunSteps,
  MAX_WORKFLOW_RUNS,
} from '@/lib/workflows/store';

const SPACE = 'space-1';
const OTHER = 'space-2';
const WF = 'wf-1';

beforeEach(() => {
  calls.length = 0;
  rowQueue.value = [];
  rowsQueue.value = [];
});

function callsFor(table: string) {
  return calls.filter((c) => c.table === table);
}

describe('listWorkflowRuns', () => {
  it('returns [] when the workflow is not owned by the space (never queries WorkflowRun)', async () => {
    // getWorkflow resolves to null → not owned.
    rowQueue.value = [null];

    const runs = await listWorkflowRuns(SPACE, WF);
    expect(runs).toEqual([]);

    // Ownership was checked, scoped by id + spaceId…
    const wfCalls = callsFor('Workflow');
    expect(wfCalls).toHaveLength(1);
    expect(wfCalls[0].filters.id).toBe(WF);
    expect(wfCalls[0].filters.spaceId).toBe(SPACE);
    // …and we NEVER touched the run ledger for an unowned workflow.
    expect(callsFor('WorkflowRun')).toHaveLength(0);
  });

  it('returns runs scoped by workflowId + spaceId, ordered startedAt desc, limited', async () => {
    // 1st query: getWorkflow → an owned row. 2nd query: the runs select.
    rowQueue.value = [{ id: WF, spaceId: SPACE }];
    rowsQueue.value = [[{ id: 'run-b' }, { id: 'run-a' }]];

    const runs = await listWorkflowRuns(SPACE, WF, 5);
    expect(runs).toHaveLength(2);

    const runCall = callsFor('WorkflowRun')[0];
    expect(runCall).toBeDefined();
    // Cross-tenant guard: BOTH workflowId and spaceId filter the run query.
    expect(runCall.filters.workflowId).toBe(WF);
    expect(runCall.filters.spaceId).toBe(SPACE);
    expect(runCall.order).toEqual({ col: 'startedAt', ascending: false });
    expect(runCall.limit).toBe(5);
  });

  it('caps the limit at MAX_WORKFLOW_RUNS', async () => {
    rowQueue.value = [{ id: WF, spaceId: SPACE }];
    rowsQueue.value = [[]];

    await listWorkflowRuns(SPACE, WF, 999);
    const runCall = callsFor('WorkflowRun')[0];
    expect(runCall.limit).toBe(MAX_WORKFLOW_RUNS);
  });
});

describe('getWorkflowRunSteps', () => {
  it('verifies the run belongs to the space, then orders steps by stepIndex', async () => {
    // 1st query: the spaceId-scoped run lookup → found. 2nd query: the steps.
    rowQueue.value = [{ id: 'run-1' }];
    rowsQueue.value = [[{ id: 's0', stepIndex: 0 }, { id: 's1', stepIndex: 1 }]];

    const steps = await getWorkflowRunSteps(SPACE, 'run-1');
    expect(steps).toHaveLength(2);

    // The run lookup carries the spaceId guard (and the run id).
    const runCall = callsFor('WorkflowRun')[0];
    expect(runCall.filters.id).toBe('run-1');
    expect(runCall.filters.spaceId).toBe(SPACE);

    // Steps are scoped by runId and ordered ascending by stepIndex.
    const stepCall = callsFor('WorkflowRunStep')[0];
    expect(stepCall.filters.runId).toBe('run-1');
    expect(stepCall.order).toEqual({ col: 'stepIndex', ascending: true });
  });

  it('returns [] for a run in another space — no step leakage across tenants', async () => {
    // The spaceId-scoped run lookup finds nothing (run belongs to OTHER).
    rowQueue.value = [null];

    const steps = await getWorkflowRunSteps(OTHER, 'run-1');
    expect(steps).toEqual([]);

    // The run lookup still carried the spaceId guard…
    const runCall = callsFor('WorkflowRun')[0];
    expect(runCall.filters.id).toBe('run-1');
    expect(runCall.filters.spaceId).toBe(OTHER);
    // …and we NEVER read steps for an unconfirmed run.
    expect(callsFor('WorkflowRunStep')).toHaveLength(0);
  });
});
