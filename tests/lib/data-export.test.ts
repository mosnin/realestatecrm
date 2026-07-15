/**
 * Behavioral tests for lib/data-export.ts — the shared workspace reader used by
 * both the self-service export and the admin DSAR export.
 *
 *   - reads EVERY registered Space-scoped table, each filtered on the given
 *     spaceId (the tenant boundary — a leak here leaks across tenants),
 *   - returns the rows keyed by table name,
 *   - scopes the DealContact junction through the exported deals' ids,
 *   - marks an errored table read as { error: 'unavailable' } instead of failing
 *     the whole export.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { dbState, eqCalls, inCalls } = vi.hoisted(() => ({
  dbState: {
    rows: {} as Record<string, unknown[]>,
    errors: {} as Record<string, { message: string } | null>,
  },
  eqCalls: [] as Array<{ table: string; col: string; val: unknown }>,
  inCalls: [] as Array<{ table: string; col: string; vals: unknown }>,
}));

vi.mock('@/lib/supabase', () => {
  function chain(table: string): any {
    return {
      select: () => chain(table),
      eq: (col: string, val: unknown) => {
        eqCalls.push({ table, col, val });
        return Promise.resolve({
          data: dbState.rows[table] ?? [],
          error: dbState.errors[table] ?? null,
        });
      },
      in: (col: string, vals: unknown) => {
        inCalls.push({ table, col, vals });
        return Promise.resolve({
          data: dbState.rows[table] ?? [],
          error: dbState.errors[table] ?? null,
        });
      },
    };
  }
  return { supabase: { from: (t: string) => chain(t) } };
});

import { exportSpaceData, SPACE_SCOPED_TABLES } from '@/lib/data-export';

const SPACE = 'space_abc123';

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = {};
  dbState.errors = {};
  eqCalls.length = 0;
  inCalls.length = 0;
});

describe('exportSpaceData', () => {
  it('reads every registered table scoped to the given spaceId', async () => {
    await exportSpaceData(SPACE);

    // Every scoped table was read with .eq('spaceId', SPACE).
    for (const table of SPACE_SCOPED_TABLES) {
      const scoped = eqCalls.find((c) => c.table === table);
      expect(scoped, `${table} should be read`).toBeTruthy();
      expect(scoped!.col).toBe('spaceId');
      expect(scoped!.val).toBe(SPACE);
    }
    // Nothing was scoped to any OTHER space id.
    expect(eqCalls.every((c) => c.val === SPACE)).toBe(true);
  });

  it('returns the rows keyed by table name', async () => {
    dbState.rows['Contact'] = [{ id: 'c1', spaceId: SPACE }];
    dbState.rows['Deal'] = [{ id: 'd1', spaceId: SPACE }];

    const out = await exportSpaceData(SPACE);

    expect(out['Contact']).toEqual([{ id: 'c1', spaceId: SPACE }]);
    // Untouched tables come back as empty arrays, not undefined.
    expect(out['Note']).toEqual([]);
    // Result covers all registered tables plus the DealContact junction.
    for (const table of SPACE_SCOPED_TABLES) {
      expect(out).toHaveProperty(table);
    }
    expect(out).toHaveProperty('DealContact');
  });

  it('scopes DealContact through the exported deal ids', async () => {
    dbState.rows['Deal'] = [{ id: 'd1' }, { id: 'd2' }];
    dbState.rows['DealContact'] = [{ dealId: 'd1', contactId: 'c1' }];

    const out = await exportSpaceData(SPACE);

    const dcCall = inCalls.find((c) => c.table === 'DealContact');
    expect(dcCall).toBeTruthy();
    expect(dcCall!.col).toBe('dealId');
    expect(dcCall!.vals).toEqual(['d1', 'd2']);
    expect(out['DealContact']).toEqual([{ dealId: 'd1', contactId: 'c1' }]);
  });

  it('returns an empty DealContact array when there are no deals', async () => {
    const out = await exportSpaceData(SPACE);
    expect(out['DealContact']).toEqual([]);
    expect(inCalls.find((c) => c.table === 'DealContact')).toBeUndefined();
  });

  it('marks an errored table read as unavailable instead of throwing', async () => {
    dbState.errors['Message'] = { message: 'relation does not exist' };
    const out = await exportSpaceData(SPACE);
    expect(out['Message']).toEqual({ error: 'unavailable' });
  });
});
