/**
 * SDK bridge — verifies the conversion from our ToolDefinition to the
 * `@openai/agents` SDK's tool() shape and that the wrapped invoke routes
 * through our handler with our context.
 *
 * We do NOT run a full agent.run() flow here — that calls OpenAI and is
 * expensive/flaky. The bridge's job is the conversion + invoke wrapping;
 * that's what we assert. The SDK normalises our `execute` callback into
 * an `invoke(runCtx, jsonString)` method on the resulting tool.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { RunContext } from '@openai/agents';
import { defineTool } from '@/lib/ai-tools/types';
import type { ToolContext } from '@/lib/ai-tools/types';
import { toSdkTool, summariseInterruption } from '@/lib/ai-tools/sdk-bridge';

function makeCtx(): ToolContext {
  return {
    userId: 'u_1',
    space: { id: 's_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_1' },
    signal: new AbortController().signal,
  };
}

describe('toSdkTool', () => {
  it('maps name, description, and zod parameters straight through', () => {
    const def = defineTool({
      name: 'find_widget',
      description: 'Find a widget by id.',
      parameters: z.object({ id: z.string() }),
      requiresApproval: false,
      handler: async () => ({ summary: 'found' }),
    });

    const sdk = toSdkTool(def, makeCtx());

    expect(sdk.name).toBe('find_widget');
    expect(sdk.description).toBe('Find a widget by id.');
    expect(sdk.type).toBe('function');
  });

  it('needsApproval resolves to false for read-only tools', async () => {
    const def = defineTool({
      name: 'read_thing',
      description: 'read',
      parameters: z.object({ id: z.string() }),
      requiresApproval: false,
      handler: async () => ({ summary: 'ok' }),
    });

    const sdk = toSdkTool(def, makeCtx());
    const approves = await sdk.needsApproval(new RunContext(), { id: 'x' });
    expect(approves).toBe(false);
  });

  it('needsApproval resolves to true for mutating tools with requiresApproval:true', async () => {
    const def = defineTool({
      name: 'mutate_thing',
      description: 'mutate',
      parameters: z.object({ id: z.string() }),
      requiresApproval: true,
      summariseCall: (args) => `Mutate ${args.id}`,
      rateLimit: { max: 60, windowSeconds: 3600 },
      handler: async () => ({ summary: 'mutated' }),
    });

    const sdk = toSdkTool(def, makeCtx());
    const approves = await sdk.needsApproval(new RunContext(), { id: 'x' });
    expect(approves).toBe(true);
  });

  it("forwards args + ctx to shouldApprove for requiresApproval:'maybe'", async () => {
    const shouldApprove = vi.fn(() => false);
    const def = defineTool({
      name: 'maybe_thing',
      description: 'maybe',
      parameters: z.object({ count: z.number() }),
      requiresApproval: 'maybe',
      shouldApprove: shouldApprove as (args: { count: number }, ctx: ToolContext) => boolean,
      summariseCall: (args) => `Process ${args.count}`,
      rateLimit: { max: 60, windowSeconds: 3600 },
      handler: async () => ({ summary: 'done' }),
    });

    const ctx = makeCtx();
    const sdk = toSdkTool(def, ctx);
    const result = await sdk.needsApproval(new RunContext(), { count: 5 });

    expect(result).toBe(false);
    expect(shouldApprove).toHaveBeenCalledWith({ count: 5 }, ctx);
  });

  it('invoke() runs our handler with parsed args + ctx and serialises summary back to the model', async () => {
    const handler = vi.fn(async () => ({ summary: 'found Jane Chen', display: 'success' as const }));
    const def = defineTool({
      name: 'find_jane',
      description: 'find Jane',
      parameters: z.object({ name: z.string() }),
      requiresApproval: false,
      handler,
    });

    const ctx = makeCtx();
    const sdk = toSdkTool(def, ctx);
    const out = await sdk.invoke(new RunContext(), JSON.stringify({ name: 'Jane' }));

    expect(handler).toHaveBeenCalledWith({ name: 'Jane' }, ctx);
    expect(out).toBe('found Jane Chen');
  });

  it('invoke() prefixes "Error: " when the handler returns display:"error" so the model recognises the failure', async () => {
    const def = defineTool({
      name: 'fragile_op',
      description: 'fragile',
      parameters: z.object({}),
      requiresApproval: false,
      handler: async () => ({ summary: 'something snapped', display: 'error' as const }),
    });

    const sdk = toSdkTool(def, makeCtx());
    const out = await sdk.invoke(new RunContext(), JSON.stringify({}));

    expect(out).toBe('Error: something snapped');
  });
});

describe('summariseInterruption', () => {
  const registry = [
    defineTool({
      name: 'send_thing',
      description: 'send',
      parameters: z.object({ to: z.string() }),
      requiresApproval: true,
      summariseCall: (args) => `Send to ${args.to}`,
      rateLimit: { max: 60, windowSeconds: 3600 },
      handler: async () => ({ summary: 'sent' }),
    }),
  ];

  it('renders the realtor-facing approval message via the original tool definition', () => {
    expect(summariseInterruption('send_thing', { to: 'jane@x.com' }, registry)).toBe(
      'Send to jane@x.com',
    );
  });

  it('falls back to a generic prompt when the tool is unknown', () => {
    expect(summariseInterruption('mystery_tool', {}, registry)).toBe('Run mystery_tool');
  });
});
