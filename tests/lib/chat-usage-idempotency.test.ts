/**
 * ChatUsage billing idempotency.
 *
 * An AFTER INSERT trigger debits credits per ChatUsage row, so a re-persisted
 * turn charges the customer twice. These pin the guard: a keyed write
 * upserts-ignore against (spaceId, idempotencyKey); an unkeyed write keeps the
 * original plain-insert behavior.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  upserts: [] as { row: Record<string, unknown>; opts: Record<string, unknown> }[],
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        calls.inserts.push(row);
        return { error: null };
      },
      upsert: async (row: Record<string, unknown>, opts: Record<string, unknown>) => {
        calls.upserts.push({ row, opts });
        return { error: null };
      },
    }),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { recordChatUsage } from '@/lib/usage/record-chat-usage';

const base = {
  spaceId: 'sp_1',
  model: 'anthropic/claude-opus-4.7',
  promptTokens: 100,
  completionTokens: 50,
  route: 'direct' as const,
};

beforeEach(() => {
  calls.inserts.length = 0;
  calls.upserts.length = 0;
});

describe('recordChatUsage idempotency', () => {
  it('a keyed turn upserts-ignore so a replay cannot double-charge', async () => {
    await recordChatUsage({ ...base, idempotencyKey: 'conv1:turn7' });
    expect(calls.upserts).toHaveLength(1);
    expect(calls.inserts).toHaveLength(0);
    expect(calls.upserts[0].row.idempotencyKey).toBe('conv1:turn7');
    // Scoped by spaceId so a key can't collide across tenants.
    expect(calls.upserts[0].opts).toMatchObject({
      onConflict: 'spaceId,idempotencyKey',
      ignoreDuplicates: true,
    });
  });

  it('an unkeyed turn keeps the plain insert (unchanged behavior)', async () => {
    await recordChatUsage({ ...base });
    expect(calls.inserts).toHaveLength(1);
    expect(calls.upserts).toHaveLength(0);
    expect(calls.inserts[0]).not.toHaveProperty('idempotencyKey');
  });

  it('still records the usage figures the credit trigger bills from', async () => {
    await recordChatUsage({ ...base, idempotencyKey: 'k1', costUsd: 0.42 });
    expect(calls.upserts[0].row).toMatchObject({
      spaceId: 'sp_1',
      promptTokens: 100,
      completionTokens: 50,
      costUsd: 0.42,
    });
  });
});
