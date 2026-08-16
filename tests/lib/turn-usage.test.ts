import { describe, expect, it } from 'vitest';
import { sumSdkTurnUsage } from '@/lib/ai-tools/turn-usage';

describe('sumSdkTurnUsage', () => {
  it('sums tokens and exact provider cost across model calls', () => {
    const usage = sumSdkTurnUsage({
      rawResponses: [
        {
          usage: {
            inputTokens: 10,
            outputTokens: 4,
            cost: 0.001,
            inputTokensDetails: { cached_tokens: 2 },
          },
        },
        {
          usage: {
            inputTokens: 5,
            outputTokens: 1,
            costUsd: 0.002,
          },
        },
      ],
    });
    expect(usage).toEqual({
      promptTokens: 15,
      completionTokens: 5,
      cachedTokens: 2,
      costUsd: 0.003,
    });
  });

  it('returns zeros when the provider reported nothing', () => {
    expect(sumSdkTurnUsage({})).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      costUsd: undefined,
    });
  });
});
