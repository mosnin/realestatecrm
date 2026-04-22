/**
 * Skills + runSubAgent tests.
 *
 * We mock the OpenAI client + tool registry so the sub-agent loop runs
 * fully in-memory. The happy path exercises one tool-use round followed
 * by a summary round; the budget-exhaustion path exercises the forced
 * summary the loop falls back to when maxRounds is hit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { defineTool, type ToolContext, type ToolDefinition } from '@/lib/ai-tools/types';
import { validateSkill, type Skill } from '@/lib/ai-tools/skills/types';

// Registry mock — swap currentTools per test.
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

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 99, resetAt: 0 }),
}));

import { runSubAgent } from '@/lib/ai-tools/skills/run-sub-agent';

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
    ...overrides,
  };
}

/** Minimal fake OpenAI client that drives completions from a scripted queue. */
function makeFakeOpenAI(script: unknown[]) {
  let step = 0;
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const next = script[step] ?? script[script.length - 1];
          step += 1;
          return next;
        }),
      },
    },
  } as unknown as import('openai').default;
}

beforeEach(() => {
  currentTools = [];
});

describe('validateSkill', () => {
  it('accepts a skill whose allowlist points at registered read-only tools', () => {
    const tool = defineTool({
      name: 'search_x',
      description: 'search x',
      parameters: z.object({}),
      requiresApproval: false,
      handler: async () => ({ summary: '' }),
    });
    const skill: Skill = {
      name: 'x_researcher',
      description: 'looks things up',
      systemPrompt: 'do your job',
      toolAllowlist: ['search_x'],
    };
    expect(() => validateSkill(skill, [tool as ToolDefinition])).not.toThrow();
  });

  it('rejects a skill whose allowlist references an unknown tool', () => {
    expect(() =>
      validateSkill(
        {
          name: 'bad',
          description: '',
          systemPrompt: '',
          toolAllowlist: ['not_registered'],
        },
        [],
      ),
    ).toThrow(/unknown tool/);
  });

  it('rejects a skill that tries to grant a mutating tool to a sub-agent', () => {
    const mutating = defineTool({
      name: 'send_thing',
      description: 'mutation',
      parameters: z.object({}),
      requiresApproval: true,
      handler: async () => ({ summary: '' }),
    });
    expect(() =>
      validateSkill(
        {
          name: 'evil',
          description: '',
          systemPrompt: '',
          toolAllowlist: ['send_thing'],
        },
        [mutating as ToolDefinition],
      ),
    ).toThrow(/read-only/);
  });
});

describe('runSubAgent', () => {
  it('returns the model\'s text summary when it replies without tool calls', async () => {
    const openai = makeFakeOpenAI([
      {
        choices: [
          {
            message: { role: 'assistant', content: 'Jane is in tour stage, no follow-up needed.' },
          },
        ],
      },
    ]);
    const skill: Skill = {
      name: 'test_skill',
      description: '',
      systemPrompt: 'be concise',
      toolAllowlist: [],
    };
    const out = await runSubAgent({
      skill,
      task: 'Tell me about Jane.',
      ctx: makeCtx(),
      openai,
    });
    expect(out.reason).toBe('complete');
    expect(out.summary).toMatch(/Jane is in tour stage/);
    expect(out.toolCalls).toBe(0);
  });

  it('executes one tool round, then returns the summary on the next round', async () => {
    const searchTool = defineTool({
      name: 'search_contacts',
      description: 't',
      parameters: z.object({ q: z.string() }),
      requiresApproval: false,
      handler: async () => ({ summary: 'Found Jane, id=c_1' }),
    });
    currentTools = [searchTool as ToolDefinition];

    const openai = makeFakeOpenAI([
      // Round 1: model calls search_contacts
      {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'search_contacts', arguments: '{"q":"Jane"}' },
                },
              ],
            },
          },
        ],
      },
      // Round 2: model summarises
      {
        choices: [
          {
            message: { role: 'assistant', content: 'Found Jane in the CRM.' },
          },
        ],
      },
    ]);
    const skill: Skill = {
      name: 'contact_lookup',
      description: '',
      systemPrompt: 'find contacts',
      toolAllowlist: ['search_contacts'],
    };
    const out = await runSubAgent({
      skill,
      task: 'Find Jane',
      ctx: makeCtx(),
      openai,
    });
    expect(out.reason).toBe('complete');
    expect(out.toolCalls).toBe(1);
    expect(out.summary).toMatch(/Found Jane/);
  });

  it('returns aborted immediately when the signal fires before the first round', async () => {
    const controller = new AbortController();
    controller.abort();
    const openai = makeFakeOpenAI([]);
    const skill: Skill = {
      name: 's',
      description: '',
      systemPrompt: '',
      toolAllowlist: [],
    };
    const out = await runSubAgent({
      skill,
      task: 'x',
      ctx: makeCtx({ signal: controller.signal }),
      openai,
    });
    expect(out.reason).toBe('aborted');
    expect(out.summary).toBe('');
  });

  it('returns max_rounds + a best-effort summary when the tool budget is exhausted', async () => {
    const loopingTool = defineTool({
      name: 'busy_work',
      description: 't',
      parameters: z.object({}),
      requiresApproval: false,
      handler: async () => ({ summary: 'did some work' }),
    });
    currentTools = [loopingTool as ToolDefinition];

    // The model keeps asking for the same tool round after round — the
    // final fallback round (tools disabled) is the one that returns text.
    const toolRound = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_x',
                type: 'function',
                function: { name: 'busy_work', arguments: '{}' },
              },
            ],
          },
        },
      ],
    };
    const fallbackRound = {
      choices: [
        {
          message: { role: 'assistant', content: 'Did my best, ran out of budget.' },
        },
      ],
    };
    const openai = makeFakeOpenAI([toolRound, toolRound, fallbackRound]);
    const skill: Skill = {
      name: 'busy',
      description: '',
      systemPrompt: '',
      toolAllowlist: ['busy_work'],
      maxRounds: 2,
    };
    const out = await runSubAgent({
      skill,
      task: 'loop forever',
      ctx: makeCtx(),
      openai,
    });
    expect(out.reason).toBe('max_rounds');
    expect(out.summary).toMatch(/ran out of budget/);
    expect(out.toolCalls).toBe(2);
  });

  it('drops a tool whose allowlist entry stopped being read-only at runtime', async () => {
    // Simulate a registry drift: the skill was validated against a read-only
    // version, but by the time the sub-agent runs, the tool now requires
    // approval. The runtime guard in resolveAllowedTools drops it with an
    // error log, and the sub-agent falls back to plain answering.
    const nowMutating = defineTool({
      name: 'drifted',
      description: 't',
      parameters: z.object({}),
      requiresApproval: true,
      handler: async () => ({ summary: '' }),
    });
    currentTools = [nowMutating as ToolDefinition];

    const openai = makeFakeOpenAI([
      { choices: [{ message: { role: 'assistant', content: 'I could not use any tools here.' } }] },
    ]);
    const skill: Skill = {
      name: 'drift_test',
      description: '',
      systemPrompt: '',
      toolAllowlist: ['drifted'],
    };
    const out = await runSubAgent({
      skill,
      task: 'x',
      ctx: makeCtx(),
      openai,
    });
    expect(out.reason).toBe('complete');
    expect(out.summary).toMatch(/could not use any tools/);
  });
});
