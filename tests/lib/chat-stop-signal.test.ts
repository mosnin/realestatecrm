/**
 * Stop-signal lifecycle.
 *
 * The stop flag carries a 10-minute TTL and is only ever read by a streaming
 * turn's poller. That combination meant a Stop which outlived its own turn —
 * tapped as the last tokens landed, or fired by the client on every send —
 * sat in Redis until the NEXT turn on that conversation consumed it and
 * aborted itself before a single token reached the browser. The realtor saw a
 * message go out and nothing come back.
 *
 * `clearChatStop` is what scopes a stop to the turn it was requested during;
 * every streaming entry point calls it before it starts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('@/lib/redis', () => ({
  isRedisConfigured: () => true,
  redis: {
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
    getdel: async (key: string) => {
      const v = store.get(key);
      store.delete(key);
      return v ?? null;
    },
  },
}));

import {
  requestChatStop,
  consumeChatStop,
  clearChatStop,
  createStopPoller,
} from '@/lib/chat/stop-signal';

beforeEach(() => {
  store.clear();
});

describe('stop signal', () => {
  it('a requested stop is visible to the turn that is running', async () => {
    await requestChatStop('conv-1');
    await expect(consumeChatStop('conv-1')).resolves.toBe(true);
  });

  it('consuming a stop clears it so it cannot fire twice', async () => {
    await requestChatStop('conv-1');
    await consumeChatStop('conv-1');
    await expect(consumeChatStop('conv-1')).resolves.toBe(false);
  });

  it('a stop left over from an earlier turn does not abort the next one', async () => {
    // The user tapped Stop as the previous turn was already finishing, so
    // nothing consumed the flag.
    await requestChatStop('conv-1');

    // A new turn starts — every streaming path clears first.
    await clearChatStop('conv-1');

    const shouldStop = createStopPoller('conv-1');
    await expect(shouldStop()).resolves.toBe(false);
  });

  it('still stops a turn when the flag is set during it', async () => {
    await clearChatStop('conv-1');
    const shouldStop = createStopPoller('conv-1');
    await expect(shouldStop()).resolves.toBe(false);

    await requestChatStop('conv-1');
    // The poller throttles to one Redis read per interval; jump past it.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
    await expect(shouldStop()).resolves.toBe(true);
    vi.restoreAllMocks();
  });

  it('a stop for one conversation never reaches another', async () => {
    await requestChatStop('conv-1');
    await clearChatStop('conv-2');
    await expect(consumeChatStop('conv-2')).resolves.toBe(false);
    await expect(consumeChatStop('conv-1')).resolves.toBe(true);
  });

  it('clearing is a no-op when nothing was requested', async () => {
    await expect(clearChatStop('conv-1')).resolves.toBeUndefined();
    await expect(consumeChatStop('conv-1')).resolves.toBe(false);
  });
});
