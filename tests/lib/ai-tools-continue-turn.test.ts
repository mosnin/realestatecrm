import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type OpenAI from 'openai';
import { defineTool, type ToolContext, type ToolDefinition } from '@/lib/ai-tools/types';
import type { AgentEvent } from '@/lib/ai-tools/events';
import type { PendingApprovalState } from '@/lib/ai-tools/loop';

// ── Mocks matching the runTurn test setup ────────────────────────────────
let currentTools: ToolDefinition[] = [];

vi.mock('@/lib/ai-tools/registry', () => ({
  getTool: (name: string) => currentTools.find((t) => t.name === name),
  listTools: () => currentTools,
  toolRequiresApproval: () => false,
}));

vi.mock('@/lib/ai-tools/openai-format', () => ({
  allToolsForOpenAI: (tools: ToolDefinition[]) =>
    tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: {} },
    })),
}));

import { continueTurn } from '@/lib/ai-tools/continue-turn';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

function makeStream(
  chunks: Array<{
    content?: string;
    toolCalls?: Array<{ index: number; id?: string; name?: string; args?: string }>;
    finishReason?: string;
  }>,
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
        yield { choices: [{ delta, finish_reason: c.finishReason ?? null }] };
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

async function collect(
  openai: OpenAI,
  pendingState: PendingApprovalState,
  decision: 'approved' | 'denied',
  editedArgs?: Record<string, unknown>,
) {
  const events: AgentEvent[] = [];
  const pushEvent = async (ev: Omit<AgentEvent, 'seq' | 'ts'>) => {
    events.push({ ...ev, seq: events.length, ts: '2026-04-22T00:00:00.000Z' } as AgentEvent);
  };
  const result = await continueTurn({
    openai,
    ctx: makeCtx(),
    pendingState,
    decision,
    editedArgs,
    pushEvent,
  });
  return { events, result };
}

beforeEach(() => {
  currentTools = [];
});

describe('continueTurn — denial', () => {
  it('denies without executing, cascades to remainingCalls, lets the model acknowledge', async () => {
    const sendSpy = vi.fn(async () => ({ summary: 'sent' }));
    currentTools = [
      defineTool({
        name: 'send_email',
        description: 'send',
        parameters: z.object({ to: z.string() }),
        requiresApproval: true,
        handler: sendSpy,
      }) as ToolDefinition,
    ];

    // One pending call + one remaining call from the same batch.
    const pendingState: PendingApprovalState = {
      requestId: 'req_1',
      pending: { callId: 'c1', name: 'send_email', args: { to: 'a@x.com' } },
      remainingCalls: [{ callId: 'c2', name: 'send_email', args: { to: 'b@x.com' } }],
      messages: [
        { role: 'user', content: 'email Jane and Bob' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'send_email', arguments: '{"to":"a@x.com"}' } },
            { id: 'c2', type: 'function', function: { name: 'send_email', arguments: '{"to":"b@x.com"}' } },
          ],
        },
      ],
    };

    // Model acknowledges after seeing the denial.
    const openai = makeFakeOpenAI([
      makeStream([{ content: 'Understood — not sending.' }, { finishReason: 'stop' }]),
    ]);

    const { events, result } = await collect(openai, pendingState, 'denied');

    // Handler never ran.
    expect(sendSpy).not.toHaveBeenCalled();

    // Event sequence: permission_resolved, then the model's ack text.
    expect(events[0].type).toBe('permission_resolved');
    expect((events[0] as { decision?: string }).decision).toBe('denied');
    const finalText = events.filter((e) => e.type === 'text_delta');
    expect(finalText.at(-1)).toMatchObject({ delta: 'Understood — not sending.' });

    // Two denied PermissionBlocks — the pending one (direct) + the
    // cascaded remaining one.
    const permBlocks = result.blocks.filter((b) => 'type' in b && b.type === 'permission');
    expect(permBlocks).toHaveLength(2);
    expect(permBlocks[0]).toMatchObject({ callId: 'c1', decision: 'denied' });
    expect(permBlocks[1]).toMatchObject({ callId: 'c2', decision: 'denied' });

    expect(result.reason).toBe('complete');
  });
});

describe('continueTurn — approval', () => {
  it('runs the pending call, appends the result, lets the model react', async () => {
    const sendSpy = vi.fn(async (args: { to: string }) => ({
      summary: `Sent email to ${args.to}.`,
    }));
    currentTools = [
      defineTool({
        name: 'send_email',
        description: 'send',
        parameters: z.object({ to: z.string() }),
        requiresApproval: true,
        handler: sendSpy,
      }) as ToolDefinition,
    ];

    const pendingState: PendingApprovalState = {
      requestId: 'req_1',
      pending: { callId: 'c1', name: 'send_email', args: { to: 'a@x.com' } },
      remainingCalls: [],
      messages: [
        { role: 'user', content: 'email Jane' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'send_email', arguments: '{"to":"a@x.com"}' } },
          ],
        },
      ],
    };

    const openai = makeFakeOpenAI([makeStream([{ content: 'Done.' }, { finishReason: 'stop' }])]);

    const { events, result } = await collect(openai, pendingState, 'approved');

    // Handler ran with the pending args.
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toEqual({ to: 'a@x.com' });

    // Event sequence: permission_resolved → tool_call_start →
    // tool_call_result → text.
    const types = events.map((e) => e.type);
    expect(types.indexOf('permission_resolved')).toBeLessThan(types.indexOf('tool_call_start'));
    expect(types.indexOf('tool_call_start')).toBeLessThan(types.indexOf('tool_call_result'));
    expect(types.indexOf('tool_call_result')).toBeLessThan(types.lastIndexOf('text_delta'));

    // Blocks: [tool_call (approved, complete), text].
    expect(result.blocks[0]).toMatchObject({
      type: 'tool_call',
      callId: 'c1',
      status: 'complete',
    });
    expect(result.reason).toBe('complete');
  });

  it('honours editedArgs — the model sees what the user actually approved', async () => {
    const sendSpy = vi.fn(async (args: { to: string }) => ({
      summary: `Sent email to ${args.to}.`,
    }));
    currentTools = [
      defineTool({
        name: 'send_email',
        description: 'send',
        parameters: z.object({ to: z.string() }),
        requiresApproval: true,
        handler: sendSpy,
      }) as ToolDefinition,
    ];

    const pendingState: PendingApprovalState = {
      requestId: 'req_1',
      pending: { callId: 'c1', name: 'send_email', args: { to: 'a@x.com' } },
      remainingCalls: [],
      messages: [
        { role: 'user', content: 'email Alex' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'send_email', arguments: '{"to":"a@x.com"}' } },
          ],
        },
      ],
    };

    const openai = makeFakeOpenAI([makeStream([{ content: 'OK.' }, { finishReason: 'stop' }])]);

    const { events } = await collect(openai, pendingState, 'approved', { to: 'alex@example.com' });

    // Handler got the edited args, not the original ones.
    expect(sendSpy.mock.calls[0][0]).toEqual({ to: 'alex@example.com' });

    // The permission_resolved event carries editedArgs for the UI's audit trail.
    const resolved = events.find((e) => e.type === 'permission_resolved');
    expect((resolved as { editedArgs?: Record<string, unknown> }).editedArgs).toEqual({
      to: 'alex@example.com',
    });

    // The start event uses the edited args too (so the rendered block matches).
    const start = events.find((e) => e.type === 'tool_call_start');
    expect((start as { args: Record<string, unknown> }).args).toEqual({ to: 'alex@example.com' });
  });

  it('re-pauses if the next remaining call is also mutating', async () => {
    const sendSpy = vi.fn(async () => ({ summary: 'sent' }));
    currentTools = [
      defineTool({
        name: 'send_email',
        description: 'send',
        parameters: z.object({ to: z.string() }),
        requiresApproval: true,
        handler: sendSpy,
      }) as ToolDefinition,
    ];

    const pendingState: PendingApprovalState = {
      requestId: 'req_1',
      pending: { callId: 'c1', name: 'send_email', args: { to: 'a@x.com' } },
      // A SECOND mutating call queued in the same batch.
      remainingCalls: [{ callId: 'c2', name: 'send_email', args: { to: 'b@x.com' } }],
      messages: [
        { role: 'user', content: 'email Jane and Bob' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'send_email', arguments: '{"to":"a@x.com"}' } },
            { id: 'c2', type: 'function', function: { name: 'send_email', arguments: '{"to":"b@x.com"}' } },
          ],
        },
      ],
    };

    const openai = makeFakeOpenAI([]); // shouldn't be called — we pause before the next model round.

    const { events, result } = await collect(openai, pendingState, 'approved');

    // Round 1 ran (send to a@x.com). Second send did not.
    expect(sendSpy).toHaveBeenCalledTimes(1);

    // Two permission events: the original resolved + a NEW one for c2.
    const perms = events.filter((e) => e.type === 'permission_required');
    expect(perms).toHaveLength(1);
    expect(perms[0]).toMatchObject({ callId: 'c2', name: 'send_email' });

    expect(result.reason).toBe('paused');
    expect(result.pendingApproval?.pending.callId).toBe('c2');
  });
});
