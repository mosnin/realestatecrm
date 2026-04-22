import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StoredPendingApproval } from '@/lib/ai-tools/pending-approvals';

// ── Fake Redis with in-memory storage + call recording ────────────────────
const store = new Map<string, { value: unknown; expiresAt: number | null }>();
const calls: Array<{ fn: string; args: unknown[] }> = [];

vi.mock('@/lib/redis', () => ({
  redis: {
    get: async (key: string) => {
      calls.push({ fn: 'get', args: [key] });
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt != null && entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set: async (key: string, value: unknown, opts?: { ex?: number }) => {
      calls.push({ fn: 'set', args: [key, value, opts] });
      const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : null;
      store.set(key, { value, expiresAt });
      return 'OK';
    },
    del: async (key: string) => {
      calls.push({ fn: 'del', args: [key] });
      const existed = store.delete(key);
      return existed ? 1 : 0;
    },
  },
}));

import {
  consumePendingApproval,
  peekPendingApproval,
  savePendingApproval,
} from '@/lib/ai-tools/pending-approvals';

function makeRecord(overrides: Partial<StoredPendingApproval> = {}): StoredPendingApproval {
  return {
    state: {
      requestId: 'req_abc',
      pending: { callId: 'c1', name: 'send_email', args: { to: 'a@b.com' } },
      remainingCalls: [],
      messages: [{ role: 'user', content: 'hi' }],
    },
    userId: 'user_1',
    spaceSlug: 'jane',
    conversationId: 'conv_1',
    createdAt: '2026-04-22T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
  calls.length = 0;
});

describe('savePendingApproval', () => {
  it('writes under the conventional key with a TTL', async () => {
    await savePendingApproval(makeRecord());
    const setCall = calls.find((c) => c.fn === 'set');
    expect(setCall).toBeDefined();
    expect(setCall!.args[0]).toBe('agent-task:pending:req_abc');
    // TTL is a positive number (actual value is an implementation detail).
    const opts = setCall!.args[2] as { ex?: number };
    expect(opts?.ex).toBeGreaterThan(0);
  });

  it('swallows storage errors so the caller does not crash', async () => {
    // Replace set with a throwing mock for this one call.
    const { redis } = (await import('@/lib/redis')) as { redis: { set: (...args: unknown[]) => Promise<string> } };
    const original = redis.set;
    redis.set = async () => {
      throw new Error('redis down');
    };
    try {
      await expect(savePendingApproval(makeRecord())).resolves.toBeUndefined();
    } finally {
      redis.set = original;
    }
  });
});

describe('consumePendingApproval', () => {
  it('returns the record and deletes it atomically', async () => {
    await savePendingApproval(makeRecord());
    const first = await consumePendingApproval('req_abc');
    expect(first).toMatchObject({
      userId: 'user_1',
      state: { requestId: 'req_abc' },
    });

    // Second consume sees nothing — the record is gone.
    const second = await consumePendingApproval('req_abc');
    expect(second).toBeNull();
  });

  it('returns null for an unknown requestId', async () => {
    const result = await consumePendingApproval('does-not-exist');
    expect(result).toBeNull();
  });
});

describe('peekPendingApproval', () => {
  it('returns the record without deleting it', async () => {
    await savePendingApproval(makeRecord());
    const peeked = await peekPendingApproval('req_abc');
    expect(peeked).toMatchObject({ userId: 'user_1' });
    // Still there — peek did not consume.
    const stillThere = await peekPendingApproval('req_abc');
    expect(stillThere).toBeTruthy();
  });
});
