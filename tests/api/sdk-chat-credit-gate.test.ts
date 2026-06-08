/**
 * Credit-gate enforcement for `POST /api/ai/task`.
 *
 * The route calls `assertCanSpend(spaceId, 'chat_turn')` up front and maps a
 * thrown `CreditsExhaustedError` to a 402 (app/api/ai/task/route.ts ~line 620).
 * The main sdk-chat.test.ts never mocks the meter, so that enforcement branch
 * was untested — a regression that swallowed the error or returned the wrong
 * status would have shipped green. This pins both sides:
 *   - meter throws CreditsExhaustedError → route returns 402, never streams;
 *   - meter resolves (credits available) → route proceeds and returns 200.
 *
 * Mirrors the mock surface of tests/api/sdk-chat.test.ts (auth, rate-limit,
 * persistence, telemetry, supabase, context, streamers) so only the meter is
 * the variable under test.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user_clerk_123' })),
  isSubscriptionDelinquent: vi.fn(() => false),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/ai-tools/persistence', () => ({
  saveUserMessage: vi.fn(async () => ({ messageId: 'msg_user_1' })),
  saveAssistantMessage: vi.fn(async () => ({ messageId: 'msg_asst_1' })),
}));

vi.mock('@/lib/telemetry', () => ({
  emit: vi.fn(async () => {}),
  hasEmitted: vi.fn(async () => true),
  getFirstEmittedAt: vi.fn(async () => null),
  secondsBetween: vi.fn(() => 0),
  maybeEmitFirstAction: vi.fn(async () => {}),
}));

// The token-budget gate (getTodayTokenUsage) must report headroom so it doesn't
// 429 before the credit gate runs.
vi.mock('@/lib/usage/today-token-usage', () => ({
  getTodayTokenUsage: vi.fn(async () => ({ total: 0 })),
}));

// Supabase: chainable mock. Defaults to a Space-shaped row (active sub) for the
// delinquency + AgentSettings + conversation lookups.
vi.mock('@/lib/supabase', () => {
  function chain(terminal: { data?: unknown; error?: unknown } = { data: [] }) {
    const obj: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'insert', 'update']) {
      obj[m] = vi.fn(() => obj);
    }
    obj.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { id: 's_1', stripeSubscriptionStatus: 'active', dailyTokenBudget: 50000 } }),
    );
    obj.single = vi.fn(() => Promise.resolve(terminal));
    (obj as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve);
    return obj;
  }
  return { supabase: { from: vi.fn(() => chain()) } };
});

vi.mock('@/lib/ai-tools/context', () => ({
  resolveToolContext: vi.fn(async () => ({
    userId: 'user_clerk_123',
    space: { id: 's_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_1' },
    signal: new AbortController().signal,
  })),
}));

const { tsStreamMock, directStreamMock } = vi.hoisted(() => ({
  tsStreamMock: vi.fn(
    (_input: unknown): Response =>
      new Response(new ReadableStream({ start(c) { c.close(); } }), {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  ),
  directStreamMock: vi.fn(
    (_input: unknown): Response =>
      new Response(new ReadableStream({ start(c) { c.close(); } }), {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  ),
}));
vi.mock('@/lib/ai-tools/sdk-chat-stream', () => ({
  streamTsChatTurn: tsStreamMock,
  streamTsResumeTurn: vi.fn(),
}));
vi.mock('@/lib/chat/direct-stream', () => ({ streamDirectTurn: directStreamMock }));

// ── The variable under test: the credit meter ─────────────────────────────
// Real CreditsExhaustedError class (the route does `err instanceof`), with an
// assertCanSpend the test drives per-case.
const { assertCanSpendMock } = vi.hoisted(() => ({ assertCanSpendMock: vi.fn() }));
vi.mock('@/lib/billing/meter', () => {
  class CreditsExhaustedError extends Error {
    readonly workflow: string;
    readonly balance: number;
    constructor(workflow: string, balance: number) {
      super(`Insufficient credits for ${workflow} (balance ${balance})`);
      this.name = 'CreditsExhaustedError';
      this.workflow = workflow;
      this.balance = balance;
    }
  }
  return { assertCanSpend: assertCanSpendMock, CreditsExhaustedError };
});

// Import AFTER mocks.
import { POST } from '@/app/api/ai/task/route';
import { CreditsExhaustedError } from '@/lib/billing/meter';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CHIPPI_CHAT_RUNTIME;
  assertCanSpendMock.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.CHIPPI_CHAT_RUNTIME;
});

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ai/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spaceSlug: 'jane', message: "what's a CMA?", ...body }),
  }) as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/ai/task — credit gate (402 enforcement)', () => {
  it('returns 402 and does NOT stream when assertCanSpend throws CreditsExhaustedError', async () => {
    assertCanSpendMock.mockRejectedValue(new CreditsExhaustedError('chat_turn', 0));
    const res = await POST(makeRequest());
    expect(res.status).toBe(402);
    // No turn was started on either path.
    expect(tsStreamMock).not.toHaveBeenCalled();
    expect(directStreamMock).not.toHaveBeenCalled();
  });

  it('proceeds (200) when assertCanSpend resolves — credits available', async () => {
    assertCanSpendMock.mockResolvedValue(undefined);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // A generic question routes to the direct path; the point is the gate passed.
    expect(directStreamMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows a non-credit error (not masked as 402)', async () => {
    assertCanSpendMock.mockRejectedValue(new Error('db down'));
    await expect(POST(makeRequest())).rejects.toThrow('db down');
  });
});
