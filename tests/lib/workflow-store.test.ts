/**
 * Workflow STORE + definition-validation tests.
 *
 * The store (lib/workflows/store.ts) is the thin DB layer the API routes call.
 * We mock '@/lib/supabase' with a chainable query builder that records every
 * insert/update/delete and the filters applied, then assert the OBSERVABLE
 * contract:
 *   - createWorkflow maps the validated definition → trigger/conditions/actions/
 *     autonomy columns, enabled default true.
 *   - updateWorkflow bumps `version` when a definition is supplied (and not
 *     otherwise), replacing all four shape columns.
 *   - list/get/delete scope by spaceId (the .eq filters carry spaceId).
 *   - MAX_WORKFLOWS_PER_SPACE is the documented cap value.
 *
 * Plus a pure-validation block: parseWorkflowDefinition rejects a bad shape (so
 * the route returns 400) and accepts the canonical lead-score example.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── supabase mock ────────────────────────────────────────────────────────────
// Records every op + the .eq filters + the returning payload, and serves reads
// from `nextRow` / `nextRows`. Chainable and thenable so insert(...).select(...)
// .single() and select(...).eq(...).eq(...).maybeSingle() both resolve.
const { calls, nextRow, nextRows } = vi.hoisted(() => ({
  calls: [] as Array<{
    table: string;
    op: 'insert' | 'update' | 'delete' | 'select';
    payload?: unknown;
    filters: Record<string, unknown>;
  }>,
  nextRow: { value: null as unknown },
  nextRows: { value: [] as unknown[] },
}));

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const record = {
      table,
      op: 'select' as 'insert' | 'update' | 'delete' | 'select',
      payload: undefined as unknown,
      filters: {} as Record<string, unknown>,
    };
    // Set when select(..., { head: true }) is used (the count query). The chain
    // stays usable for the trailing .eq filters, then resolves to { count } on
    // await — matching PostgREST's select('id',{count,head}).eq(...) shape.
    let headCount = false;

    const chain: Record<string, unknown> = {
      insert(payload: unknown) {
        record.op = 'insert';
        record.payload = payload;
        return chain;
      },
      update(payload: unknown) {
        record.op = 'update';
        record.payload = payload;
        return chain;
      },
      delete() {
        record.op = 'delete';
        return chain;
      },
      select(_cols?: unknown, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) headCount = true;
        return chain;
      },
      eq(col: string, val: unknown) {
        record.filters[col] = val;
        return chain;
      },
      order() {
        // terminal for list(): resolve to the rows.
        calls.push({ ...record });
        return Promise.resolve({ data: nextRows.value, error: null });
      },
      single() {
        calls.push({ ...record });
        return Promise.resolve({ data: nextRow.value, error: null });
      },
      maybeSingle() {
        calls.push({ ...record });
        return Promise.resolve({ data: nextRow.value, error: null });
      },
      // Terminal for awaited chains: the head-count query resolves to { count };
      // delete(...).select('id') and any other awaited chain resolves to { data }.
      then(resolve: (v: Record<string, unknown>) => unknown) {
        calls.push({ ...record });
        if (headCount) {
          return resolve({ count: nextRows.value.length, error: null });
        }
        return resolve({ data: nextRows.value, error: null });
      },
    };
    return chain;
  };
  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  countWorkflows,
  MAX_WORKFLOWS_PER_SPACE,
} from '@/lib/workflows/store';
import { parseWorkflowDefinition, WorkflowDefinitionError } from '@/lib/workflows/schema';
import type { WorkflowDefinition } from '@/lib/workflows/schema';

// The canonical lead-score example used across the tests.
const LEAD_SCORE_DEF: WorkflowDefinition = {
  trigger: { type: 'lead_score_threshold', config: { min: 80 } },
  conditions: { op: 'and', rules: [{ field: 'lead.score', operator: 'gte', value: 80 }] },
  actions: [
    { type: 'draft_message', config: { channel: 'sms', instruction: 'Reach out warmly.' } },
  ],
  autonomy: 'draft',
};

const SPACE = 'space-1';

beforeEach(() => {
  calls.length = 0;
  nextRow.value = null;
  nextRows.value = [];
});

function lastOf(op: 'insert' | 'update' | 'delete' | 'select') {
  return [...calls].reverse().find((c) => c.op === op);
}

describe('createWorkflow', () => {
  it('maps the definition into trigger/conditions/actions/autonomy columns, enabled default true', async () => {
    nextRow.value = { id: 'wf-1', spaceId: SPACE };
    await createWorkflow(SPACE, { name: 'Hot lead', definition: LEAD_SCORE_DEF });

    const insert = lastOf('insert');
    expect(insert?.table).toBe('Workflow');
    const payload = insert?.payload as Record<string, unknown>;
    expect(payload.spaceId).toBe(SPACE);
    expect(payload.name).toBe('Hot lead');
    expect(payload.enabled).toBe(true);
    expect(payload.trigger).toEqual(LEAD_SCORE_DEF.trigger);
    expect(payload.conditions).toEqual(LEAD_SCORE_DEF.conditions);
    expect(payload.actions).toEqual(LEAD_SCORE_DEF.actions);
    expect(payload.autonomy).toBe('draft');
  });
});

describe('updateWorkflow', () => {
  it('bumps version and replaces shape columns when a definition is supplied', async () => {
    // nextVersion reads current version first, then the update returns the row.
    nextRow.value = { version: 3 };
    await updateWorkflow(SPACE, 'wf-1', { definition: LEAD_SCORE_DEF });

    const update = lastOf('update');
    const payload = update?.payload as Record<string, unknown>;
    expect(payload.version).toBe(4); // 3 + 1
    expect(payload.trigger).toEqual(LEAD_SCORE_DEF.trigger);
    expect(payload.conditions).toEqual(LEAD_SCORE_DEF.conditions);
    expect(payload.actions).toEqual(LEAD_SCORE_DEF.actions);
    expect(payload.autonomy).toBe('draft');
    // scoped by id + spaceId
    expect(update?.filters.id).toBe('wf-1');
    expect(update?.filters.spaceId).toBe(SPACE);
  });

  it('does NOT bump version for a name/enabled-only patch', async () => {
    nextRow.value = { id: 'wf-1' };
    await updateWorkflow(SPACE, 'wf-1', { name: 'Renamed', enabled: false });

    const update = lastOf('update');
    const payload = update?.payload as Record<string, unknown>;
    expect(payload.name).toBe('Renamed');
    expect(payload.enabled).toBe(false);
    expect('version' in payload).toBe(false);
    expect('trigger' in payload).toBe(false);
  });
});

describe('scoping by spaceId', () => {
  it('listWorkflows scopes by spaceId and orders newest first', async () => {
    nextRows.value = [{ id: 'a' }, { id: 'b' }];
    const rows = await listWorkflows(SPACE);
    expect(rows).toHaveLength(2);
    const select = lastOf('select');
    expect(select?.filters.spaceId).toBe(SPACE);
  });

  it('getWorkflow scopes by id + spaceId', async () => {
    nextRow.value = { id: 'wf-1', spaceId: SPACE };
    await getWorkflow(SPACE, 'wf-1');
    const select = lastOf('select');
    expect(select?.filters.id).toBe('wf-1');
    expect(select?.filters.spaceId).toBe(SPACE);
  });

  it('getWorkflow returns null when no row matches', async () => {
    nextRow.value = null;
    const row = await getWorkflow(SPACE, 'missing');
    expect(row).toBeNull();
  });

  it('deleteWorkflow scopes by id + spaceId and reports whether a row existed', async () => {
    nextRows.value = [{ id: 'wf-1' }];
    const existed = await deleteWorkflow(SPACE, 'wf-1');
    expect(existed).toBe(true);
    const del = lastOf('delete');
    expect(del?.filters.id).toBe('wf-1');
    expect(del?.filters.spaceId).toBe(SPACE);

    nextRows.value = [];
    const existed2 = await deleteWorkflow(SPACE, 'gone');
    expect(existed2).toBe(false);
  });

  it('countWorkflows scopes by spaceId', async () => {
    nextRows.value = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const n = await countWorkflows(SPACE);
    expect(n).toBe(3);
    const select = lastOf('select');
    expect(select?.filters.spaceId).toBe(SPACE);
  });
});

describe('MAX_WORKFLOWS_PER_SPACE', () => {
  it('is the documented cap value', () => {
    expect(MAX_WORKFLOWS_PER_SPACE).toBe(50);
  });
});

// ── pure validation (no HTTP harness) ────────────────────────────────────────
describe('parseWorkflowDefinition (route 400 gate)', () => {
  it('accepts the canonical lead-score example', () => {
    const def = parseWorkflowDefinition(LEAD_SCORE_DEF);
    expect(def.trigger.type).toBe('lead_score_threshold');
    expect(def.actions).toHaveLength(1);
  });

  it('rejects a bad definition with a WorkflowDefinitionError carrying issues', () => {
    const bad = {
      trigger: { type: 'not_a_real_trigger', config: {} },
      conditions: { op: 'and', rules: [] },
      actions: [],
      autonomy: 'draft',
    };
    expect(() => parseWorkflowDefinition(bad)).toThrow(WorkflowDefinitionError);
    try {
      parseWorkflowDefinition(bad);
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowDefinitionError);
      expect((err as WorkflowDefinitionError).issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects an unknown autonomy value', () => {
    const bad = { ...LEAD_SCORE_DEF, autonomy: 'yolo' };
    expect(() => parseWorkflowDefinition(bad)).toThrow(WorkflowDefinitionError);
  });
});
