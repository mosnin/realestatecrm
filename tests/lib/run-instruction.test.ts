/**
 * Unit tests for the in-process autonomous agent runner.
 *
 * The runner is the Modal-free path for background work: it builds a HEADLESS
 * ToolContext (no Clerk request), drives runChatTurn's streamed result to
 * completion the same way the SSE pump does, and persists the assistant text.
 *
 * Everything external is mocked: supabase (space/owner lookup), runChatTurn
 * (the agent), and saveAssistantMessage (persistence). The mocked runChatTurn
 * returns a faithful SDK-result shape — a `toStream()` whose reader yields a
 * couple of text deltas then `done`, plus a resolved `completed` promise — so
 * the pump exercises its real read-to-done / await-completed loop.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── supabase mock ─────────────────────────────────────────────────────────────
// A tiny chainable builder: from(table).select(...).eq(...).maybeSingle() →
// { data }. The data returned is driven per-table by the vars below so tests
// can simulate a missing space or owner.
const { spaceRow, ownerRow } = vi.hoisted(() => ({
  spaceRow: { value: null as Record<string, unknown> | null },
  ownerRow: { value: null as Record<string, unknown> | null },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: table === 'Space' ? spaceRow.value : ownerRow.value,
              error: null,
            }),
        }),
      }),
    }),
  },
}));

// ── runChatTurn mock ──────────────────────────────────────────────────────────
const { runChatTurnMock } = vi.hoisted(() => ({
  runChatTurnMock: vi.fn(),
}));

vi.mock('@/lib/ai-tools/sdk-chat', () => ({
  runChatTurn: runChatTurnMock,
}));

// ── persistence mock ──────────────────────────────────────────────────────────
const { saveAssistantMessageMock } = vi.hoisted(() => ({
  saveAssistantMessageMock: vi.fn<(input: unknown) => Promise<{ messageId: string }>>(),
}));

vi.mock('@/lib/ai-tools/persistence', () => ({
  saveAssistantMessage: saveAssistantMessageMock,
}));

import { buildHeadlessToolContext, runAutonomousInstruction } from '@/lib/agent/run-instruction';

/**
 * Build a faithful SDK-result stand-in: a ReadableStream-like `toStream()`
 * whose reader yields the given raw events then `{ done: true }`, a resolved
 * `completed`, and the given interruptions. The raw event shape matches what
 * mapSdkEvent reads — a text delta arrives as a raw_model_stream_event with an
 * output_text_delta data payload.
 */
function makeResult(opts?: { text?: string; interruptions?: unknown[] }) {
  const events: unknown[] = [];
  if (opts?.text) {
    events.push({
      type: 'raw_model_stream_event',
      data: { type: 'output_text_delta', delta: opts.text },
    });
  }
  let i = 0;
  return {
    toStream() {
      return {
        getReader() {
          return {
            read: async () =>
              i < events.length
                ? { done: false, value: events[i++] }
                : { done: true, value: undefined },
            releaseLock() {},
          };
        },
      };
    },
    completed: Promise.resolve(),
    interruptions: opts?.interruptions ?? [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  spaceRow.value = { id: 'space_1', slug: 'acme', name: 'Acme', ownerId: 'user_db_1' };
  ownerRow.value = { clerkId: 'clerk_owner_1' };
  saveAssistantMessageMock.mockResolvedValue({ messageId: 'msg_1' });
  runChatTurnMock.mockResolvedValue({ result: makeResult(), agent: {} });
});

describe('buildHeadlessToolContext', () => {
  it('returns a ctx with the owner clerkId as userId and the resolved space', async () => {
    const ctx = await buildHeadlessToolContext('space_1', new AbortController().signal);
    expect(ctx).not.toBeNull();
    expect(ctx!.userId).toBe('clerk_owner_1');
    expect(ctx!.space).toEqual({
      id: 'space_1',
      slug: 'acme',
      name: 'Acme',
      ownerId: 'user_db_1',
    });
  });

  it('returns null when the space is missing', async () => {
    spaceRow.value = null;
    const ctx = await buildHeadlessToolContext('space_missing', new AbortController().signal);
    expect(ctx).toBeNull();
  });

  it('returns null when the owner has no clerkId', async () => {
    ownerRow.value = null;
    const ctx = await buildHeadlessToolContext('space_1', new AbortController().signal);
    expect(ctx).toBeNull();
  });
});

describe('runAutonomousInstruction', () => {
  it('calls runChatTurn with the instruction as userMessage and drives it to completion', async () => {
    runChatTurnMock.mockResolvedValue({ result: makeResult({ text: 'On it.' }), agent: {} });

    const res = await runAutonomousInstruction({ spaceId: 'space_1', instruction: 'Draft a follow-up' });

    expect(res.ok).toBe(true);
    expect(res.ran).toBe(true);

    // userMessage is the instruction; headless → empty history, no resultSink.
    expect(runChatTurnMock).toHaveBeenCalledTimes(1);
    const arg = runChatTurnMock.mock.calls[0][0] as {
      userMessage: string;
      history: unknown[];
      ctx: { userId: string; space: { id: string } };
    };
    expect(arg.userMessage).toBe('Draft a follow-up');
    expect(arg.history).toEqual([]);
    expect(arg.ctx.userId).toBe('clerk_owner_1');
    expect(arg.ctx.space.id).toBe('space_1');

    // The assistant text was accumulated and persisted (conversationId null —
    // a background run isn't attached to a chat thread).
    expect(saveAssistantMessageMock).toHaveBeenCalledTimes(1);
    const saved = saveAssistantMessageMock.mock.calls[0][0] as {
      spaceId: string;
      conversationId: string | null;
      blocks: Array<{ type: string; content: string }>;
    };
    expect(saved.spaceId).toBe('space_1');
    expect(saved.conversationId).toBeNull();
    expect(saved.blocks[0]).toMatchObject({ type: 'text', content: 'On it.' });
  });

  it('reports pending approvals without auto-approving when the run pauses', async () => {
    // An unattended run never approves: the gated send stays unexecuted, the
    // run still completes ok with a pending-approvals summary.
    runChatTurnMock.mockResolvedValue({
      result: makeResult({ interruptions: [{ rawItem: { callId: 'c1' } }] }),
      agent: {},
    });

    const res = await runAutonomousInstruction({ spaceId: 'space_1', instruction: 'Email Jane' });

    expect(res.ok).toBe(true);
    expect(res.ran).toBe(true);
    expect(res.summary).toMatch(/pending approvals/i);
  });

  it('returns ok:false / ran:false when the space cannot be resolved', async () => {
    spaceRow.value = null;
    const res = await runAutonomousInstruction({ spaceId: 'nope', instruction: 'do it' });
    expect(res.ok).toBe(false);
    expect(res.ran).toBe(false);
    expect(res.error).toBeDefined();
    // The agent never started.
    expect(runChatTurnMock).not.toHaveBeenCalled();
    expect(saveAssistantMessageMock).not.toHaveBeenCalled();
  });
});
