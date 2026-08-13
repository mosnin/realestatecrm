import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIChatCompletionsModel } from '@openai/agents';
import { buildChatAgent } from '@/lib/ai-tools/sdk-chat';
import type { ToolContext } from '@/lib/ai-tools/types';

const ctx: ToolContext = {
  userId: 'user-1',
  space: { id: 'space-1', slug: 'demo', name: 'Demo', ownerId: 'owner-1' },
  signal: new AbortController().signal,
  workMode: true,
};

afterEach(() => vi.unstubAllEnvs());

describe('Qwen Agents SDK provider contract', () => {
  it('pins the 0.8.5 adapter gap: streamed reasoning_details do not reach tool replay', async () => {
    const reasoningDetails = [{
      type: 'reasoning.text',
      text: 'signed reasoning',
      signature: 'signature-1',
      id: 'reasoning-1',
      format: 'unknown',
      index: 0,
    }];
    async function* providerStream() {
      yield {
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'qwen/qwen3.7-plus',
        choices: [{
          index: 0,
          finish_reason: null,
          delta: {
            role: 'assistant',
            reasoning_details: reasoningDetails,
            tool_calls: [{
              index: 0,
              id: 'call-1',
              type: 'function',
              function: { name: 'list_contacts', arguments: '{}' },
            }],
          },
        }],
      };
      yield {
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'qwen/qwen3.7-plus',
        choices: [{ index: 0, finish_reason: 'tool_calls', delta: {} }],
      };
    }

    const create = vi.fn(async () => providerStream());
    const model = new OpenAIChatCompletionsModel(
      { chat: { completions: { create } } } as never,
      'qwen/qwen3.7-plus',
    );
    const events: Array<Record<string, unknown>> = [];
    for await (const event of model.getStreamedResponse({
      input: 'Rank my people.',
      modelSettings: {},
      tools: [],
      handoffs: [],
      outputType: 'text',
      tracing: false,
    } as never)) {
      events.push(event as unknown as Record<string, unknown>);
    }

    const done = events.find((event) => event.type === 'response_done') as {
      response: { output: Array<{ type: string; providerData?: Record<string, unknown> }> };
    };
    const toolCall = done.response.output.find((item) => item.type === 'function_call');
    expect(toolCall).toBeDefined();
    expect(toolCall?.providerData?.reasoning_details).toBeUndefined();
  });

  it('disables Qwen reasoning and parallel tool calls on the affected agent path', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const agent = buildChatAgent(ctx, {
      model: 'test-model',
      modelSlug: 'qwen/qwen3.7-plus',
      userMessage: 'Analyze my contacts and rank the strongest people.',
    });

    expect(agent.modelSettings.parallelToolCalls).toBe(false);
    expect(agent.modelSettings.providerData).toEqual({
      reasoning: { enabled: false },
    });
  });

  it('forces an honest no-tool answer for the observed unsupported PDF request', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const userMessage =
      'Set this as the active Work goal: go through my contacts and make a downloadable pdf based on who the best leads are in order';
    const agent = buildChatAgent(ctx, {
      model: 'test-model',
      modelSlug: 'qwen/qwen3.7-plus',
      userMessage,
    });
    const names = agent.tools.map((tool) => tool.name);

    expect(agent.modelSettings.toolChoice).toBe('none');
    expect(names).not.toContain('create_plan');
    expect(names).not.toContain('start_work_session');
  });

  it('keeps durable work available for the downloadable Markdown format it can persist', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const agent = buildChatAgent(ctx, {
      model: 'test-model',
      modelSlug: 'qwen/qwen3.7-plus',
      userMessage: 'Create a downloadable report ranking all my contacts.',
    });

    expect(agent.modelSettings.toolChoice).toBeUndefined();
    expect(agent.tools.map((tool) => tool.name)).toContain('start_work_session');
  });
});
