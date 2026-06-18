/**
 * Tests for the offer-drafting tools: `draft_offer`, `draft_counter_offer`,
 * `draft_contingency`.
 *
 * Each tool, per the spec:
 *   (a) creates a pending AgentDraft tied to the right deal (and contact),
 *   (b) refuses a deal outside the caller's space,
 *   (c) validates required inputs.
 *
 * Mock shape mirrors ai-tools-send-email.test.ts: a per-table supabase chain
 * where reads resolve to configured rows and `insert` records its payload so
 * we can assert the draft row's dealId / contactId / channel / status.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Per-table supabase mock with insert capture ────────────────────────────
let mockByTable: Record<
  string,
  { rows?: Array<Record<string, unknown>>; error?: { message: string } | null; single?: Record<string, unknown> | null }
> = {};

// Records every insert() payload by table, in call order.
let insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table];
    const rows = override?.rows ?? [];
    const error = override?.error ?? null;
    const single = override?.single;

    const termThen = Promise.resolve({ data: rows, error });
    const singleThen = Promise.resolve({ data: single ?? rows[0] ?? null, error });

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      order: vi.fn(() => chain),
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        return {
          ...chain,
          then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e),
          catch: (e: (x: unknown) => unknown) => termThen.catch(e),
        };
      }),
      maybeSingle: vi.fn(() => singleThen),
      abortSignal: vi.fn(() => termThen),
      then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e),
    };
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { draftOfferTool } from '@/lib/ai-tools/tools/draft-offer';
import { draftCounterOfferTool } from '@/lib/ai-tools/tools/draft-counter-offer';
import { draftContingencyTool } from '@/lib/ai-tools/tools/draft-contingency';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

/** Find the AgentDraft row that was inserted (there should be exactly one). */
function insertedDraft(): Record<string, unknown> | undefined {
  return insertCalls.find((c) => c.table === 'AgentDraft')?.payload;
}

beforeEach(() => {
  mockByTable = {};
  insertCalls = [];
});

// ── draft_offer ────────────────────────────────────────────────────────────

describe('draftOfferTool', () => {
  it('requires approval before the handler runs', () => {
    expect(draftOfferTool.requiresApproval).toBe(true);
    expect(draftOfferTool.riskLevel).toBe('low');
  });

  it('validates that dealId is required', () => {
    expect(() => draftOfferTool.parameters.parse({})).toThrow();
    expect(() => draftOfferTool.parameters.parse({ dealId: '' })).toThrow();
  });

  it('creates a pending note draft tied to the deal and its primary contact', async () => {
    mockByTable = {
      Deal: { single: { id: 'deal_1', title: 'Smith', value: 500_000, address: '1 Main St' } },
      DealContact: { single: { contactId: 'c_99' } },
      AgentDraft: { rows: [{ id: 'draft_x' }] },
    };
    const result = await draftOfferTool.handler(
      {
        dealId: 'deal_1',
        price: 525_000,
        closingDate: '2026-08-15',
        contingencies: ['inspection', 'financing'],
      },
      makeCtx(),
    );

    expect(result.display).toBe('success');
    const draft = insertedDraft();
    expect(draft).toBeDefined();
    expect(draft).toMatchObject({
      spaceId: 'space_1',
      dealId: 'deal_1',
      contactId: 'c_99',
      channel: 'note',
      status: 'pending',
    });
    // Term summary content reflects the supplied terms.
    expect(String(draft!.content)).toContain('$525,000');
    expect(String(draft!.content)).toContain('inspection');
    expect((result.data as { dealId: string }).dealId).toBe('deal_1');
  });

  it('falls back to the deal value when no price is given, and tolerates no contact', async () => {
    mockByTable = {
      Deal: { single: { id: 'deal_1', title: 'Smith', value: 400_000, address: null } },
      DealContact: { single: null },
      AgentDraft: { rows: [{ id: 'draft_x' }] },
    };
    const result = await draftOfferTool.handler({ dealId: 'deal_1' }, makeCtx());
    expect(result.display).toBe('success');
    const draft = insertedDraft();
    expect(draft!.contactId).toBeNull();
    expect(String(draft!.content)).toContain('$400,000');
  });

  it('refuses a deal outside the caller\'s space (not found)', async () => {
    mockByTable = { Deal: { single: null } };
    const result = await draftOfferTool.handler({ dealId: 'other_space_deal' }, makeCtx());
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No deal with id/);
    expect(insertedDraft()).toBeUndefined();
  });
});

// ── draft_counter_offer ──────────────────────────────────────────────────────

describe('draftCounterOfferTool', () => {
  it('requires approval before the handler runs', () => {
    expect(draftCounterOfferTool.requiresApproval).toBe(true);
    expect(draftCounterOfferTool.riskLevel).toBe('low');
  });

  it('validates dealId and requires at least one substantive field', () => {
    expect(() => draftCounterOfferTool.parameters.parse({})).toThrow();
    // dealId present but nothing to counter with → refine fails.
    expect(() => draftCounterOfferTool.parameters.parse({ dealId: 'deal_1' })).toThrow();
    // dealId + a counterPrice is valid.
    expect(() =>
      draftCounterOfferTool.parameters.parse({ dealId: 'deal_1', counterPrice: 510_000 }),
    ).not.toThrow();
  });

  it('creates a pending note draft tied to the deal with a price delta', async () => {
    mockByTable = {
      Deal: { single: { id: 'deal_2', title: 'Smith', value: 500_000, address: '1 Main St' } },
      DealContact: { single: { contactId: 'c_7' } },
      AgentDraft: { rows: [{ id: 'draft_y' }] },
    };
    const result = await draftCounterOfferTool.handler(
      {
        dealId: 'deal_2',
        currentOfferPrice: 490_000,
        counterPrice: 510_000,
        proposedChanges: ['close 2 weeks earlier'],
      },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    const draft = insertedDraft();
    expect(draft).toMatchObject({
      spaceId: 'space_1',
      dealId: 'deal_2',
      contactId: 'c_7',
      channel: 'note',
      status: 'pending',
    });
    expect(String(draft!.content)).toContain('$510,000');
    // +$20,000 delta between 490k current and 510k counter.
    expect(String(draft!.content)).toContain('$20,000');
    expect(String(draft!.content)).toContain('close 2 weeks earlier');
  });

  it('refuses a deal outside the caller\'s space (not found)', async () => {
    mockByTable = { Deal: { single: null } };
    const result = await draftCounterOfferTool.handler(
      { dealId: 'other_space_deal', counterPrice: 510_000 },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No deal with id/);
    expect(insertedDraft()).toBeUndefined();
  });
});

// ── draft_contingency ────────────────────────────────────────────────────────

describe('draftContingencyTool', () => {
  it('requires approval before the handler runs', () => {
    expect(draftContingencyTool.requiresApproval).toBe(true);
    expect(draftContingencyTool.riskLevel).toBe('low');
  });

  it('validates required inputs (dealId + a known contingencyType)', () => {
    expect(() => draftContingencyTool.parameters.parse({})).toThrow();
    expect(() => draftContingencyTool.parameters.parse({ dealId: 'deal_1' })).toThrow();
    expect(() =>
      draftContingencyTool.parameters.parse({ dealId: 'deal_1', contingencyType: 'banana' }),
    ).toThrow();
    expect(() =>
      draftContingencyTool.parameters.parse({ dealId: 'deal_1', contingencyType: 'inspection' }),
    ).not.toThrow();
  });

  it('creates a pending note draft tied to the deal with the contingency type', async () => {
    mockByTable = {
      Deal: { single: { id: 'deal_3', title: 'Smith', address: '1 Main St' } },
      DealContact: { single: { contactId: 'c_3' } },
      AgentDraft: { rows: [{ id: 'draft_z' }] },
    };
    const result = await draftContingencyTool.handler(
      {
        dealId: 'deal_3',
        contingencyType: 'inspection',
        deadline: '2026-07-10',
        terms: 'General home inspection within 10 days.',
      },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    const draft = insertedDraft();
    expect(draft).toMatchObject({
      spaceId: 'space_1',
      dealId: 'deal_3',
      contactId: 'c_3',
      channel: 'note',
      status: 'pending',
    });
    expect(String(draft!.subject)).toContain('Inspection');
    expect(String(draft!.content)).toContain('2026-07-10');
    expect((result.data as { contingencyType: string }).contingencyType).toBe('inspection');
  });

  it('refuses a deal outside the caller\'s space (not found)', async () => {
    mockByTable = { Deal: { single: null } };
    const result = await draftContingencyTool.handler(
      { dealId: 'other_space_deal', contingencyType: 'financing' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No deal with id/);
    expect(insertedDraft()).toBeUndefined();
  });
});
