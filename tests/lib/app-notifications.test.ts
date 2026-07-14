/**
 * Behavioral tests for lib/notifications.ts — createAppNotification, the
 * single creator of durable in-app notification records (the dashboard bell's
 * stored source). Executes the helper against a mocked Supabase client and
 * asserts on the write payloads.
 *
 * Contract under test:
 *   - Tenant scoping: the caller's spaceId is written verbatim on the row and
 *     the spacePath→slug lookup filters Space by that same spaceId.
 *   - Validation: missing spaceId/title → no write, returns false.
 *   - Length caps on title/body/href.
 *   - spacePath resolves to /s/<slug><spacePath>; a failed slug lookup still
 *     writes the record (href null).
 *   - NEVER throws: insert error or thrown DB error resolve to false.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── Supabase mock: capture inserts + eq filters; queue read terminals ───────
const state = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  eqCalls: [] as Array<{ table: string; column: string; value: unknown }>,
  spaceLookup: { data: null as unknown, error: null as unknown, reject: undefined as unknown },
  insertResult: { error: null as unknown, reject: undefined as unknown },
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((column: string, value: unknown) => {
      state.eqCalls.push({ table, column, value });
      return chain;
    });
    chain.maybeSingle = vi.fn(() => {
      if (state.spaceLookup.reject) return Promise.reject(state.spaceLookup.reject);
      return Promise.resolve({ data: state.spaceLookup.data, error: state.spaceLookup.error });
    });
    chain.insert = vi.fn((values: Record<string, unknown>) => {
      state.inserts.push({ table, values });
      if (state.insertResult.reject) return Promise.reject(state.insertResult.reject);
      return Promise.resolve({ error: state.insertResult.error });
    });
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import {
  createAppNotification,
  APP_NOTIFICATION_MAX_TITLE,
  APP_NOTIFICATION_MAX_BODY,
  APP_NOTIFICATION_MAX_HREF,
} from '@/lib/notifications';

beforeEach(() => {
  vi.clearAllMocks();
  state.inserts.length = 0;
  state.eqCalls.length = 0;
  state.spaceLookup = { data: { slug: 'acme' }, error: null, reject: undefined };
  state.insertResult = { error: null, reject: undefined };
});

describe('createAppNotification', () => {
  it('writes the row scoped to the given spaceId with the provided fields', async () => {
    const ok = await createAppNotification({
      spaceId: 'space_1',
      type: 'agent_run',
      title: 'Chippi finished a background task',
      body: 'Research the Henderson listing — completed',
      href: '/s/acme/swarm',
      priority: 'high',
    });

    expect(ok).toBe(true);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe('AppNotification');
    expect(state.inserts[0].values).toEqual({
      spaceId: 'space_1', // tenant scoping on the write
      type: 'agent_run',
      title: 'Chippi finished a background task',
      body: 'Research the Henderson listing — completed',
      href: '/s/acme/swarm',
      priority: 'high',
    });
    // href supplied directly — no Space lookup needed.
    expect(state.eqCalls).toHaveLength(0);
  });

  it('defaults body to empty, priority to medium, href to null', async () => {
    const ok = await createAppNotification({
      spaceId: 'space_1',
      type: 'work_session',
      title: 'Done',
    });
    expect(ok).toBe(true);
    expect(state.inserts[0].values).toMatchObject({
      body: '',
      priority: 'medium',
      href: null,
    });
  });

  it('resolves spacePath via a spaceId-scoped Space lookup (tenant scoping on the read)', async () => {
    const ok = await createAppNotification({
      spaceId: 'space_1',
      type: 'automation',
      title: 'Automation failed',
      spacePath: '/automations',
    });
    expect(ok).toBe(true);
    // The slug lookup must be filtered by the SAME spaceId — the .eq() IS the
    // security boundary under the service-role key.
    expect(state.eqCalls).toEqual([{ table: 'Space', column: 'id', value: 'space_1' }]);
    expect(state.inserts[0].values.href).toBe('/s/acme/automations');
  });

  it('still writes the record (href null) when the slug lookup misses', async () => {
    state.spaceLookup.data = null;
    const ok = await createAppNotification({
      spaceId: 'space_1',
      type: 'automation',
      title: 'Automation failed',
      spacePath: '/automations',
    });
    expect(ok).toBe(true);
    expect(state.inserts[0].values.href).toBeNull();
  });

  it('refuses to write without a spaceId or title', async () => {
    await expect(
      createAppNotification({ spaceId: '', type: 'agent_run', title: 'x' }),
    ).resolves.toBe(false);
    await expect(
      createAppNotification({ spaceId: 'space_1', type: 'agent_run', title: '   ' }),
    ).resolves.toBe(false);
    expect(state.inserts).toHaveLength(0);
  });

  it('caps title/body/href lengths instead of rejecting', async () => {
    await createAppNotification({
      spaceId: 'space_1',
      type: 'agent_run',
      title: 'T'.repeat(1000),
      body: 'B'.repeat(5000),
      href: `/x?${'q'.repeat(5000)}`,
    });
    const row = state.inserts[0].values as { title: string; body: string; href: string };
    expect(row.title).toHaveLength(APP_NOTIFICATION_MAX_TITLE);
    expect(row.body).toHaveLength(APP_NOTIFICATION_MAX_BODY);
    expect(row.href).toHaveLength(APP_NOTIFICATION_MAX_HREF);
  });

  it('never throws: an insert error resolves to false', async () => {
    state.insertResult.error = { message: 'relation "AppNotification" does not exist' };
    await expect(
      createAppNotification({ spaceId: 'space_1', type: 'agent_run', title: 'x' }),
    ).resolves.toBe(false);
  });

  it('never throws: a thrown DB error resolves to false', async () => {
    state.insertResult.reject = new Error('connection reset');
    await expect(
      createAppNotification({ spaceId: 'space_1', type: 'agent_run', title: 'x' }),
    ).resolves.toBe(false);
  });
});
