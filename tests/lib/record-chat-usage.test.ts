import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insertMock, fromMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn() },
}));

import { recordChatUsage } from '@/lib/usage/record-chat-usage';

beforeEach(() => {
  insertMock.mockReset().mockResolvedValue({ error: null });
  fromMock.mockReset().mockReturnValue({ insert: insertMock });
});

describe('recordChatUsage cost accounting', () => {
  it('prefers exact provider-reported cost over the fallback price table', async () => {
    await recordChatUsage({
      spaceId: 'space-1',
      model: 'qwen/qwen3.7-plus',
      promptTokens: 1_000,
      completionTokens: 500,
      costUsd: 0.004321,
      route: 'direct',
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: 0.004321 }),
    );
  });

  it('uses the current fallback rate when exact cost is absent', async () => {
    await recordChatUsage({
      spaceId: 'space-1',
      model: 'qwen/qwen3.7-plus',
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      route: 'direct',
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: 1.6 }),
    );
  });
});
