import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type OpenAI from 'openai';
import { defineTool, type ToolContext, type ToolDefinition } from '@/lib/ai-tools/types';
import type { AgentEvent } from '@/lib/ai-tools/events';

// ── Mock the registry + OpenAI format so we can register test tools ────────
// The loop calls `listTools()` (to build the tools array for OpenAI) and
// `getTool(name)` (to check approval policy and to execute). Point both at
// our in-test set.
let currentTools: ToolDefinition[] = [];

vi.mock('@/lib/ai-tools/registry', () => ({
  getTool: (name: string) => currentTools.find((t) => t.name === name),
  listTools: () => currentTools,
  toolRequiresApproval: () => false,
}));

// openai-format calls `z.toJSONSchema()` via zod v4. Stub it out — the
// shape doesn't matter to the loop, only to OpenAI, and we pass a fake
// OpenAI client here.
vi.mock('@/lib/ai-tools/openai-format', () => ({
  allToolsForOpenAI: (tools: ToolDefinition[]) =>
    tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: {} },
    })),
}));

import { runTurn } from '@/lib/ai-tools/loop';

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
    ...overrides,
  };
}

/**
 * Build a fake async iterable stream from a list of delta chunks. Mimics
 * the shape OpenAI's `chat.completions.create({ stream: true })` returns —
 * `{ choices: [{ delta, finish_reason }] }` chunks.
 */
function makeStream(
  chunks: Array<{ content?: string; toolCalls?: Array<{ index: number; id?: string; name?: string; args?: string }>; finishReason?: string }>,
) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) {
        const delta: Record<string, unknown> = {};
        if (c.content !== undefined) delta.content = c.content;
        if (c.toolCalls) {
          delta.tool_calls = c.toolCalls.map((tc) => ({
            index: tc.index,
            ...(tc.id && { id: tc.id }),
            function: {
              ...(tc.name && { name: tc.name }),
              ...(tc.args !== undefined && { arguments: tc.args }),
            },
          }));
        }
        yield {
          choices: [{ delta, finish_reason: c.finishReason ?? null }],
        };
      }
    },
  };
}

function makeFakeOpenAI(streams: ReturnType<typeof makeStream>[]): OpenAI {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const s = streams[callCount];
          callCount += 1;
          return s;
        }),
      },
    },
  } as unknown as OpenAI;
}

async function collectEvents(
  openai: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ctx: ToolContext = makeCtx(),
) {
  const events: AgentEvent[] = [];
  const pushEvent = async (ev: Omit<AgentEvent, 'seq' | 'ts'>) => {
    events.push({ ...ev, seq: events.length, ts: '2026-04-22T00:00:00.000Z' } as AgentEvent);
  };
  const result = await runTurn({ openai, ctx, messages, pushEvent });
  return { events, result };
}

beforeEach(() => {
  currentTools = [];
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('runTurn — pure text turn', () => {
  it('streams text deltas, emits one text block, returns complete', async () => {
    currentTools = [];
    const openai = makeFakeOpenAI([
      makeStream([
        { content: 'Hello ' },
        { content: 'world.' },
        { finishReason: 'stop' },
      ]),
    ]);

    const { events, result } = await collectEvents(openai, [
      { role: 'user', content: 'Say hi.' },
    ]);

    // Two text_delta events, zero tool events.
    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas).toHaveLength(2);
    expect(events.find((e) => e.type.startsWith('tool_call_'))).toBeUndefined();

    // One text block containing the concatenated content.
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ type: 'text', content: 'Hello world.' });
    expect(result.reason).toBe('complete');
  });
});

describe('runTurn — single tool call round-trip', () => {
  it('streams tool_call_start → tool_call_result → text → complete', async () => {
    const handler = vi.fn(async () => ({ summary: 'Found 2 contacts.', display: 'contacts' as const }));
    currentTools = [
      defineTool({
        name: 'search_contacts',
        description: 'find contacts',
        parameters: z.object({ query: z.string() }),
        requiresApproval: false,
        handler,
      }) as ToolDefinition,
    ];

    const openai = makeFakeOpenAI([
      // Round 1: model issues a tool_call in fragments.
      makeStream([
        { toolCalls: [{ index: 0, id: 'call_1', name: 'search_contacts' }] },
        { toolCalls: [{ index: 0, args: '{"que' }] },
        { toolCalls: [{ index: 0, args: 'ry":"hot"}' }] },
        { finishReason: 'tool_calls' },
      ]),
      // Round 2: model responds to the tool result with plain text.
      makeStream([{ content: 'Found 2.' }, { finishReason: 'stop' }]),
    ]);

    const { events, result } = await collectEvents(openai, [
      { role: 'user', content: 'Who are my hot leads?' },
    ]);

    // Handler was called with the parsed, zod-validated args.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({ query: 'hot' });

    // Event sequence: tool_call_start, tool_call_result, text_delta.
    const types = events.map((e) => e.type);
    expect(types).toContain('tool_call_start');
    expect(types).toContain('tool_call_result');
    expect(types).toContain('text_delta');
    // Tool events come before the final text.
    expect(types.indexOf('tool_call_result')).toBeLessThan(types.lastIndexOf('text_delta'));

    const startEvent = events.find((e) => e.type === 'tool_call_start');
    expect(startEvent).toMatchObject({
      callId: 'call_1',
      name: 'search_contacts',
      args: { query: 'hot' },
    });

    const resultEvent = events.find((e) => e.type === 'tool_call_result');
    expect(resultEvent).toMatchObject({
      callId: 'call_1',
      ok: true,
      summary: 'Found 2 contacts.',
    });

    // Blocks: [tool_call, text]
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({
      type: 'tool_call',
      name: 'search_contacts',
      status: 'complete',
      display: 'contacts',
    });
    expect(result.blocks[1]).toMatchObject({ type: 'text', content: 'Found 2.' });
    expect(result.reason).toBe('complete');
  });
});

describe('runTurn — tool execution failures surface to the model', () => {
  it('emits tool_call_result with ok=false when the handler throws', async () => {
    currentTools = [
      defineTool({
        name: 'broken_tool',
        description: 'always fails',
        parameters: z.object({}),
        requiresApproval: false,
        handler: async () => {
          throw new Error('database offline');
        },
      }) as ToolDefinition,
    ];

    const openai = makeFakeOpenAI([
      makeStream([
        { toolCalls: [{ index: 0, id: 'call_x', name: 'broken_tool', args: '{}' }] },
        { finishReason: 'tool_calls' },
      ]),
      makeStream([{ content: 'Sorry, that failed.' }, { finishReason: 'stop' }]),
    ]);

    const { events, result } = await collectEvents(openai, [{ role: 'user', content: 'do it' }]);

    const failEvent = events.find((e) => e.type === 'tool_call_result');
    expect(failEvent).toMatchObject({ ok: false });
    expect((failEvent as { error?: string }).error).toMatch(/database offline/);

    const toolBlock = result.blocks.find((b) => 'type' in b && b.type === 'tool_call');
    expect(toolBlock).toMatchObject({ status: 'error' });
  });

  it('refuses approval-gated tools (Phase 3 placeholder)', async () => {
    currentTools = [
      defineTool({
        name: 'send_email',
        description: 'send an email',
        parameters: z.object({}),
        requiresApproval: true,
        handler: async () => ({ summary: 'sent' }),
      }) as ToolDefinition,
    ];

    const openai = makeFakeOpenAI([
      makeStream([
        { toolCalls: [{ index: 0, id: 'call_mut', name: 'send_email', args: '{}' }] },
        { finishReason: 'tool_calls' },
      ]),
      makeStream([{ content: 'OK.' }, { finishReason: 'stop' }]),
    ]);

    const { events, result } = await collectEvents(openai, [{ role: 'user', content: 'email Jane' }]);

    // No tool_call_start — we short-circuited before executing.
    expect(events.find((e) => e.type === 'tool_call_start')).toBeUndefined();

    // One tool_call_result with ok=false, and a block in 'denied' state.
    const failEvent = events.find((e) => e.type === 'tool_call_result');
    expect(failEvent).toMatchObject({ ok: false });
    const toolBlock = result.blocks.find((b) => 'type' in b && b.type === 'tool_call');
    expect(toolBlock).toMatchObject({ status: 'denied' });
  });
});

describe('runTurn — abort propagation', () => {
  it('returns aborted when the signal fires before the stream starts', async () => {
    const controller = new AbortController();
    controller.abort();
    const openai = makeFakeOpenAI([makeStream([])]);

    const { result } = await collectEvents(
      openai,
      [{ role: 'user', content: 'hi' }],
      makeCtx({ signal: controller.signal }),
    );
    expect(result.reason).toBe('aborted');
  });
});
