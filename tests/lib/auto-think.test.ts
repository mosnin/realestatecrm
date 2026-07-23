/**
 * Auto-think heuristic + request-param tests (lib/chat/auto-think.ts).
 *
 * The heuristic mirrors agent/llm.py:decide_reasoning_effort (agent surface)
 * and adds the direct surface's 'none' floor. reasoningBodyParams is the
 * request-shaping contract: explicit ON for engaged turns, explicit OFF for
 * capable models on quiet turns (hybrid models think by default — the empty
 * request shape is what let the Qwen default burn the output budget and
 * return empty answers), and untouched request shape for incapable models.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  decideReasoningEffort,
  supportsReasoning,
  reasoningBodyParams,
} from '@/lib/chat/auto-think';

beforeEach(() => {
  vi.unstubAllEnvs();
  delete process.env.CHIPPI_REASONING_EFFORT;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('decideReasoningEffort — floors', () => {
  it('direct surface floors at none for trivial turns', () => {
    expect(decideReasoningEffort('hi', { surface: 'direct' })).toBe('none');
    expect(decideReasoningEffort("what's Jane's phone number?", { surface: 'direct' })).toBe(
      'none',
    );
    expect(decideReasoningEffort('', { surface: 'direct' })).toBe('none');
    expect(decideReasoningEffort(null, { surface: 'direct' })).toBe('none');
  });

  it('agent surface floors at low for trivial turns', () => {
    expect(decideReasoningEffort('hi', { surface: 'agent' })).toBe('low');
    expect(decideReasoningEffort('set a reminder for 3pm', { surface: 'agent' })).toBe('low');
    expect(decideReasoningEffort(null, { surface: 'agent' })).toBe('low');
  });
});

describe('decideReasoningEffort — escalation', () => {
  it('planning signals lift to medium on both surfaces', () => {
    for (const msg of [
      'build a plan for the week',
      'compare these two deals side by side',
      'analyze my pipeline',
      'should I refinance the listing terms',
    ]) {
      expect(decideReasoningEffort(msg, { surface: 'direct' })).toBe('medium');
      expect(decideReasoningEffort(msg, { surface: 'agent' })).toBe('medium');
    }
  });

  it('deep signals lift to high', () => {
    for (const msg of [
      'think hard about how to price this listing',
      'do a deep dive on my stale leads',
      'give me a comprehensive review of the quarter',
      'what is the negotiation strategy for the Oakwood offer',
    ]) {
      expect(decideReasoningEffort(msg, { surface: 'agent' })).toBe('high');
    }
  });

  it('a many-question planning ask reads as high; many questions alone as medium', () => {
    expect(
      decideReasoningEffort(
        'Compare these listings? Which should I push? What is the risk on each?',
        { surface: 'agent' },
      ),
    ).toBe('high');
    expect(
      decideReasoningEffort('Who is Jane? Where is the file? When is the tour?', {
        surface: 'direct',
      }),
    ).toBe('medium');
  });

  it('trailing-space signals avoid substring false positives', () => {
    expect(decideReasoningEffort('I audited the pipeline yesterday', { surface: 'agent' })).toBe(
      'low',
    );
    expect(decideReasoningEffort('researched comparables already', { surface: 'agent' })).toBe(
      'low',
    );
  });
});

describe('decideReasoningEffort — env override', () => {
  it('a valid CHIPPI_REASONING_EFFORT wins over the heuristic on both surfaces', () => {
    vi.stubEnv('CHIPPI_REASONING_EFFORT', 'high');
    expect(decideReasoningEffort('hi', { surface: 'direct' })).toBe('high');
    expect(decideReasoningEffort('hi', { surface: 'agent' })).toBe('high');
  });

  it('an invalid override falls through silently', () => {
    vi.stubEnv('CHIPPI_REASONING_EFFORT', 'turbo');
    expect(decideReasoningEffort('hi', { surface: 'direct' })).toBe('none');
  });
});

describe('supportsReasoning', () => {
  it('covers the Chippi default and the major thinking families', () => {
    for (const m of [
      'qwen/qwen3.7-plus',
      'anthropic/claude-opus-4.7',
      'openai/gpt-5.5',
      'openai/o3',
      'x-ai/grok-4.3',
      'deepseek/deepseek-r1',
      'google/gemini-2.5-pro',
      'z-ai/glm-5.2',
      'moonshotai/kimi-k2-thinking',
    ]) {
      expect(supportsReasoning(m)).toBe(true);
    }
  });

  it('rejects non-thinking models and empty input', () => {
    for (const m of ['openai/gpt-4o-mini', 'gpt-4o-mini', 'x-ai/grok-3', '', null, undefined]) {
      expect(supportsReasoning(m)).toBe(false);
    }
  });
});

describe('reasoningBodyParams — the request contract', () => {
  it('engaged effort on a capable model over OpenRouter → explicit effort', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    expect(reasoningBodyParams('qwen/qwen3.7-plus', 'medium')).toEqual({
      reasoning: { effort: 'medium' },
    });
  });

  it("'none' on a capable model → EXPLICIT disable (hybrid models think by default)", () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    expect(reasoningBodyParams('qwen/qwen3.7-plus', 'none')).toEqual({
      reasoning: { enabled: false },
    });
  });

  it('incapable model → untouched request shape, even when effort is asked', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    expect(reasoningBodyParams('openai/gpt-4o-mini', 'high')).toEqual({});
  });

  it('no OpenRouter → untouched request shape (OpenAI-direct fallback path)', () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    expect(reasoningBodyParams('qwen/qwen3.7-plus', 'high')).toEqual({});
  });
});
