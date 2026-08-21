/**
 * Behavioral tests for advanceDealFromEvent — pipeline moves from real
 * events. Drag/override is "already ahead": we never pull a deal backward.
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
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is']) {
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
    chain.maybeSingle = vi.fn(() => {
      chainCalls.push(['maybeSingle', []]);
      return next();
    });
    chain.single = vi.fn(() => {
      chainCalls.push(['single', []]);
      return next();
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

const { ensureMock } = vi.hoisted(() => ({
  ensureMock: vi.fn(async () => ({ created: [] as string[] })),
}));
vi.mock('@/lib/deals/default-pipelines', () => ({
  ensureDefaultPipelines: ensureMock,
  CONTRACT_SPINE: 'realtor',
}));

import { advanceDealFromEvent } from '@/lib/deals/advance-from-event';

const STAGES = [
  { id: 'st_lead', name: 'New Lead', kind: 'lead', position: 0, pipelineId: 'p_buyer', pipelineType: 'buyer' },
  { id: 'st_show', name: 'Showings', kind: 'active', position: 2, pipelineId: 'p_buyer', pipelineType: 'buyer' },
  { id: 'st_uc', name: 'Under Contract', kind: 'under_contract', position: 4, pipelineId: 'p_buyer', pipelineType: 'buyer' },
];

function queueStages(rows = STAGES) {
  queue('DealStage', { data: rows, error: null });
}

beforeEach(() => {
  queues = {};
  calls = [];
  ensureMock.mockClear();
  ensureMock.mockResolvedValue({ created: [] });
});

describe('advanceDealFromEvent', () => {
  it('opens a deal in the lead stage when first-touch sends and none exists', async () => {
    queueStages();
    queue('DealContact', { data: [], error: null });
    queue('Deal', { data: { position: 0 }, error: null }); // max position
    queue('Deal', { data: null, error: null }); // insert
    queue('DealContact', { data: null, error: null }); // link
    queue('DealActivity', { data: null, error: null });

    const result = await advanceDealFromEvent({
      spaceId: 'space_1',
      event: 'first_touch_sent',
      contactId: 'c_1',
      title: 'Jane Doe',
    });

    expect(result).toMatchObject({ ok: true, created: true, moved: false });
    const dealInsert = calls.find((c) => c.table === 'Deal' && c.chain.some(([m]) => m === 'insert'));
    expect(dealInsert?.chain).toContainEqual([
      'insert',
      [
        expect.objectContaining({
          spaceId: 'space_1',
          title: 'Jane Doe',
          stageId: 'st_lead',
          status: 'active',
        }),
      ],
    ]);
  });

  it('moves an existing lead-stage deal to Showings when a tour books', async () => {
    queueStages();
    queue('Deal', {
      data: { id: 'deal_1', stageId: 'st_lead', title: 'Jane', status: 'active', sourceTourId: null },
      error: null,
    });
    queue('Deal', { data: null, error: null }); // update
    queue('DealActivity', { data: null, error: null });

    const result = await advanceDealFromEvent({
      spaceId: 'space_1',
      event: 'tour_booked',
      dealId: 'deal_1',
      sourceTourId: 'tour_1',
    });

    expect(result).toEqual({ ok: true, dealId: 'deal_1', created: false, moved: true });
    const update = calls.find((c) => c.table === 'Deal' && c.chain.some(([m]) => m === 'update'));
    expect(update?.chain).toContainEqual([
      'update',
      [expect.objectContaining({ stageId: 'st_show', sourceTourId: 'tour_1' })],
    ]);
    expect(update?.chain).toContainEqual(['eq', ['id', 'deal_1']]);
    expect(update?.chain).toContainEqual(['eq', ['spaceId', 'space_1']]);
  });

  it('does not pull a deal backward when the realtor already dragged ahead', async () => {
    queueStages();
    queue('Deal', {
      data: { id: 'deal_1', stageId: 'st_uc', title: 'Jane', status: 'active', sourceTourId: null },
      error: null,
    });

    const result = await advanceDealFromEvent({
      spaceId: 'space_1',
      event: 'tour_booked',
      dealId: 'deal_1',
    });

    expect(result).toEqual({
      ok: true,
      dealId: 'deal_1',
      created: false,
      moved: false,
      reason: 'already_ahead',
    });
    expect(calls.some((c) => c.table === 'Deal' && c.chain.some(([m]) => m === 'update'))).toBe(false);
  });

  it('moves to Under Contract when an offer is accepted', async () => {
    queueStages();
    queue('Deal', {
      data: { id: 'deal_1', stageId: 'st_show', title: 'Jane', status: 'active', sourceTourId: null },
      error: null,
    });
    queue('Deal', { data: null, error: null });
    queue('DealActivity', { data: null, error: null });

    const result = await advanceDealFromEvent({
      spaceId: 'space_1',
      event: 'offer_accepted',
      dealId: 'deal_1',
    });

    expect(result).toEqual({ ok: true, dealId: 'deal_1', created: false, moved: true });
    const update = calls.find((c) => c.table === 'Deal' && c.chain.some(([m]) => m === 'update'));
    expect(update?.chain).toContainEqual([
      'update',
      [expect.objectContaining({ stageId: 'st_uc', contractAcceptedAt: expect.any(String) })],
    ]);
  });

  it('opens a seller first-touch on the seller board, not the buyer board', async () => {
    const sellerStages = [
      { id: 'st_s_lead', name: 'New Seller', kind: 'lead', position: 0, pipelineId: 'p_seller', pipelineType: 'seller' },
      { id: 'st_s_uc', name: 'Under Contract', kind: 'under_contract', position: 3, pipelineId: 'p_seller', pipelineType: 'seller' },
    ];
    queue('Contact', { data: { leadType: 'seller' }, error: null });
    queueStages(sellerStages);
    queue('DealContact', { data: [], error: null });
    queue('Deal', { data: { position: 0 }, error: null });
    queue('Deal', { data: null, error: null });
    queue('DealContact', { data: null, error: null });
    queue('DealActivity', { data: null, error: null });

    const result = await advanceDealFromEvent({
      spaceId: 'space_1',
      event: 'first_touch_sent',
      contactId: 'c_seller',
      title: 'Jordan Seller',
    });

    expect(result).toMatchObject({ ok: true, created: true });
    const dealInsert = calls.find((c) => c.table === 'Deal' && c.chain.some(([m]) => m === 'insert'));
    expect(dealInsert?.chain).toContainEqual([
      'insert',
      [expect.objectContaining({ stageId: 'st_s_lead', title: 'Jordan Seller' })],
    ]);
  });

  it('stamps contractAcceptedAt when the deal is already under contract', async () => {
    queueStages();
    queue('Deal', {
      data: { id: 'deal_1', stageId: 'st_uc', title: 'Jane', status: 'active', sourceTourId: null, contractAcceptedAt: null },
      error: null,
    });
    queue('Deal', { data: null, error: null });

    const result = await advanceDealFromEvent({
      spaceId: 'space_1',
      event: 'offer_accepted',
      dealId: 'deal_1',
    });

    expect(result).toMatchObject({ ok: true, dealId: 'deal_1', moved: false, reason: 'same_stage' });
    const stamp = calls.find((c) => c.table === 'Deal' && c.chain.some(([m]) => m === 'update'));
    expect(stamp?.chain).toContainEqual([
      'update',
      [expect.objectContaining({ contractAcceptedAt: expect.any(String) })],
    ]);
    expect(stamp?.chain).toContainEqual(['eq', ['spaceId', 'space_1']]);
  });

  it('does not invent a deal for an orphan accepted offer', async () => {
    queueStages();
    const result = await advanceDealFromEvent({
      spaceId: 'space_1',
      event: 'offer_accepted',
      title: 'Dana',
    });
    expect(result).toEqual({ ok: false, reason: 'no_deal' });
    expect(calls.some((c) => c.chain.some(([m]) => m === 'insert'))).toBe(false);
  });

  it('no-ops honestly when the space has no stages', async () => {
    queue('Contact', { data: { leadType: 'buyer' }, error: null });
    queueStages([]);
    queueStages([]);
    const result = await advanceDealFromEvent({
      spaceId: 'space_1',
      event: 'first_touch_sent',
      contactId: 'c_1',
      title: 'Jane',
    });
    expect(ensureMock).toHaveBeenCalledWith('space_1');
    expect(result).toEqual({ ok: false, reason: 'no_stage' });
  });

  it('scopes every Deal and DealStage read by spaceId', async () => {
    queueStages();
    queue('DealContact', { data: [], error: null });
    queue('Deal', { data: { position: 0 }, error: null });
    queue('Deal', { data: null, error: null });
    queue('DealContact', { data: null, error: null });
    queue('DealActivity', { data: null, error: null });

    await advanceDealFromEvent({
      spaceId: 'space_1',
      event: 'first_touch_sent',
      contactId: 'c_1',
      title: 'Jane',
    });

    for (const c of calls.filter((x) => x.table === 'Deal' || x.table === 'DealStage' || x.table === 'DealActivity')) {
      const eqs = c.chain.filter(([m]) => m === 'eq');
      const hasSpace = eqs.some(([, args]) => args[0] === 'spaceId' && args[1] === 'space_1');
      const isInsert = c.chain.some(([m]) => m === 'insert');
      if (isInsert) {
        const insert = c.chain.find(([m]) => m === 'insert')?.[1][0] as { spaceId?: string };
        expect(insert.spaceId).toBe('space_1');
      } else {
        expect(hasSpace).toBe(true);
      }
    }
  });
});
