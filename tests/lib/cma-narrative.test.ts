/**
 * Behavioral tests for lib/cma-narrative.ts — composeCmaNarrative.
 *
 * Mocks getLLMClient (controls model output), recordChatUsage (billing
 * attribution), and hasLLMKey. No supabase involved — the function is pure
 * given a CmaPayload.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createMock, recordChatUsageMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  recordChatUsageMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/usage/record-chat-usage', () => ({
  recordChatUsage: recordChatUsageMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('@/lib/llm')>('@/lib/llm');
  return {
    ...actual,
    getLLMClient: () => ({ chat: { completions: { create: createMock } } }),
  };
});

import { composeCmaNarrative, CmaNarrativeError } from '@/lib/cma-narrative';
import type { CmaPayload } from '@/lib/cma-types';

const SPACE = 'space-1';

function basePayload(overrides: Partial<CmaPayload> = {}): CmaPayload {
  return {
    subject: {
      propertyId: null,
      address: '412 Elm St',
      city: 'Oakland',
      stateRegion: 'CA',
      beds: 3,
      baths: 2,
      squareFeet: 1450,
      propertyType: 'single_family',
      listPrice: 750000,
    },
    comps: [
      {
        id: 'comp-1',
        address: '410 Elm St',
        city: 'Oakland',
        beds: 3,
        baths: 2,
        squareFeet: 1400,
        price: 740000,
        priceBasis: 'sold',
        pricePerSqft: 528,
        listingStatus: 'sold',
        source: 'rentcast',
        distanceMiles: 0.2,
        daysOld: 30,
      },
    ],
    stats: {
      compCount: 4,
      pricedCount: 4,
      low: 700000,
      median: 740000,
      high: 780000,
      avgPricePerSqft: 520,
      suggestedLow: 720000,
      suggestedHigh: 760000,
      estimatedValue: 745000,
      basis: 'sold',
      insufficientData: false,
    },
    dataSource: 'rentcast',
    dataSourceReason: 'rentcast',
    generatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  };
}

function llmReply(content: string | null, usage?: Record<string, unknown>) {
  return {
    choices: content === null ? [] : [{ message: { content } }],
    usage: usage ?? { prompt_tokens: 300, completion_tokens: 180 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('OPENROUTER_API_KEY', 'or-test-key');
});

describe('composeCmaNarrative — insufficient data (honest UI)', () => {
  it('returns null and never calls the LLM when stats.insufficientData is true', async () => {
    const payload = basePayload({
      stats: {
        compCount: 1,
        pricedCount: 1,
        low: 500000,
        median: 500000,
        high: 500000,
        avgPricePerSqft: null,
        suggestedLow: null,
        suggestedHigh: null,
        estimatedValue: null,
        basis: 'none',
        insufficientData: true,
      },
    });

    const result = await composeCmaNarrative(payload, { spaceId: SPACE });

    expect(result).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
    expect(recordChatUsageMock).not.toHaveBeenCalled();
  });
});

describe('composeCmaNarrative — happy path', () => {
  it('returns the model narrative and records usage with the exact provider cost', async () => {
    const payload = basePayload();
    createMock.mockResolvedValue(
      llmReply(
        'The suggested range for 412 Elm St is $720,000 to $760,000.\n\nFour comparable homes support this range.\n\nThis is a strong number to list at.',
        { prompt_tokens: 300, completion_tokens: 180, cost: 0.0009 },
      ),
    );

    const result = await composeCmaNarrative(payload, {
      spaceId: SPACE,
      brandName: 'Acme Realty',
    });

    expect(result).toContain('412 Elm St');

    // Grounding: the facts handed to the model come only from the payload.
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe('openai/gpt-4.1-mini');
    expect(call.usage).toEqual({ include: true });
    const facts = JSON.parse(call.messages.at(-1).content);
    expect(facts.subjectAddress).toBe('412 Elm St');
    expect(facts.suggestedLow).toBe(720000);
    expect(facts.suggestedHigh).toBe(760000);
    expect(facts.compCount).toBe(4);
    expect(facts.preparedBy).toBe('Acme Realty');
    expect(facts.dataIsThin).toBe(false);

    // Billing attribution reached ChatUsage.
    expect(recordChatUsageMock).toHaveBeenCalledTimes(1);
    expect(recordChatUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: SPACE,
        model: 'openai/gpt-4.1-mini',
        promptTokens: 300,
        completionTokens: 180,
        costUsd: 0.0009,
        route: 'agent',
        runtime: 'ts',
      }),
    );
  });
});

describe('composeCmaNarrative — failure modes', () => {
  it('throws CmaNarrativeError when no LLM key is configured', async () => {
    // Explicitly blank BOTH keys instead of relying on the ambient env being
    // empty — CI exports OPENAI_API_KEY=placeholder workflow-wide, so
    // unstubAllEnvs() alone leaves hasLLMKey() true there (empty string is
    // falsy to hasLLMKey, so stubbing '' is the deterministic "no key").
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    const payload = basePayload();

    await expect(composeCmaNarrative(payload, { spaceId: SPACE })).rejects.toBeInstanceOf(
      CmaNarrativeError,
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws CmaNarrativeError on an empty model response', async () => {
    const payload = basePayload();
    createMock.mockResolvedValue(llmReply(null));

    await expect(composeCmaNarrative(payload, { spaceId: SPACE })).rejects.toBeInstanceOf(
      CmaNarrativeError,
    );
  });

  it('throws CmaNarrativeError when the provider call rejects', async () => {
    const payload = basePayload();
    createMock.mockRejectedValue(new Error('provider down'));

    await expect(composeCmaNarrative(payload, { spaceId: SPACE })).rejects.toBeInstanceOf(
      CmaNarrativeError,
    );
  });
});
