/**
 * Behavioral tests for the explicit Chat/Agent `mode` field on
 * `POST /api/ai/broker-task`.
 *
 * Mirrors the realtor `/api/ai/task` composer switch: the client can now
 * send `mode: 'chat' | 'agent'` in the body. This suite proves:
 *   - mode='chat' always forces the in-process direct snapshot turn, even
 *     for a message the heuristic router would send to Modal.
 *   - mode='agent' always forces the Modal BROKER_TOOLS dispatch when
 *     Modal is configured, even for a message the heuristic router would
 *     answer directly.
 *   - an absent mode leaves `decideBrokerRoute`'s decision untouched.
 *   - mode='agent' with Modal unconfigured degrades to the direct path
 *     WITH an honest status note threaded through — not a silent
 *     downgrade.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (hoisted above the route import) ──────────────────────────────────

const BROKER_CTX = {
  brokerage: { id: 'bk_own', ownerId: 'u_owner', name: 'Own Brokerage' },
  membership: { id: 'mem_1', brokerageId: 'bk_own', userId: 'u_1', role: 'broker_owner' },
  dbUserId: 'u_1',
  brokerRole: 'broker_owner' as const,
};

vi.mock('@/lib/agent/broker-context', () => ({
  resolveBrokerContext: vi.fn(async () => BROKER_CTX),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'clerk_u_1' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/permissions', () => ({
  isPlatformAdmin: vi.fn(async () => false),
}));

vi.mock('@/lib/agent/broker-persistence', () => ({
  saveBrokerUserMessage: vi.fn(async () => ({ messageId: 'm_user_1' })),
  saveBrokerAssistantMessage: vi.fn(async () => ({ messageId: 'm_asst_1' })),
}));

vi.mock('@/lib/usage/today-token-usage', () => ({
  getTodayTokenUsage: vi.fn(async () => ({ total: 0 })),
}));

// Chainable Supabase stub — every table read resolves to "no row" by default,
// which is exactly what resolveConversation/loadHistory/the subscription and
// budget reads want for a clean pass-through. resolveRuntimeSpaceId reads
// 'Space'; seed it per-test when a runtime space needs to exist.
type TableResult = { data?: unknown; error?: unknown };
const tableQueues: Record<string, TableResult[]> = {};

function seed(table: string, ...results: TableResult[]) {
  tableQueues[table] = (tableQueues[table] ?? []).concat(results);
}

/** Like `seed`, but replaces the table's queue instead of appending — use
 *  when a test needs to override the `beforeEach` default for that table. */
function setTable(table: string, ...results: TableResult[]) {
  tableQueues[table] = results;
}

function nextResult(table: string): TableResult {
  const q = tableQueues[table];
  if (q && q.length > 0) return q.shift() as TableResult;
  return { data: null };
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'order', 'limit', 'insert', 'in', 'update', 'eq']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
  chain.single = vi.fn(() => Promise.resolve(nextResult(table)));
  (chain as { then: unknown }).then = (resolve: (v: TableResult) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

// The direct + Modal branches are the two things under test — stub both so
// we can assert exactly which one a given `mode` reaches, and inspect what
// was passed to the direct branch (the `degradedFromAgentMode` flag).
const { directMock } = vi.hoisted(() => ({
  directMock: vi.fn(
    (_input: unknown): Response =>
      new Response(new ReadableStream({ start(c) { c.close(); } }), {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  ),
}));
vi.mock('@/lib/chat/broker-direct', () => ({
  streamBrokerDirectTurn: directMock,
}));

const fetchMock = vi.fn();

// Import AFTER all mocks.
import { POST } from '@/app/api/ai/broker-task/route';

const ORIGINAL_MODAL_URL = process.env.MODAL_CHAT_URL;
const ORIGINAL_SECRET = process.env.AGENT_INTERNAL_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tableQueues)) delete tableQueues[key];
  process.env.MODAL_CHAT_URL = 'https://modal.example/broker-chat';
  process.env.AGENT_INTERNAL_SECRET = 'shh';
  // Runtime Space resolves by default so the 'agent' branch doesn't
  // self-downgrade for an unrelated reason (no runtime space) in tests that
  // want a clean Modal dispatch.
  seed('Space', { data: { id: 'space_owner_1' } });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(
    new Response(new ReadableStream({ start(c) { c.close(); } }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
});

afterEach(() => {
  if (ORIGINAL_MODAL_URL === undefined) delete process.env.MODAL_CHAT_URL;
  else process.env.MODAL_CHAT_URL = ORIGINAL_MODAL_URL;
  if (ORIGINAL_SECRET === undefined) delete process.env.AGENT_INTERNAL_SECRET;
  else process.env.AGENT_INTERNAL_SECRET = ORIGINAL_SECRET;
});

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ai/broker-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'hello',
      ...body,
    }),
  }) as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/ai/broker-task — mode='chat' forces the direct snapshot path", () => {
  it('stays direct even for a message the heuristic router would send to Modal', async () => {
    // "reassign Maria's leads" trips ACTION_VERBS_RE ('reassign') → heuristic
    // route would be 'agent'. mode='chat' must override that.
    const res = await POST(
      makeRequest({ message: "reassign Maria's leads to the floor", mode: 'chat' }),
    );

    expect(res.status).toBe(200);
    expect(directMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const call = directMock.mock.calls[0][0] as { degradedFromAgentMode?: boolean };
    expect(call.degradedFromAgentMode).toBe(false);
  });
});

describe("POST /api/ai/broker-task — mode='agent' forces the Modal dispatch", () => {
  it('dispatches to Modal even for a message the heuristic router would answer directly', async () => {
    // Plain greeting has no action verb and no broker/workspace noun →
    // heuristic route would be 'direct'. mode='agent' must override that.
    const res = await POST(makeRequest({ message: 'hey there', mode: 'agent' }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(directMock).not.toHaveBeenCalled();

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const payload = JSON.parse(init.body);
    expect(payload.mode).toBe('broker');
    expect(payload.brokerage_id).toBe('bk_own');
  });
});

describe('POST /api/ai/broker-task — absent mode keeps the router result unchanged', () => {
  it('routes a plain greeting direct (no action verb, no broker noun)', async () => {
    const res = await POST(makeRequest({ message: 'hey there' }));

    expect(res.status).toBe(200);
    expect(directMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const call = directMock.mock.calls[0][0] as { degradedFromAgentMode?: boolean };
    expect(call.degradedFromAgentMode).toBe(false);
  });

  it('routes a broker-domain query to Modal (BROKER_QUERY_RE match)', async () => {
    const res = await POST(makeRequest({ message: 'who is at risk on the team right now' }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(directMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/broker-task — mode='agent' with Modal unavailable degrades honestly", () => {
  it('falls back to direct and marks the turn as a degraded agent request (no silent downgrade)', async () => {
    delete process.env.MODAL_CHAT_URL;

    const res = await POST(makeRequest({ message: 'hey there', mode: 'agent' }));

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(directMock).toHaveBeenCalledTimes(1);
    const call = directMock.mock.calls[0][0] as { degradedFromAgentMode?: boolean };
    expect(call.degradedFromAgentMode).toBe(true);
  });

  it('also degrades honestly when Modal is configured but there is no runtime Space', async () => {
    setTable('Space', { data: null });

    const res = await POST(makeRequest({ message: 'hey there', mode: 'agent' }));

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(directMock).toHaveBeenCalledTimes(1);
    const call = directMock.mock.calls[0][0] as { degradedFromAgentMode?: boolean };
    expect(call.degradedFromAgentMode).toBe(true);
  });

  it('does NOT mark degraded when the plain heuristic router (no explicit mode) picks direct', async () => {
    delete process.env.MODAL_CHAT_URL;

    const res = await POST(makeRequest({ message: 'hey there' }));

    expect(res.status).toBe(200);
    expect(directMock).toHaveBeenCalledTimes(1);
    const call = directMock.mock.calls[0][0] as { degradedFromAgentMode?: boolean };
    expect(call.degradedFromAgentMode).toBe(false);
  });
});
