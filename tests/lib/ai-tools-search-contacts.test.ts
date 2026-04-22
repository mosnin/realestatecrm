import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the supabase module before importing the tool ────────────────────
// The tool builds a chained query (`.from().select().eq().order().limit()...`)
// and awaits it. We return a thenable chain whose terminal `abortSignal()`
// resolves to `{ data, error }`. Calls flow through unchanged otherwise.
//
// Kept local to this file so we can swap `mockRows` between tests.

let mockRows: Array<Record<string, unknown>> = [];
let mockError: { message: string } | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      not: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      or: vi.fn(() => chain),
      abortSignal: vi.fn(() => Promise.resolve({ data: mockRows, error: mockError })),
    };
    return chain;
  }
  return {
    supabase: { from: vi.fn(() => makeChain()) },
  };
});

// Import AFTER mocking so the mock wins.
import { searchContactsTool } from '@/lib/ai-tools/tools/search-contacts';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 'user_123',
    space: { id: 'space_abc', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
    ...overrides,
  };
}

beforeEach(() => {
  mockRows = [];
  mockError = null;
});

describe('searchContactsTool schema', () => {
  it('accepts an all-optional call (at least one filter is soft — the model decides)', () => {
    expect(() => searchContactsTool.parameters.parse({})).not.toThrow();
  });

  it('clamps limit into [1, 25]', () => {
    expect(() => searchContactsTool.parameters.parse({ limit: 0 })).toThrow();
    expect(() => searchContactsTool.parameters.parse({ limit: 100 })).toThrow();
    expect(searchContactsTool.parameters.parse({ limit: 10 }).limit).toBe(10);
  });

  it('rejects unknown scoreLabel values', () => {
    expect(() => searchContactsTool.parameters.parse({ scoreLabel: 'lukewarm' })).toThrow();
  });

  it('rejects over-long queries', () => {
    const tooLong = 'x'.repeat(200);
    expect(() => searchContactsTool.parameters.parse({ query: tooLong })).toThrow();
  });
});

describe('searchContactsTool handler', () => {
  it('returns an empty-state summary when no rows match', async () => {
    mockRows = [];
    const result = await searchContactsTool.handler({ limit: 10 }, makeCtx());
    expect(result.summary).toMatch(/no contacts/i);
    expect(result.display).toBe('contacts');
    expect((result.data as { contacts: unknown[] }).contacts).toHaveLength(0);
  });

  it('formats a summary with name, score, and follow-up flags', async () => {
    mockRows = [
      {
        id: '1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: null,
        leadType: 'buyer',
        scoreLabel: 'hot',
        leadScore: 87,
        followUpAt: new Date(Date.now() - 86_400_000).toISOString(), // 1 day ago
      },
      {
        id: '2',
        name: 'Bob Smith',
        email: null,
        phone: '555-1212',
        leadType: 'rental',
        scoreLabel: null,
        leadScore: null,
        followUpAt: null,
      },
    ];
    const result = await searchContactsTool.handler({ limit: 10 }, makeCtx());
    expect(result.summary).toContain('Found 2 contacts');
    expect(result.summary).toContain('Jane Doe');
    expect(result.summary).toContain('hot 87');
    expect(result.summary).toContain('follow-up overdue');
    expect(result.summary).toContain('Bob Smith');
    expect((result.data as { contacts: unknown[] }).contacts).toHaveLength(2);
  });

  it('truncates the summary at 10 rows but keeps the full data array', async () => {
    mockRows = Array.from({ length: 15 }, (_, i) => ({
      id: String(i),
      name: `Contact ${i}`,
      email: null,
      phone: null,
      leadType: 'rental',
      scoreLabel: null,
      leadScore: null,
      followUpAt: null,
    }));
    const result = await searchContactsTool.handler({ limit: 25 }, makeCtx());
    expect(result.summary).toContain('…and 5 more');
    expect((result.data as { contacts: unknown[] }).contacts).toHaveLength(15);
  });

  it('propagates a supabase error via the summary + display=error', async () => {
    mockError = { message: 'connection reset' };
    const result = await searchContactsTool.handler({ limit: 10 }, makeCtx());
    expect(result.summary).toMatch(/Search failed.*connection reset/);
    expect(result.display).toBe('error');
  });

  it('is marked as auto-run (no approval prompt)', () => {
    expect(searchContactsTool.requiresApproval).toBe(false);
  });
});
