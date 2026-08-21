/**
 * Behavioral tests for ensureDefaultPipelines — seller board is a real
 * default, not a missing type. Existing boards are not rewritten.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Terminal = { data?: unknown; error?: unknown };
type Call = { table: string; chain: Array<[string, unknown[]]> };

let queues: Record<string, Terminal[]> = {};
let calls: Call[] = [];

function queue(table: string, terminal: Terminal) {
  (queues[table] ??= []).push(terminal);
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chainCalls: Array<[string, unknown[]]> = [];
    calls.push({ table, chain: chainCalls });
    const next = (): Promise<Terminal> => {
      const q = queues[table];
      return Promise.resolve(q?.shift() ?? { data: null, error: null });
    };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) {
      chain[m] = vi.fn((...args: unknown[]) => {
        chainCalls.push([m, args]);
        return chain;
      });
    }
    chain.insert = vi.fn((values: unknown) => {
      chainCalls.push(['insert', [values]]);
      return chain;
    });
    chain.update = vi.fn((values: unknown) => {
      chainCalls.push(['update', [values]]);
      return chain;
    });
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { CONTRACT_SPINE, DEFAULT_PIPELINE_DEFS, ensureDefaultPipelines } from '@/lib/deals/default-pipelines';

beforeEach(() => {
  queues = {};
  calls = [];
});

describe('ensureDefaultPipelines', () => {
  it('picks e-sign as the only external contract spine', () => {
    expect(CONTRACT_SPINE).toBe('esign');
    expect(DEFAULT_PIPELINE_DEFS.map((d) => d.pipelineType)).toEqual(['rental', 'buyer', 'seller']);
    expect(DEFAULT_PIPELINE_DEFS.find((d) => d.pipelineType === 'seller')?.defaultStages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'New Seller', kind: 'lead' }),
        expect.objectContaining({ name: 'Under Contract', kind: 'under_contract' }),
      ]),
    );
  });

  it('seeds seller (and the other defaults) when the space has no boards', async () => {
    queue('Pipeline', { data: [], error: null });
    queue('DealStage', { data: [], error: null });
    for (let i = 0; i < 3; i++) {
      queue('Pipeline', { data: null, error: null });
      queue('DealStage', { data: null, error: null });
    }

    const result = await ensureDefaultPipelines('space_1');
    expect(result.created.sort()).toEqual(['buyer', 'rental', 'seller']);

    const pipelineInserts = calls.filter((c) => c.table === 'Pipeline' && c.chain.some(([m]) => m === 'insert'));
    expect(pipelineInserts).toHaveLength(3);
    for (const c of pipelineInserts) {
      expect(c.chain).toContainEqual(['insert', [expect.objectContaining({ spaceId: 'space_1' })]]);
    }
    const stageInserts = calls.filter((c) => c.table === 'DealStage' && c.chain.some(([m]) => m === 'insert'));
    expect(stageInserts).toHaveLength(3);
    const sellerStages = stageInserts
      .map((c) => c.chain.find(([m]) => m === 'insert')?.[1][0] as Array<{ pipelineType: string; kind: string }>)
      .find((rows) => Array.isArray(rows) && rows[0]?.pipelineType === 'seller');
    expect(sellerStages?.some((s) => s.kind === 'under_contract')).toBe(true);
  });

  it('adds only the seller board when rental and buyer already exist', async () => {
    queue('Pipeline', {
      data: [
        { id: 'p_r', name: 'Rental Pipeline', position: 0 },
        { id: 'p_b', name: 'Buyer Pipeline', position: 1 },
      ],
      error: null,
    });
    queue('DealStage', {
      data: [
        { id: 'st_r', pipelineType: 'rental', pipelineId: 'p_r' },
        { id: 'st_b', pipelineType: 'buyer', pipelineId: 'p_b' },
      ],
      error: null,
    });
    queue('Pipeline', { data: null, error: null });
    queue('DealStage', { data: null, error: null });

    const result = await ensureDefaultPipelines('space_1');
    expect(result.created).toEqual(['seller']);
    const pipelineInserts = calls.filter((c) => c.table === 'Pipeline' && c.chain.some(([m]) => m === 'insert'));
    expect(pipelineInserts).toHaveLength(1);
    expect(pipelineInserts[0]?.chain).toContainEqual([
      'insert',
      [expect.objectContaining({ spaceId: 'space_1', name: 'Seller Pipeline', position: 2 })],
    ]);
  });

  it('is a no-op when seller already exists', async () => {
    queue('Pipeline', {
      data: [
        { id: 'p_r', name: 'Rental Pipeline', position: 0 },
        { id: 'p_b', name: 'Buyer Pipeline', position: 1 },
        { id: 'p_s', name: 'Seller Pipeline', position: 2 },
      ],
      error: null,
    });
    queue('DealStage', {
      data: [
        { id: 'st_r', pipelineType: 'rental', pipelineId: 'p_r' },
        { id: 'st_b', pipelineType: 'buyer', pipelineId: 'p_b' },
        { id: 'st_s', pipelineType: 'seller', pipelineId: 'p_s' },
      ],
      error: null,
    });

    const result = await ensureDefaultPipelines('space_1');
    expect(result.created).toEqual([]);
    expect(calls.some((c) => c.chain.some(([m]) => m === 'insert'))).toBe(false);
  });

  it('scopes every read and write by spaceId', async () => {
    queue('Pipeline', { data: [], error: null });
    queue('DealStage', { data: [], error: null });
    for (let i = 0; i < 3; i++) {
      queue('Pipeline', { data: null, error: null });
      queue('DealStage', { data: null, error: null });
    }

    await ensureDefaultPipelines('space_1');

    for (const c of calls) {
      const eqs = c.chain.filter(([m]) => m === 'eq');
      const insert = c.chain.find(([m]) => m === 'insert')?.[1][0];
      if (insert && !Array.isArray(insert)) {
        expect((insert as { spaceId?: string }).spaceId).toBe('space_1');
      } else if (Array.isArray(insert)) {
        for (const row of insert as Array<{ spaceId?: string }>) {
          expect(row.spaceId).toBe('space_1');
        }
      } else {
        expect(eqs.some(([, args]) => args[0] === 'spaceId' && args[1] === 'space_1')).toBe(true);
      }
    }
  });
});
