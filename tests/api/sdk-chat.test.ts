/**
 * Route-level integration test for `POST /api/ai/task` — the runtime
 * branch.
 *
 * The bar (the in-process TS runtime is the DEFAULT; Modal is opt-in):
 *   - The dual-path router runs in BOTH runtimes: generic Q&A → direct
 *     fast path; action verbs → the agent path.
 *   - The agent path runs IN-PROCESS (no Modal hop) by default, i.e. when
 *     CHIPPI_CHAT_RUNTIME is unset/empty/anything-other-than-modal.
 *   - Only CHIPPI_CHAT_RUNTIME=modal proxies the agent turn to Modal.
 *   - Auth + space resolution + user-message persistence happen on
 *     every path, so we don't write them twice.
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
  saveConversationTurnAssistantMessage: vi.fn(async (input: {
    turnId: string;
    attemptToken: string;
    outcome: { status: 'paused' | 'completed' | 'failed' | 'cancelled'; reason: string };
  }) => ({
    turnId: input.turnId,
    attemptToken: input.attemptToken,
    messageId: 'msg_asst_1',
    requestedStatus: input.outcome.status,
    terminalStatus: input.outcome.status,
    terminalReason: input.outcome.reason,
    createdAt: new Date().toISOString(),
  })),
}));

// Durable turn authority is exercised by its own SQL/route contract suite.
// These router tests isolate the chat branch selection, so keep the turn
// lifecycle deterministic without teaching the generic Supabase chain every
// ConversationTurn RPC shape.
vi.mock('@/lib/chat/turn-control', () => {
  const row = (input: {
    turnId: string;
    spaceId: string;
    conversationId: string;
    message: string;
    clientRequestId: string;
    attachmentIds?: string[];
  }) => ({
    id: input.turnId,
    spaceId: input.spaceId,
    conversationId: input.conversationId,
    mode: 'chat',
    source: 'typed',
    clientRequestId: input.clientRequestId,
    message: input.message,
    attachmentIds: input.attachmentIds ?? [],
    attachments: [],
    priority: 0,
    enqueueSeq: 1,
    status: 'running',
    attemptToken: 'attempt-test-1',
    attempts: 1,
    leaseExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    cancelRequestedAt: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    terminalReason: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return {
    enqueueConversationTurn: vi.fn(async (_client: unknown, input: Parameters<typeof row>[0]) => row(input)),
    claimConversationTurnV2: vi.fn(async (_client: unknown, input: Parameters<typeof row>[0]) => row(input)),
    finishConversationTurnV2: vi.fn(async (_client: unknown, input: {
      turnId: string;
      spaceId: string;
      conversationId: string;
      outcome: { status: string; reason: string; error?: string };
    }) => ({
      ...row({
        turnId: input.turnId,
        spaceId: input.spaceId,
        conversationId: input.conversationId,
        message: 'settled',
        clientRequestId: `settled:${input.turnId}`,
      }),
      status: input.outcome.status,
      terminalReason: input.outcome.reason,
      lastError: input.outcome.error ?? null,
      finishedAt: new Date().toISOString(),
    })),
    startConversationTurnLeaseGuardian: vi.fn(() => ({
      assertActive: vi.fn(),
      renewNow: vi.fn().mockResolvedValue(undefined),
      prepareToCommit: vi.fn().mockResolvedValue(undefined),
      commitSucceeded: vi.fn(),
      hasLostAuthority: vi.fn(() => false),
      stop: vi.fn(),
    })),
  };
});

// Telemetry — fire-and-forget; just no-op everything.
vi.mock('@/lib/telemetry', () => ({
  emit: vi.fn(async () => {}),
  hasEmitted: vi.fn(async () => true), // skip the first-message emission
  getFirstEmittedAt: vi.fn(async () => null),
  secondsBetween: vi.fn(() => 0),
  maybeEmitFirstAction: vi.fn(async () => {}),
}));

// Per-test override for the Conversation row resolveConversation looks up.
// Default undefined → the mock returns a non-matching (Space-shaped) row, so a
// fresh conversation is minted. Set it to inject a specific row — e.g. a
// reserved broker/team title — to exercise the #303 write-path isolation guard.
const { convLookup } = vi.hoisted(() => ({
  convLookup: { row: undefined as undefined | { id: string; spaceId: string; title: string; mode?: 'chat' | 'work' | null } },
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
      Promise.resolve({
        data: convLookup.row ?? { id: 's_1', slug: 'jane', name: 'Jane', ownerId: 'u_1' },
      }),
    );
    obj.single = vi.fn(() => Promise.resolve(terminal));
    (obj as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve);
    return obj;
  }
  return {
    supabase: {
      from: vi.fn(() => chain()),
      rpc: vi.fn(async (_name: string, args: { p_mode: 'chat' | 'work' }) => ({
        data: convLookup.row?.mode ?? args.p_mode,
        error: null,
      })),
    },
  };
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
import {
  saveConversationTurnAssistantMessage,
  saveUserMessage,
} from '@/lib/ai-tools/persistence';
import { finishConversationTurnV2 } from '@/lib/chat/turn-control';

const mockedSaveUser = vi.mocked(saveUserMessage);
const mockedSaveAssistant = vi.mocked(saveConversationTurnAssistantMessage);
const mockedFinishTurn = vi.mocked(finishConversationTurnV2);

const ORIGINAL_RUNTIME = process.env.CHIPPI_CHAT_RUNTIME;
const ORIGINAL_MODAL_URL = process.env.MODAL_CHAT_URL;
const ORIGINAL_SECRET = process.env.AGENT_INTERNAL_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  // Restore the saveUserMessage mock implementation after clearAllMocks.
  mockedSaveUser.mockResolvedValue({ messageId: 'msg_user_1' });
  mockedSaveAssistant.mockImplementation(async (input) => ({
    turnId: input.turnId,
    attemptToken: input.attemptToken,
    messageId: 'msg_asst_1',
    requestedStatus: input.outcome.status,
    terminalStatus: input.outcome.status,
    terminalReason: input.outcome.reason,
    createdAt: new Date().toISOString(),
  }));
  convLookup.row = undefined;
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

describe('POST /api/ai/task — reserved-title conversationId is not reused (isolation guard, #303)', () => {
  // A broker_owner also owns their personal realtor space, and the pre-#295
  // broker/team conversations still live in the shared Conversation table with
  // a reserved title prefix. resolveConversation must reject a reserved-title
  // conversationId (same spaceId but [BROKER_CHIPPI]/[BROKERAGE_CHAT] title) so
  // realtor turns never append to — or read history from — a broker conversation.
  it('mints a fresh conversation instead of reusing a [BROKER_CHIPPI] one', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    convLookup.row = { id: 'broker_conv_1', spaceId: 's_1', title: '[BROKER_CHIPPI] private notes' };
    const res = await POST(
      makeRequest({ message: 'add Preston as a contact', conversationId: 'broker_conv_1' }),
    );
    expect(res.status).toBe(200);
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    const call = tsStreamMock.mock.calls[0][0] as { conversationId: string };
    expect(call.conversationId).not.toBe('broker_conv_1');
  });

  it('mints a fresh conversation instead of reusing a [BROKERAGE_CHAT] one', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    convLookup.row = { id: 'team_conv_1', spaceId: 's_1', title: '[BROKERAGE_CHAT] standup' };
    await POST(makeRequest({ message: 'add Preston as a contact', conversationId: 'team_conv_1' }));
    const call = tsStreamMock.mock.calls[0][0] as { conversationId: string };
    expect(call.conversationId).not.toBe('team_conv_1');
  });

  it('reuses a plain realtor conversation in the same space (guard is not over-broad)', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    convLookup.row = { id: 'realtor_conv_1', spaceId: 's_1', title: 'Follow up with the Garcias' };
    await POST(makeRequest({ message: 'add Preston as a contact', conversationId: 'realtor_conv_1' }));
    const call = tsStreamMock.mock.calls[0][0] as { conversationId: string };
    expect(call.conversationId).toBe('realtor_conv_1');
  });

  it('keeps an established Work conversation in Work when a stale client sends mode:chat', async () => {
    convLookup.row = {
      id: 'work_conv_1',
      spaceId: 's_1',
      title: 'Long-form goal',
      mode: 'work',
    };
    await POST(makeRequest({ message: "what's a CMA?", conversationId: 'work_conv_1', mode: 'chat' }));
    const call = tsStreamMock.mock.calls[0][0] as { ctx: { workMode?: boolean } };
    expect(call.ctx.workMode).toBe(true);
    expect(directStreamMock).not.toHaveBeenCalled();
  });

  it('keeps an established Chat conversation in Chat when a stale client sends mode:work', async () => {
    convLookup.row = {
      id: 'chat_conv_1',
      spaceId: 's_1',
      title: 'Quick question',
      mode: 'chat',
    };
    await POST(makeRequest({ message: 'what is a cap rate?', conversationId: 'chat_conv_1', mode: 'work' }));
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(directStreamMock).not.toHaveBeenCalled();
  });
});

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

describe('POST /api/ai/task — agent branch (in-process TS is the default)', () => {
  it('routes action verbs to the in-process TS runtime by default (no Modal hop)', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    // Default makeRequest message is an action verb → agent route, in-process.
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // In-process TS streamer is hit; Modal fetch is NOT.
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats any value other than the exact string "modal" as the TS runtime', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'MODAL'; // wrong case → TS default
    await POST(makeRequest());
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies action verbs to the Modal agent only when CHIPPI_CHAT_RUNTIME=modal', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tsStreamMock).not.toHaveBeenCalled();
  });

  it('fails the durable turn instead of emitting complete when Modal output cannot be persisted', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    mockedSaveAssistant.mockRejectedValueOnce(new Error('database unavailable'));
    fetchMock.mockResolvedValueOnce(new Response(
      'data: {"type":"done","final_text":"The specialist report is ready."}\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));

    const response = await POST(makeRequest());
    const frames = (await response.text())
      .split('\n\n')
      .map((chunk) => chunk.replace(/^data: /, '').trim())
      .filter(Boolean)
      .map((raw) => JSON.parse(raw) as Record<string, unknown>);

    expect(frames.some((frame) => frame.type === 'turn_complete')).toBe(false);
    expect(frames.at(-1)).toMatchObject({ type: 'error', code: 'persistence' });
    expect(mockedFinishTurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outcome: expect.objectContaining({ status: 'failed', reason: 'persistence' }),
      }),
    );
  });

  it('accepts only the first Modal terminal frame across duplicate and trailing chunks', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    const encoder = new TextEncoder();
    fetchMock.mockResolvedValueOnce(new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(
            'data: {"type":"done","final_text":"The report is ready."}\n\n'
            + 'data: {"type":"done","final_text":"duplicate"}\n\n',
          ));
          controller.enqueue(encoder.encode(
            'data: {"type":"error","message":"late contradictory frame"}\n\n',
          ));
          controller.close();
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));

    const response = await POST(makeRequest());
    const frames = (await response.text())
      .split('\n\n')
      .map((chunk) => chunk.replace(/^data: /, '').trim())
      .filter(Boolean)
      .map((raw) => JSON.parse(raw) as Record<string, unknown>);

    expect(frames.filter((frame) => frame.type === 'turn_complete')).toEqual([
      expect.objectContaining({ reason: 'complete' }),
    ]);
    expect(frames.some((frame) => frame.type === 'error')).toBe(false);
    expect(mockedSaveAssistant).toHaveBeenCalledTimes(1);
    expect(mockedFinishTurn).not.toHaveBeenCalled();
  });

  it('returns 503 when CHIPPI_CHAT_RUNTIME=modal but MODAL_CHAT_URL is not configured', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    delete process.env.MODAL_CHAT_URL;
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect(tsStreamMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still saves the user message before branching (shared persistence)', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    await POST(makeRequest({ message: 'find Jane' }));
    expect(mockedSaveUser).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'find Jane' }),
    );
  });

  it('passes ctx + conversationId + userMessage + model to the TS streamer', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    await POST(makeRequest({ message: 'add Preston as a contact' }));
    const call = tsStreamMock.mock.calls[0]?.[0] as unknown as {
      ctx: { space: { slug: string } };
      userMessage: string;
      conversationId: string;
      model: string;
    };
    expect(call.userMessage).toBe('add Preston as a contact');
    expect(call.ctx.space.slug).toBe('jane');
    expect(typeof call.conversationId).toBe('string');
    expect(typeof call.model).toBe('string');
    expect(call.model.length).toBeGreaterThan(0);
  });
});

// ── Dual-path router (active in BOTH runtimes) ────────────────────────────
describe('POST /api/ai/task — dual-path router', () => {
  it('routes generic Q&A messages through the tool-capable runtime', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    await POST(makeRequest({ message: "what's a CMA?" }));
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(directStreamMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes action verbs to the agent path (in-process TS by default)', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    await POST(makeRequest({ message: 'add Preston as a contact' }));
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(directStreamMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes attachments without action verbs through the tool-capable runtime', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    await POST(
      makeRequest({
        message: 'summarize this document',
        attachmentIds: ['att1'],
      }),
    );
    // Attachment hydration is mocked → empty array, so the router decides on
    // the message text alone. "summarize this document" is a read with no
    // action verb and no workspace-data noun (contrast "show my pipeline"),
    // so it stays on the fast direct path.
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(directStreamMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explicit mode:chat still routes action verbs to the agent path', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    // "send Preston a follow-up" has an action verb — mode:chat does NOT
    // override that. Workspace mutations must always reach the tool-capable
    // agent regardless of which UI toggle the realtor had set. The direct
    // (toolless) path would only deflect or hallucinate.
    await POST(makeRequest({ message: 'send Preston a follow-up', mode: 'chat' }));
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(directStreamMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explicit mode:chat keeps pure Q&A tool-capable', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    // No action verb, no workspace noun → heuristic says direct, and
    // mode:chat agrees. Fast path should be taken.
    await POST(makeRequest({ message: 'what is a cap rate?', mode: 'chat' }));
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(directStreamMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('legacy mode:agent resolves to the unified Work runtime even for a generic question', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    // "agent" is the legacy wire alias for Work. Work stays on the unified TS
    // runtime where durable-work and browser tools are registered; Modal is an
    // execution backend reached through those tools, not a separate mode.
    await POST(makeRequest({ message: "what's a CMA?", mode: 'agent' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(directStreamMock).not.toHaveBeenCalled();
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
  });

  it('mode:agent degrades to the in-process TS agent when MODAL_CHAT_URL is unset', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    delete process.env.MODAL_CHAT_URL;
    // A missing Modal URL must not fail the one turn the realtor asked to run;
    // the in-process TS agent has the full tool surface, so we degrade to it.
    await POST(makeRequest({ message: 'add Preston as a contact', mode: 'agent' }));
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the resolved chat model into the direct streamer', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    await POST(makeRequest({ message: 'hello' }));
    const call = directStreamMock.mock.calls[0]?.[0] as unknown as {
      model: string;
      userMessage: string;
    };
    expect(typeof call.model).toBe('string');
    expect(call.model.length).toBeGreaterThan(0);
    expect(call.userMessage).toBe('hello');
  });
});
