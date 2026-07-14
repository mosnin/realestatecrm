import { beforeEach, describe, expect, it, vi } from 'vitest';

const { afterMock, insertMock, fromMock, infoMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  insertMock: vi.fn(),
  fromMock: vi.fn(),
  infoMock: vi.fn(),
}));

vi.mock('next/server', () => ({ after: afterMock }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: infoMock, warn: vi.fn() },
}));

import { recordChatUsage } from '@/lib/usage/record-chat-usage';

beforeEach(() => {
  afterMock.mockReset();
  insertMock.mockReset().mockResolvedValue({ error: null });
  fromMock.mockReset().mockReturnValue({ insert: insertMock });
  infoMock.mockReset();
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
    expect(infoMock).toHaveBeenCalledWith(
      '[record-chat-usage] cost source',
      expect.objectContaining({ costSource: 'provider' }),
    );
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(afterMock.mock.calls[0]?.[0]).toBeTypeOf('function');
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
    expect(infoMock).toHaveBeenCalledWith(
      '[record-chat-usage] cost source',
      expect.objectContaining({ costSource: 'estimated' }),
    );
  });
});
