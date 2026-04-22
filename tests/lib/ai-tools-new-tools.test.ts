import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared supabase chain mock ─────────────────────────────────────────────
// The tools build a chained query (`.from().select().eq().order()...`). We
// return a thenable-ish chain that resolves to whatever `mockRows` /
// `mockError` are currently set to. Each test can also override with
// `mockByTable` when a tool hits more than one table in one call.

let mockRows: Array<Record<string, unknown>> = [];
let mockError: { message: string } | null = null;
let mockByTable: Record<string, { rows?: Array<Record<string, unknown>>; error?: { message: string } | null; single?: Record<string, unknown> | null }> | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable?.[table];
    const rows = override?.rows ?? mockRows;
    const error = override?.error ?? mockError;
    const single = override?.single;

    const terminalThenable = Promise.resolve({ data: rows, error });
    const singleThenable = Promise.resolve({ data: single ?? rows[0] ?? null, error });

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      not: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      or: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      maybeSingle: vi.fn(() => singleThenable),
      abortSignal: vi.fn(() => terminalThenable),
      then: (
        resolve: (v: { data: unknown; error: unknown }) => unknown,
        reject?: (e: unknown) => unknown,
      ) => terminalThenable.then(resolve, reject),
    };
    return chain;
  }
  return {
    supabase: { from: vi.fn((table: string) => makeChain(table)) },
  };
});

import { searchDealsTool } from '@/lib/ai-tools/tools/search-deals';
import { getContactTool } from '@/lib/ai-tools/tools/get-contact';
import { pipelineSummaryTool } from '@/lib/ai-tools/tools/pipeline-summary';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  mockRows = [];
  mockError = null;
  mockByTable = null;
});

// ── search_deals ───────────────────────────────────────────────────────────

describe('searchDealsTool', () => {
  it('returns an empty-state summary when no rows match', async () => {
    const result = await searchDealsTool.handler({ limit: 10 }, makeCtx());
    expect(result.summary).toMatch(/no deals/i);
    expect(result.display).toBe('deals');
  });

  it('formats a summary with title, value, close date, next action', async () => {
    mockRows = [
      {
        id: '1',
        title: '123 Main St',
        address: '123 Main St',
        value: 450_000,
        status: 'active',
        priority: 'HIGH',
        stageId: 's1',
        closeDate: '2026-05-10T00:00:00Z',
        nextAction: 'Confirm inspection',
        nextActionDueAt: null,
        updatedAt: '2026-04-20T00:00:00Z',
      },
    ];
    const result = await searchDealsTool.handler({ limit: 10 }, makeCtx());
    expect(result.summary).toContain('Found 1 deal');
    expect(result.summary).toContain('123 Main St');
    expect(result.summary).toContain('$450,000');
    expect(result.summary).toContain('Confirm inspection');
    expect((result.data as { deals: unknown[] }).deals).toHaveLength(1);
  });

  it('returns an informative message when stageName has no match', async () => {
    // The stage-name lookup hits the DealStage table; return a single=null
    // so the tool treats it as "no such stage".
    mockByTable = { DealStage: { single: null } };
    const result = await searchDealsTool.handler(
      { stageName: 'Nonexistent', limit: 10 },
      makeCtx(),
    );
    expect(result.summary).toMatch(/No stage named/);
    expect(result.display).toBe('plain');
  });

  it('is auto-run', () => {
    expect(searchDealsTool.requiresApproval).toBe(false);
  });
});

// ── get_contact ────────────────────────────────────────────────────────────

describe('getContactTool', () => {
  it('returns not-found for an unknown id', async () => {
    mockByTable = { Contact: { single: null } };
    const result = await getContactTool.handler({ contactId: 'bogus' }, makeCtx());
    expect(result.summary).toMatch(/No contact with id/);
    expect((result.data as { contact: unknown }).contact).toBeNull();
    expect(result.display).toBe('plain');
  });

  it('composes a single-line summary with score, follow-up, deals, tours', async () => {
    mockByTable = {
      Contact: {
        single: {
          id: 'c1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: null,
          leadType: 'buyer',
          scoreLabel: 'hot',
          leadScore: 87,
          scoreSummary: null,
          followUpAt: new Date(Date.now() - 86_400_000).toISOString(),
          lastContactedAt: null,
          sourceLabel: null,
          referralSource: null,
          budget: null,
          preferences: null,
          notes: null,
          tags: [],
          snoozedUntil: null,
        },
      },
      DealContact: {
        rows: [{ Deal: { id: 'd1', title: '123 Main St', status: 'active', value: 400_000 } }],
      },
      Tour: {
        rows: [
          {
            id: 't1',
            startsAt: '2026-04-15T00:00:00Z',
            status: 'completed',
            propertyAddress: '123 Main',
          },
        ],
      },
    };
    const result = await getContactTool.handler({ contactId: 'c1' }, makeCtx());
    expect(result.summary).toContain('Jane Doe');
    expect(result.summary).toContain('hot 87');
    expect(result.summary).toContain('follow-up overdue');
    expect(result.summary).toContain('1 linked deal');
    expect(result.summary).toContain('1 recent tour');
  });
});

// ── pipeline_summary ───────────────────────────────────────────────────────

describe('pipelineSummaryTool', () => {
  it('summarises an empty pipeline tersely', async () => {
    mockRows = [];
    const result = await pipelineSummaryTool.handler({ includeLostWon: false }, makeCtx());
    expect(result.summary).toMatch(/0 active deals/);
  });

  it('surfaces closing-this-week + totals', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    mockRows = [
      {
        id: 'd1',
        title: 'Close soon',
        status: 'active',
        value: 500_000,
        closeDate: soon.toISOString(),
        followUpAt: null,
        updatedAt: new Date().toISOString(),
        nextAction: null,
        nextActionDueAt: null,
      },
      {
        id: 'd2',
        title: 'Not this week',
        status: 'active',
        value: 200_000,
        closeDate: null,
        followUpAt: null,
        updatedAt: new Date().toISOString(),
        nextAction: null,
        nextActionDueAt: null,
      },
    ];
    const result = await pipelineSummaryTool.handler({ includeLostWon: false }, makeCtx());
    expect(result.summary).toMatch(/2 active deals/);
    expect(result.summary).toMatch(/1 closing this week/);
    const { summary } = result.data as { summary: { closingThisWeek: { count: number; totalValue: number } } };
    expect(summary.closingThisWeek.count).toBe(1);
    expect(summary.closingThisWeek.totalValue).toBe(500_000);
  });

  it('is auto-run', () => {
    expect(pipelineSummaryTool.requiresApproval).toBe(false);
  });
});
