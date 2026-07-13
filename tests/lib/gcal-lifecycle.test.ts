import { beforeEach, describe, expect, it, vi } from 'vitest';

const { afterMock, maybeSingleMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock('next/server', () => ({ after: afterMock }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
      })),
    })),
  },
}));
vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((value: string) => value),
  encrypt: vi.fn((value: string) => value),
  decryptOrPassthrough: vi.fn((value: string) => value),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { deleteGoogleEvent } from '@/lib/gcal-helpers';

beforeEach(() => {
  afterMock.mockReset();
  maybeSingleMock.mockReset();
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
});

describe('Google Calendar cleanup lifecycle', () => {
  it('registers the in-flight deletion with after()', async () => {
    await expect(
      deleteGoogleEvent({ spaceId: 'space_1', googleEventId: 'event_1' }),
    ).resolves.toBe(true);

    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(afterMock.mock.calls[0]?.[0]).toBeTypeOf('function');
  });
});
