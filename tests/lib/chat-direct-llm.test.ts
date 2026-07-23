/**
 * Tests for the Phase 4 direct LLM path.
 *
 * Mocks getLLMClient → exposes chat.completions.create so we can assert the
 * exact provider-shaped payload (system message, history limit, multimodal
 * blocks) and verify the response shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('@/lib/llm')>('@/lib/llm');
  return {
    ...actual,
    getLLMClient: () => ({
      chat: {
        completions: {
          create: createMock,
        },
      },
    }),
  };
});

import {
  runDirectChat,
  runDirectChatStream,
  CHIPPI_INSTRUCTIONS_LITE,
} from '@/lib/chat/direct-llm';

/** Async-iterable stub matching the OpenAI SDK's streaming response shape. */
function streamingResponse(
  chunks: Array<{ content?: string; usage?: Record<string, unknown> }>,
) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) {
        yield {
          choices: c.content !== undefined ? [{ delta: { content: c.content } }] : [],
          usage: c.usage ?? null,
        };
      }
    },
  };
}

function happyResponse(text: string, usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  cost?: number;
}) {
  return {
    choices: [{ message: { content: text } }],
    usage: usage ?? { prompt_tokens: 10, completion_tokens: 5 },
  };
}

beforeEach(() => {
  createMock.mockReset();
});

describe('runDirectChat — wiring', () => {
  it('passes the system message verbatim, no tools', async () => {
    createMock.mockResolvedValue(happyResponse('A CMA is a comparative market analysis.'));
    const result = await runDirectChat({
      model: 'openai/gpt-5.5',
      systemMessage: 'system prompt',
      history: [],
      userMessage: "what's a CMA?",
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe('openai/gpt-5.5');
    expect(call.tools).toBeUndefined();
    expect(call.stream).toBe(false);
    expect(call.messages[0]).toEqual({ role: 'system', content: 'system prompt' });
    expect(call.messages.at(-1).role).toBe('user');
    expect(result.text).toBe('A CMA is a comparative market analysis.');
    expect(result.provider).toBe('openai');
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
  });

  it('caps history at the last 4 turns (8 messages)', async () => {
    createMock.mockResolvedValue(happyResponse('ok'));
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `t${i}`,
    }));
    await runDirectChat({
      model: 'openai/gpt-5.5',
      systemMessage: 'sys',
      history,
      userMessage: 'now',
    });
    const call = createMock.mock.calls[0][0];
    // system + (at most 4 turns × 2 messages = 8) + the new user message = 10 total
    expect(call.messages.length).toBeLessThanOrEqual(10);
    // Last history message preserved is t11 (latest).
    expect(call.messages[call.messages.length - 2].content).toBe('t11');
  });

  it('opts into OpenRouter usage accounting so usage.cost is actually returned', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'or-test-key');
    try {
      createMock.mockResolvedValue(happyResponse('ok'));
      await runDirectChat({
        model: 'qwen/qwen3.7-plus',
        systemMessage: 'sys',
        history: [],
        userMessage: 'hello',
      });
      const call = createMock.mock.calls[0][0];
      expect(call.usage).toEqual({ include: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('omits the usage-accounting param on direct-OpenAI deploys, which reject it', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    try {
      createMock.mockResolvedValue(happyResponse('ok'));
      await runDirectChat({
        model: 'gpt-4o-mini',
        systemMessage: 'sys',
        history: [],
        userMessage: 'hello',
      });
      const call = createMock.mock.calls[0][0];
      expect(call).not.toHaveProperty('usage');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('preserves OpenRouter exact request cost for downstream metering', async () => {
    createMock.mockResolvedValue(happyResponse('ok', {
      prompt_tokens: 10,
      completion_tokens: 5,
      cost: 0.000123,
    }));
    const result = await runDirectChat({
      model: 'qwen/qwen3.7-plus',
      systemMessage: 'sys',
      history: [],
      userMessage: 'hello',
    });
    expect(result.usage.costUsd).toBe(0.000123);
  });

  it('sends Anthropic-shaped image block for an image attachment under an anthropic model', async () => {
    createMock.mockResolvedValue(happyResponse('Looks like a 3-bed.'));
    await runDirectChat({
      model: 'anthropic/claude-opus-4.7',
      systemMessage: 'sys',
      history: [],
      userMessage: 'What is this?',
      attachments: [
        { id: 'a', filename: 'p.png', mimeType: 'image/png', url: 'https://x/p.png' },
      ],
    });
    const call = createMock.mock.calls[0][0];
    const userMsg = call.messages.at(-1);
    expect(Array.isArray(userMsg.content)).toBe(true);
    const imgBlock = (userMsg.content as Array<{ type: string }>).find(
      (b) => b.type === 'image',
    );
    expect(imgBlock).toBeTruthy();
  });

  it('sends OpenAI-shaped image_url block under an openai model', async () => {
    createMock.mockResolvedValue(happyResponse('Looks like a kitchen.'));
    await runDirectChat({
      model: 'openai/gpt-5.5',
      systemMessage: 'sys',
      history: [],
      userMessage: 'What is this?',
      attachments: [
        { id: 'a', filename: 'k.jpg', mimeType: 'image/jpeg', url: 'https://x/k.jpg' },
      ],
    });
    const call = createMock.mock.calls[0][0];
    const userMsg = call.messages.at(-1);
    const imgBlock = (userMsg.content as Array<{ type: string }>).find(
      (b) => b.type === 'image_url',
    );
    expect(imgBlock).toBeTruthy();
  });

  it('emits a fallbackNote for Grok with image attachment', async () => {
    createMock.mockResolvedValue(happyResponse(
      'I can\'t see images directly — try a model with vision.',
    ));
    const result = await runDirectChat({
      model: 'x-ai/grok-4.3',
      systemMessage: 'sys',
      history: [],
      userMessage: 'What is this listing?',
      attachments: [
        { id: 'a', filename: 'p.png', mimeType: 'image/png', url: 'https://x/p.png' },
      ],
    });
    expect(result.fallbackNote).toMatch(/Grok/i);
    expect(result.provider).toBe('xai');
  });
});

describe('CHIPPI_INSTRUCTIONS_LITE', () => {
  it('is significantly smaller than the full Chippi instructions', () => {
    // ~300 token budget — assert a hard char ceiling that catches any
    // accidental bloat. ~4 chars/token → 1500 chars is the soft cap.
    expect(CHIPPI_INSTRUCTIONS_LITE.length).toBeLessThan(1500);
    expect(CHIPPI_INSTRUCTIONS_LITE).toMatch(/Chippi/);
    expect(CHIPPI_INSTRUCTIONS_LITE).toMatch(/answer/i);
  });

  it('makes it clear there are no tools on this path', () => {
    expect(CHIPPI_INSTRUCTIONS_LITE.toLowerCase()).toMatch(/no.*action|do not take action|action path/);
  });
});

describe('runDirectChatStream', () => {
  it('forwards each delta as it arrives and returns the full text + final-chunk usage', async () => {
    createMock.mockResolvedValue(
      streamingResponse([
        { content: 'A CMA ' },
        { content: 'compares recent sales.' },
        {
          content: '',
          usage: { prompt_tokens: 12, completion_tokens: 7, cost: 0.00042 },
        },
      ]),
    );
    const deltas: string[] = [];
    const result = await runDirectChatStream(
      {
        model: 'qwen/qwen3.7-plus',
        systemMessage: 'sys',
        history: [],
        userMessage: "what's a CMA?",
      },
      (d) => {
        deltas.push(d);
      },
    );
    expect(deltas).toEqual(['A CMA ', 'compares recent sales.']);
    expect(result.text).toBe('A CMA compares recent sales.');
    expect(result.usage.promptTokens).toBe(12);
    expect(result.usage.completionTokens).toBe(7);
    expect(result.usage.costUsd).toBe(0.00042);
    const call = createMock.mock.calls[0][0];
    expect(call.stream).toBe(true);
    expect(call.stream_options).toEqual({ include_usage: true });
  });

  it('stops the provider stream when onDelta returns false and resolves with the accumulated text', async () => {
    createMock.mockResolvedValue(
      streamingResponse([
        { content: "I can't do that from here. " },
        { content: 'But you could try…' },
        { content: 'never reached' },
      ]),
    );
    const deltas: string[] = [];
    const result = await runDirectChatStream(
      {
        model: 'qwen/qwen3.7-plus',
        systemMessage: 'sys',
        history: [],
        userMessage: 'send an email',
      },
      (d) => {
        deltas.push(d);
        return false; // stop after the first delta
      },
    );
    expect(deltas).toEqual(["I can't do that from here. "]);
    expect(result.text).toBe("I can't do that from here. ");
    expect(result.usage.promptTokens).toBe(0);
  });

  it('streams reasoning deltas through onReasoning ahead of text and returns the trace', async () => {
    createMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { reasoning: 'Weighing the two listings… ' } }], usage: null };
        yield { choices: [{ delta: { reasoning: 'Oakwood has the newer roof.' } }], usage: null };
        yield { choices: [{ delta: { content: 'Push Oakwood first.' } }], usage: null };
      },
    });
    const reasoning: string[] = [];
    const deltas: string[] = [];
    const result = await runDirectChatStream(
      {
        model: 'qwen/qwen3.7-plus',
        systemMessage: 'sys',
        history: [],
        userMessage: 'compare my two listings',
        reasoningEffort: 'medium',
      },
      (d) => {
        deltas.push(d);
      },
      (r) => {
        reasoning.push(r);
      },
    );
    expect(reasoning).toEqual(['Weighing the two listings… ', 'Oakwood has the newer roof.']);
    expect(deltas).toEqual(['Push Oakwood first.']);
    expect(result.reasoningText).toBe('Weighing the two listings… Oakwood has the newer roof.');
    expect(result.text).toBe('Push Oakwood first.');
  });

  it('widens max_tokens when thinking is engaged so reasoning cannot starve the answer', async () => {
    createMock.mockResolvedValue(streamingResponse([{ content: 'ok' }]));
    await runDirectChatStream(
      {
        model: 'qwen/qwen3.7-plus',
        systemMessage: 'sys',
        history: [],
        userMessage: 'analyze my pipeline',
        reasoningEffort: 'high',
      },
      () => {},
    );
    expect(createMock.mock.calls[0][0].max_tokens).toBe(3000);

    createMock.mockClear();
    createMock.mockResolvedValue(streamingResponse([{ content: 'ok' }]));
    await runDirectChatStream(
      { model: 'qwen/qwen3.7-plus', systemMessage: 'sys', history: [], userMessage: 'hi' },
      () => {},
    );
    expect(createMock.mock.calls[0][0].max_tokens).toBe(800);
  });

  it('sends the explicit reasoning state on OpenRouter for hybrid models — effort when engaged, enabled:false when not', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    try {
      createMock.mockResolvedValue(streamingResponse([{ content: 'ok' }]));
      await runDirectChatStream(
        {
          model: 'qwen/qwen3.7-plus',
          systemMessage: 'sys',
          history: [],
          userMessage: 'analyze my pipeline',
          reasoningEffort: 'medium',
        },
        () => {},
      );
      expect(createMock.mock.calls[0][0].reasoning).toEqual({ effort: 'medium' });

      createMock.mockClear();
      createMock.mockResolvedValue(streamingResponse([{ content: 'ok' }]));
      // No effort input (a caller predating auto-think) → thinking is
      // EXPLICITLY off, so the hybrid default can't silently spend the
      // 800-token cap on thought and return an empty answer.
      await runDirectChatStream(
        { model: 'qwen/qwen3.7-plus', systemMessage: 'sys', history: [], userMessage: 'hi' },
        () => {},
      );
      expect(createMock.mock.calls[0][0].reasoning).toEqual({ enabled: false });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
