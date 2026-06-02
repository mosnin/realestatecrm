/**
 * Route-level integration test for `POST /api/ai/task` — the runtime
 * branch.
 *
 * The bar (post-flip — in-app TS runtime is the DEFAULT):
 *   - When CHIPPI_CHAT_RUNTIME is unset/empty/anything-other-than-modal,
 *     the route MUST run the in-process TS streamer (no Modal hop).
 *   - When CHIPPI_CHAT_RUNTIME=modal, the route MUST use the dual-path
 *     router (direct fast path vs Modal agent) — the reversible fallback.
 *   - Auth + space resolution + user-message persistence happen on
 *     BOTH paths, so we don't write them twice.
 *
 * What we DON'T test here: the actual SSE event content. That lives in
 * the sdk-event-mapper test (events) and the sdk-chat-stream module
 * (orchestration). Here we just verify the route picks the right branch.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mocks (must be declared before importing the route) ─────────────────

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user_clerk_123' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

// Persistence is mocked so we don't hit Supabase. The route awaits
// saveUserMessage + saveAssistantMessage; both resolve.
vi.mock('@/lib/ai-tools/persistence', () => ({
  saveUserMessage: vi.fn(async () => ({ messageId: 'msg_user_1' })),
  saveAssistantMessage: vi.fn(async () => ({ messageId: 'msg_asst_1' })),
}));

// Telemetry — fire-and-forget; just no-op everything.
vi.mock('@/lib/telemetry', () => ({
  emit: vi.fn(async () => {}),
  hasEmitted: vi.fn(async () => true), // skip the first-message emission
  getFirstEmittedAt: vi.fn(async () => null),
  secondsBetween: vi.fn(() => 0),
  maybeEmitFirstAction: vi.fn(async () => {}),
}));

// Supabase: minimal chainable mock for resolveConversation + loadHistory +
// hydrateAttachments. The route also reads the User row inside
// resolveToolContext → we mock that via the context module instead.
vi.mock('@/lib/supabase', () => {
  // Default `data: []` so the route's loadHistory + hydrateAttachments
  // path treats every read as "no rows" without throwing on .filter().
  function chain(terminal: { data?: unknown; error?: unknown } = { data: [] }) {
    const obj: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'insert', 'update']) {
      obj[m] = vi.fn(() => obj);
    }
    obj.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { id: 's_1', slug: 'jane', name: 'Jane', ownerId: 'u_1' } }),
    );
    obj.single = vi.fn(() => Promise.resolve(terminal));
    (obj as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve);
    return obj;
  }
  return { supabase: { from: vi.fn(() => chain()) } };
});

// resolveToolContext is the heart of auth+space — mock it whole.
vi.mock('@/lib/ai-tools/context', () => ({
  resolveToolContext: vi.fn(async () => ({
    userId: 'user_clerk_123',
    space: { id: 's_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_1' },
    signal: new AbortController().signal,
  })),
}));

// Stub the TS streamer — we just verify it's called when the flag is on.
// vi.mock factories are hoisted to the top of the module, so any variables
// the factory references must also be hoisted via vi.hoisted.
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

// Phase 4 dual-path router — stub the direct stream so we can assert which
// branch the router picked without mocking OpenRouter.
vi.mock('@/lib/chat/direct-stream', () => ({
  streamDirectTurn: directStreamMock,
}));

// Stub global fetch so the modal path doesn't try to talk to anything.
const fetchMock = vi.fn();

// Import AFTER the mocks.
import { POST } from '@/app/api/ai/task/route';
import { saveUserMessage } from '@/lib/ai-tools/persistence';

const mockedSaveUser = vi.mocked(saveUserMessage);

const ORIGINAL_RUNTIME = process.env.CHIPPI_CHAT_RUNTIME;
const ORIGINAL_MODAL_URL = process.env.MODAL_CHAT_URL;
const ORIGINAL_SECRET = process.env.AGENT_INTERNAL_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  // Restore the saveUserMessage mock implementation after clearAllMocks.
  mockedSaveUser.mockResolvedValue({ messageId: 'msg_user_1' });
  // Default to unset — every test sets explicitly.
  delete process.env.CHIPPI_CHAT_RUNTIME;
  process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
  process.env.AGENT_INTERNAL_SECRET = 'shh';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(
    new Response(new ReadableStream({ start(c) { c.close(); } }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
});

afterEach(() => {
  if (ORIGINAL_RUNTIME === undefined) delete process.env.CHIPPI_CHAT_RUNTIME;
  else process.env.CHIPPI_CHAT_RUNTIME = ORIGINAL_RUNTIME;
  if (ORIGINAL_MODAL_URL === undefined) delete process.env.MODAL_CHAT_URL;
  else process.env.MODAL_CHAT_URL = ORIGINAL_MODAL_URL;
  if (ORIGINAL_SECRET === undefined) delete process.env.AGENT_INTERNAL_SECRET;
  else process.env.AGENT_INTERNAL_SECRET = ORIGINAL_SECRET;
});

// Default to a verb that the Phase 4 router classifies as 'agent' so the
// historical "every turn proxies to Modal" tests still exercise the Modal
// branch. Tests that want the direct branch pass an action-verb-free
// message override.
function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ai/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spaceSlug: 'jane',
      message: 'send Preston a follow-up',
      ...body,
    }),
  }) as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/ai/task — input validation', () => {
  it('400 on missing spaceSlug', async () => {
    const res = await POST(makeRequest({ spaceSlug: '' }));
    expect(res.status).toBe(400);
  });

  it('400 on empty message', async () => {
    const res = await POST(makeRequest({ message: '   ' }));
    expect(res.status).toBe(400);
  });

  it('400 on message too long (>8000 chars)', async () => {
    const res = await POST(makeRequest({ message: 'a'.repeat(8001) }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/task — runtime branch (CHIPPI_CHAT_RUNTIME=modal opt-in)', () => {
  it('routes action verbs to the Modal agent when CHIPPI_CHAT_RUNTIME=modal', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    // Default makeRequest message is an action verb → Modal agent branch.
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // Modal path → fetch is hit, the in-process TS streamer is NOT.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tsStreamMock).not.toHaveBeenCalled();
  });

  it('returns 503 when CHIPPI_CHAT_RUNTIME=modal but MODAL_CHAT_URL is not configured', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    delete process.env.MODAL_CHAT_URL;
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect(tsStreamMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/task — runtime branch (default = in-app TS)', () => {
  it('routes to streamTsChatTurn by default (CHIPPI_CHAT_RUNTIME unset)', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes to the TS streamer for any value other than the exact string "modal"', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'MODAL'; // wrong case → still TS
    await POST(makeRequest());
    expect(tsStreamMock).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still saves the user message before branching (shared persistence)', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    await POST(makeRequest({ message: 'find Jane' }));
    expect(mockedSaveUser).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'find Jane' }),
    );
  });

  it('passes ctx + conversationId + userMessage to the streamer', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    await POST(makeRequest({ message: 'hi' }));
    const call = tsStreamMock.mock.calls[0]?.[0] as unknown as {
      ctx: { space: { slug: string } };
      userMessage: string;
      conversationId: string;
    };
    expect(call.userMessage).toBe('hi');
    expect(call.ctx.space.slug).toBe('jane');
    expect(typeof call.conversationId).toBe('string');
  });
});

// ── Phase 4 dual-path router branch (only active under =modal) ────────────
describe('POST /api/ai/task — Phase 4 router (CHIPPI_CHAT_RUNTIME=modal)', () => {
  it('routes generic Q&A messages to the direct path (no Modal hop)', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    await POST(makeRequest({ message: "what's a CMA?" }));
    expect(directStreamMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes action verbs to the Modal agent path', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    await POST(makeRequest({ message: 'add Preston as a contact' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(directStreamMock).not.toHaveBeenCalled();
  });

  it('routes attachments without action verbs to the direct path', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    await POST(
      makeRequest({
        message: 'summarize this listing',
        attachmentIds: ['att1'],
      }),
    );
    // attachment hydration is mocked → empty array, but the router still
    // sees the message text. "summarize" is a read, no action verb.
    expect(directStreamMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the resolved chat model into the direct streamer', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    await POST(makeRequest({ message: 'what is a CMA?' }));
    const call = directStreamMock.mock.calls[0]?.[0] as unknown as {
      model: string;
      userMessage: string;
    };
    expect(typeof call.model).toBe('string');
    expect(call.model.length).toBeGreaterThan(0);
    expect(call.userMessage).toBe('what is a CMA?');
  });
});
