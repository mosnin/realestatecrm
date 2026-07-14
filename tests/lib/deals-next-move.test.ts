/**
 * Behavioral tests for lib/deals/next-move.ts — computeNextMove.
 *
 * Mocks the supabase client with a queue of per-query terminals (one entry
 * per `from()` call, in the exact order the function issues them), mocks
 * getLLMClient so we control the model output, and mocks recordChatUsage so
 * billing attribution is assertable.
 *
 * Query order for an active deal with a stage and a linked contact:
 *   1. Deal (maybeSingle)      4. DealActivity
 *   2. DealStage (maybeSingle) 5. Contact
 *   3. DealContact             6. ContactActivity
 *   7. Deal update (the persist)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { createMock, recordChatUsageMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  recordChatUsageMock: vi.fn(() => Promise.resolve()),
}));

// ── Supabase mock: queue-driven chainable ───────────────────────────────────
type Terminal = { data?: unknown; error?: unknown };
let supabaseQueue: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    const terminal = supabaseQueue.shift() ?? { data: [], error: null };
    supabaseCalls.push({ table, chain: calls });

    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'update']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(() => {
      calls.push(['maybeSingle', []]);
      return Promise.resolve(terminal);
    });
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/usage/record-chat-usage', () => ({
  recordChatUsage: recordChatUsageMock,
}));

vi.mock('@/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('@/lib/llm')>('@/lib/llm');
  return {
    ...actual,
    getLLMClient: () => ({ chat: { completions: { create: createMock } } }),
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { computeNextMove, NEXT_MOVE_MAX_CHARS } from '@/lib/deals/next-move';

// ── Fixtures ────────────────────────────────────────────────────────────────
const SPACE = 'space-1';
const DEAL_ID = 'deal-1';
const NOW = new Date('2026-07-14T12:00:00.000Z');

function dealRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DEAL_ID,
    title: '412 Elm St purchase',
    address: '412 Elm St',
    status: 'active',
    stageId: 'stage-1',
    closeDate: null,
    followUpAt: null,
    nextAction: null,
    nextActionDueAt: null,
    stageChangedAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

/** Queue terminals for the full active-deal pipeline. */
function queueActiveDeal(opts: {
  deal?: Record<string, unknown>;
  contact?: { id: string; name: string; lastContactedAt: string | null } | null;
  updateError?: unknown;
} = {}) {
  const contact =
    opts.contact === undefined
      ? { id: 'contact-1', name: 'Dana Whitfield', lastContactedAt: '2026-07-08T12:00:00.000Z' }
      : opts.contact;
  supabaseQueue = [
    { data: dealRow(opts.deal ?? {}), error: null }, // Deal
    { data: { name: 'Under contract' }, error: null }, // DealStage
    { data: contact ? [{ contactId: contact.id }] : [], error: null }, // DealContact
    { data: [{ type: 'note', content: 'Sent showing recap', createdAt: '2026-07-08T12:00:00.000Z' }], error: null }, // DealActivity
  ];
  if (contact) {
    supabaseQueue.push({ data: [contact], error: null }); // Contact
    supabaseQueue.push({ data: [], error: null }); // ContactActivity
  }
  supabaseQueue.push({ data: null, error: opts.updateError ?? null }); // Deal update
}

function llmReply(content: string | null, usage?: Record<string, unknown>) {
  return {
    choices: content === null ? [] : [{ message: { content } }],
    usage: usage ?? { prompt_tokens: 180, completion_tokens: 24 },
  };
}

function findDealUpdate() {
  return supabaseCalls.find(
    (c) => c.table === 'Deal' && c.chain.some(([m]) => m === 'update'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;
  vi.stubEnv('OPENROUTER_API_KEY', 'or-test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('computeNextMove — happy path', () => {
  it('persists the validated model move and records usage with the exact provider cost', async () => {
    queueActiveDeal();
    createMock.mockResolvedValue(
      llmReply(
        JSON.stringify({
          move: 'Buyer quiet 6 days — check in about the Elm St showing',
          kind: 'follow_up',
        }),
        { prompt_tokens: 180, completion_tokens: 24, cost: 0.00042 },
      ),
    );

    const result = await computeNextMove(SPACE, DEAL_ID, { now: NOW });

    expect(result).toEqual({
      text: 'Buyer quiet 6 days — check in about the Elm St showing',
      kind: 'follow_up',
      computedAt: NOW.toISOString(),
    });

    // The LLM call opted into OpenRouter usage accounting and asked for JSON.
    const call = createMock.mock.calls[0][0];
    expect(call.usage).toEqual({ include: true });
    expect(call.response_format).toEqual({ type: 'json_object' });
    expect(call.model).toBe('openai/gpt-4.1-mini');

    // Grounding: the user payload carries the deal facts, not free prose.
    const userPayload = JSON.parse(call.messages.at(-1).content);
    expect(userPayload.title).toBe('412 Elm St purchase');
    expect(userPayload.contactName).toBe('Dana Whitfield');

    // Persisted write, tenant-scoped.
    const update = findDealUpdate();
    expect(update).toBeDefined();
    const values = update!.chain.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    expect(values.nextMoveText).toBe('Buyer quiet 6 days — check in about the Elm St showing');
    expect(values.nextMoveKind).toBe('follow_up');
    expect(values.nextMoveComputedAt).toBe(NOW.toISOString());
    expect(update!.chain).toContainEqual(['eq', ['spaceId', SPACE]]);
    expect(update!.chain).toContainEqual(['eq', ['id', DEAL_ID]]);

    // Billing attribution reached ChatUsage.
    expect(recordChatUsageMock).toHaveBeenCalledTimes(1);
    expect(recordChatUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: SPACE,
        model: 'openai/gpt-4.1-mini',
        promptTokens: 180,
        completionTokens: 24,
        costUsd: 0.00042,
        route: 'agent',
        runtime: 'ts',
      }),
    );
  });

  it('downgrades an unknown kind to "other" but keeps the move text', async () => {
    queueActiveDeal();
    createMock.mockResolvedValue(
      llmReply(JSON.stringify({ move: 'Nudge the lender for the appraisal', kind: 'banana' })),
    );

    const result = await computeNextMove(SPACE, DEAL_ID, { now: NOW });
    expect(result?.text).toBe('Nudge the lender for the appraisal');
    expect(result?.kind).toBe('other');
  });

  it('caps an over-long model move at the 140-char budget', async () => {
    queueActiveDeal();
    createMock.mockResolvedValue(
      llmReply(JSON.stringify({ move: 'call the buyer '.repeat(30), kind: 'follow_up' })),
    );

    const result = await computeNextMove(SPACE, DEAL_ID, { now: NOW });
    expect(result).not.toBeNull();
    expect(result!.text.length).toBeLessThanOrEqual(NEXT_MOVE_MAX_CHARS);

    const values = findDealUpdate()!.chain.find(([m]) => m === 'update')![1][0] as {
      nextMoveText: string;
    };
    expect(values.nextMoveText.length).toBeLessThanOrEqual(NEXT_MOVE_MAX_CHARS);
  });
});

describe('computeNextMove — fallbacks', () => {
  it('malformed model JSON → deterministic check-in on the contact first name', async () => {
    queueActiveDeal();
    createMock.mockResolvedValue(llmReply('sorry, here is your move: call Dana'));

    const result = await computeNextMove(SPACE, DEAL_ID, { now: NOW });
    expect(result).toEqual({
      text: 'Check in with Dana',
      kind: 'follow_up',
      computedAt: NOW.toISOString(),
    });
    const values = findDealUpdate()!.chain.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    expect(values.nextMoveText).toBe('Check in with Dana');
    expect(values.nextMoveKind).toBe('follow_up');
  });

  it('empty model response + close date inside a week → "Confirm closing prep"', async () => {
    queueActiveDeal({ deal: { closeDate: '2026-07-17T00:00:00.000Z' } }); // 3 days out
    createMock.mockResolvedValue(llmReply(null));

    const result = await computeNextMove(SPACE, DEAL_ID, { now: NOW });
    expect(result).toEqual({
      text: 'Confirm closing prep',
      kind: 'deadline',
      computedAt: NOW.toISOString(),
    });
  });

  it('LLM throwing never blocks the write — the fallback move is persisted', async () => {
    queueActiveDeal();
    createMock.mockRejectedValue(new Error('provider down'));

    const result = await computeNextMove(SPACE, DEAL_ID, { now: NOW });
    expect(result?.text).toBe('Check in with Dana');
    expect(findDealUpdate()).toBeDefined();
  });
});

describe('computeNextMove — scoping and lifecycle', () => {
  it('a deal outside the caller space resolves null — no LLM call, no write', async () => {
    supabaseQueue = [{ data: null, error: null }];

    const result = await computeNextMove(SPACE, 'someone-elses-deal', { now: NOW });
    expect(result).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
    expect(recordChatUsageMock).not.toHaveBeenCalled();
    expect(findDealUpdate()).toBeUndefined();

    // The deal load itself was tenant-scoped.
    const dealLoad = supabaseCalls[0];
    expect(dealLoad.table).toBe('Deal');
    expect(dealLoad.chain).toContainEqual(['eq', ['spaceId', SPACE]]);
  });

  it('a no-longer-active deal clears the chip columns and returns null', async () => {
    supabaseQueue = [
      { data: dealRow({ status: 'won' }), error: null },
      { data: null, error: null }, // the clearing update
    ];

    const result = await computeNextMove(SPACE, DEAL_ID, { now: NOW });
    expect(result).toBeNull();
    expect(createMock).not.toHaveBeenCalled();

    const update = findDealUpdate();
    const values = update!.chain.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    expect(values.nextMoveText).toBeNull();
    expect(values.nextMoveKind).toBeNull();
    expect(update!.chain).toContainEqual(['eq', ['spaceId', SPACE]]);
  });

  it('a failed persist returns null so callers never claim unwritten state', async () => {
    queueActiveDeal({ updateError: { message: 'db down' } });
    createMock.mockResolvedValue(
      llmReply(JSON.stringify({ move: 'Check in with Dana', kind: 'follow_up' })),
    );

    const result = await computeNextMove(SPACE, DEAL_ID, { now: NOW });
    expect(result).toBeNull();
  });
});
