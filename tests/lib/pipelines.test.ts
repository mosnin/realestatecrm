/**
 * ensureDefaultPipelines — first-run deals board. A new space must get
 * Rental + Buyer pipelines with linked stages, and a second call must
 * not insert again.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const inserts: { table: string; values: unknown }[] = [];
const updates: { table: string; values: unknown }[] = [];
let existingPipelines: unknown[] | null = null;
let matchingStages: { id: string }[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.insert = vi.fn((values: unknown) => {
        inserts.push({ table, values });
        if (table === 'Pipeline') {
          const row = Array.isArray(values) ? values[0] : values;
          chain.single = vi.fn(() => Promise.resolve({ data: row, error: null }));
          return chain;
        }
        return Promise.resolve({ data: values, error: null });
      });
      chain.update = vi.fn((values: unknown) => {
        updates.push({ table, values });
        return chain;
      });
      chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
      (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
        if (table === 'Pipeline') {
          return Promise.resolve({ data: existingPipelines ?? [], error: null }).then(resolve);
        }
        if (table === 'DealStage') {
          return Promise.resolve({ data: matchingStages, error: null }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      };
      return chain;
    }),
  },
}));

import { ensureDefaultPipelines, DEFAULT_PIPELINES } from '@/lib/pipelines';

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  existingPipelines = null;
  matchingStages = [];
});

describe('ensureDefaultPipelines', () => {
  it('returns existing pipelines without inserting', async () => {
    existingPipelines = [{ id: 'p1', spaceId: 's1', name: 'Rental Pipeline' }];
    const result = await ensureDefaultPipelines('s1');
    expect(result).toHaveLength(1);
    expect(inserts).toHaveLength(0);
  });

  it('seeds Rental + Buyer pipelines with linked stages on an empty space', async () => {
    existingPipelines = [];
    const result = await ensureDefaultPipelines('space_new');

    expect(result).toHaveLength(2);
    const pipelineInserts = inserts.filter((i) => i.table === 'Pipeline');
    expect(pipelineInserts).toHaveLength(2);
    expect((pipelineInserts[0].values as { name: string; spaceId: string }).name).toBe('Rental Pipeline');
    expect((pipelineInserts[0].values as { spaceId: string }).spaceId).toBe('space_new');
    expect((pipelineInserts[1].values as { name: string }).name).toBe('Buyer Pipeline');

    const stageInserts = inserts.filter((i) => i.table === 'DealStage');
    expect(stageInserts).toHaveLength(2);
    const rentalStages = stageInserts[0].values as Array<{
      pipelineId: string;
      pipelineType: string;
      spaceId: string;
      name: string;
    }>;
    expect(rentalStages.every((s) => s.spaceId === 'space_new')).toBe(true);
    expect(rentalStages.every((s) => s.pipelineType === 'rental')).toBe(true);
    expect(rentalStages.every((s) => typeof s.pipelineId === 'string' && s.pipelineId.length > 0)).toBe(true);
    expect(rentalStages.map((s) => s.name)).toEqual(DEFAULT_PIPELINES[0].defaultStages.map((s) => s.name));

    const buyerStages = stageInserts[1].values as Array<{ pipelineType: string }>;
    expect(buyerStages.every((s) => s.pipelineType === 'buyer')).toBe(true);
  });

  it('attaches orphan stages of the matching pipelineType instead of seeding', async () => {
    existingPipelines = [];
    matchingStages = [{ id: 'orphan_1' }];
    await ensureDefaultPipelines('space_new');

    expect(inserts.filter((i) => i.table === 'DealStage')).toHaveLength(0);
    expect(updates.filter((u) => u.table === 'DealStage')).toHaveLength(2);
    expect((updates[0].values as { pipelineId: string }).pipelineId).toBeTruthy();
  });
});
