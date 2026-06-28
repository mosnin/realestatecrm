/**
 * Unified activity QUERY tests.
 *
 * We mock '@/lib/supabase' with a chainable, thenable query builder that records
 * every source query: the table, the `.eq` filters (so we can prove the spaceId
 * guard), the `.lt`/`.lte`/`.gte` range bounds, and the `.order` sort column.
 * Rows are served per-table from `rowsByTable`, and a `throwTables` set lets one
 * source throw so we can prove the merge survives it.
 *
 * The headline test is TENANT ISOLATION: EVERY source query must carry
 * `.eq('spaceId', spaceId)`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const SPACE = 'space-123';

const { calls, rowsByTable, throwTables } = vi.hoisted(() => ({
  calls: [] as Array<{
    table: string;
    filters: Record<string, unknown>;
    lt: Record<string, unknown>;
    lte: Record<string, unknown>;
    gte: Record<string, unknown>;
    notFilters: Array<{ col: string; op: string; val: unknown }>;
    orderCol: string | null;
  }>,
  rowsByTable: { value: {} as Record<string, unknown[]> },
  throwTables: { value: new Set<string>() },
}));

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    if (throwTables.value.has(table)) {
      throw new Error(`boom: ${table}`);
    }
    const record = {
      table,
      filters: {} as Record<string, unknown>,
      lt: {} as Record<string, unknown>,
      lte: {} as Record<string, unknown>,
      gte: {} as Record<string, unknown>,
      notFilters: [] as Array<{ col: string; op: string; val: unknown }>,
      orderCol: null as string | null,
    };

    const resolve = () => {
      calls.push({ ...record });
      return Promise.resolve({ data: rowsByTable.value[table] ?? [], error: null });
    };

    const chain: Record<string, unknown> = {
      select() {
        return chain;
      },
      eq(col: string, val: unknown) {
        record.filters[col] = val;
        return chain;
      },
      lt(col: string, val: unknown) {
        record.lt[col] = val;
        return chain;
      },
      lte(col: string, val: unknown) {
        record.lte[col] = val;
        return chain;
      },
      gte(col: string, val: unknown) {
        record.gte[col] = val;
        return chain;
      },
      not(col: string, op: string, val: unknown) {
        record.notFilters.push({ col, op, val });
        return chain;
      },
      order(col: string) {
        record.orderCol = col;
        return chain;
      },
      limit() {
        // terminal in this codepath, but keep it chainable + thenable
        return chain;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return resolve().then(onFulfilled, onRejected);
      },
    };
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
    },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getUnifiedActivity, DEFAULT_LIMIT, MAX_LIMIT } from '@/lib/activity/query';

const ALL_TABLES = [
  'AgentActivityLog',
  'AgentRunLedger',
  'AgentDraft',
  'WorkflowRun',
  'ScheduledMessage',
  'IntegrationEvent',
  'Routine',
  'ContactActivity',
];

beforeEach(() => {
  calls.length = 0;
  rowsByTable.value = {};
  throwTables.value = new Set();
});

describe('getUnifiedActivity — tenant isolation', () => {
  it('EVERY source query carries .eq(spaceId)', async () => {
    await getUnifiedActivity({ spaceId: SPACE });

    // one call per source
    expect(calls.length).toBe(ALL_TABLES.length);
    const tablesQueried = calls.map((c) => c.table).sort();
    expect(tablesQueried).toEqual([...ALL_TABLES].sort());

    // the critical assertion: no source escapes the spaceId guard
    for (const call of calls) {
      expect(call.filters.spaceId).toBe(SPACE);
    }
  });

  it('orders each source by its own DESC sort column', async () => {
    await getUnifiedActivity({ spaceId: SPACE });
    const byTable = Object.fromEntries(calls.map((c) => [c.table, c.orderCol]));
    expect(byTable.AgentActivityLog).toBe('createdAt');
    expect(byTable.AgentRunLedger).toBe('dispatchedAt');
    expect(byTable.AgentDraft).toBe('createdAt');
    expect(byTable.WorkflowRun).toBe('startedAt');
    expect(byTable.ScheduledMessage).toBe('createdAt');
    expect(byTable.IntegrationEvent).toBe('occurredAt');
    expect(byTable.Routine).toBe('lastRunAt');
    expect(byTable.ContactActivity).toBe('createdAt');
  });
});

describe('getUnifiedActivity — merge + sort', () => {
  it('orders merged items by occurredAt DESC across sources', async () => {
    rowsByTable.value = {
      AgentActivityLog: [
        { id: 'a-old', actionType: 'x', outcome: 'completed', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
      AgentDraft: [
        { id: 'd-new', channel: 'sms', status: 'sent', createdAt: '2026-06-01T00:00:00.000Z' },
      ],
      IntegrationEvent: [
        { id: 'e-mid', eventType: 'X', title: 'mid', status: 'captured', occurredAt: '2026-03-01T00:00:00.000Z' },
      ],
    };
    const { items } = await getUnifiedActivity({ spaceId: SPACE });
    expect(items.map((i) => i.id)).toEqual([
      'draft:d-new',
      'integration_event:e-mid',
      'agent_action:a-old',
    ]);
  });
});

describe('getUnifiedActivity — limit slicing + nextCursor', () => {
  it('slices to limit and returns the tail occurredAt as nextCursor when full', async () => {
    rowsByTable.value = {
      AgentActivityLog: [
        { id: 'a1', actionType: 'x', outcome: 'completed', createdAt: '2026-06-03T00:00:00.000Z' },
        { id: 'a2', actionType: 'x', outcome: 'completed', createdAt: '2026-06-02T00:00:00.000Z' },
        { id: 'a3', actionType: 'x', outcome: 'completed', createdAt: '2026-06-01T00:00:00.000Z' },
      ],
    };
    const { items, nextCursor } = await getUnifiedActivity({ spaceId: SPACE, limit: 2 });
    expect(items.map((i) => i.id)).toEqual(['agent_action:a1', 'agent_action:a2']);
    expect(nextCursor).toBe('2026-06-02T00:00:00.000Z');
  });

  it('returns nextCursor null when the page is not full', async () => {
    rowsByTable.value = {
      AgentActivityLog: [
        { id: 'a1', actionType: 'x', outcome: 'completed', createdAt: '2026-06-03T00:00:00.000Z' },
      ],
    };
    const { items, nextCursor } = await getUnifiedActivity({ spaceId: SPACE, limit: 50 });
    expect(items).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });

  it('caps limit at MAX_LIMIT and defaults to DEFAULT_LIMIT', async () => {
    expect(DEFAULT_LIMIT).toBe(50);
    expect(MAX_LIMIT).toBe(100);
    const { items } = await getUnifiedActivity({ spaceId: SPACE, limit: 9999 });
    expect(items.length).toBeLessThanOrEqual(MAX_LIMIT);
  });
});

describe('getUnifiedActivity — cursor applies .lt per source', () => {
  it('applies .lt on each source sort column when before is given', async () => {
    const before = '2026-06-01T00:00:00.000Z';
    await getUnifiedActivity({ spaceId: SPACE, before });
    const byTable = Object.fromEntries(calls.map((c) => [c.table, c.lt]));
    expect(byTable.AgentActivityLog.createdAt).toBe(before);
    expect(byTable.AgentRunLedger.dispatchedAt).toBe(before);
    expect(byTable.WorkflowRun.startedAt).toBe(before);
    expect(byTable.IntegrationEvent.occurredAt).toBe(before);
    expect(byTable.Routine.lastRunAt).toBe(before);
  });

  it('applies .gte/.lte for since/until on each source sort column', async () => {
    const since = '2026-01-01T00:00:00.000Z';
    const until = '2026-12-31T00:00:00.000Z';
    await getUnifiedActivity({ spaceId: SPACE, since, until });
    const ial = calls.find((c) => c.table === 'IntegrationEvent')!;
    expect(ial.gte.occurredAt).toBe(since);
    expect(ial.lte.occurredAt).toBe(until);
  });
});

describe('getUnifiedActivity — defensive + filters', () => {
  it('a source throwing does not break the merge (returns the rest)', async () => {
    throwTables.value = new Set(['Routine']);
    rowsByTable.value = {
      AgentDraft: [{ id: 'd1', channel: 'sms', status: 'sent', createdAt: '2026-06-01T00:00:00.000Z' }],
    };
    const { items } = await getUnifiedActivity({ spaceId: SPACE });
    expect(items.map((i) => i.id)).toContain('draft:d1');
  });

  it('kinds filter skips unrequested sources entirely', async () => {
    await getUnifiedActivity({ spaceId: SPACE, kinds: ['draft'] });
    expect(calls.map((c) => c.table)).toEqual(['AgentDraft']);
  });

  it('statuses filter is applied post-merge', async () => {
    rowsByTable.value = {
      AgentActivityLog: [
        { id: 'a-ok', actionType: 'x', outcome: 'completed', createdAt: '2026-06-02T00:00:00.000Z' },
        { id: 'a-fail', actionType: 'x', outcome: 'failed', createdAt: '2026-06-01T00:00:00.000Z' },
      ],
    };
    const { items } = await getUnifiedActivity({ spaceId: SPACE, statuses: ['failed'] });
    expect(items.map((i) => i.id)).toEqual(['agent_action:a-fail']);
  });

  it('search is a case-insensitive substring over title+summary', async () => {
    rowsByTable.value = {
      AgentDraft: [
        { id: 'd1', channel: 'email', status: 'sent', subject: 'About the Listing', createdAt: '2026-06-02T00:00:00.000Z' },
        { id: 'd2', channel: 'sms', status: 'sent', subject: 'Other', createdAt: '2026-06-01T00:00:00.000Z' },
      ],
    };
    const { items } = await getUnifiedActivity({ spaceId: SPACE, search: 'listing' });
    expect(items.map((i) => i.id)).toEqual(['draft:d1']);
  });

  it('Routine query filters out null lastRunAt (runs only)', async () => {
    await getUnifiedActivity({ spaceId: SPACE });
    const routine = calls.find((c) => c.table === 'Routine')!;
    expect(routine.notFilters).toContainEqual({ col: 'lastRunAt', op: 'is', val: null });
  });
});
