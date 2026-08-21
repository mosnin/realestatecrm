/**
 * Tenant-scope guard — behavioral. A fake PostgREST-shaped builder is driven
 * through the guard; we assert it throws on an unscoped read of a tenant table
 * and stays silent when the query carries a scope filter, an .unscoped()
 * escape, or targets a non-tenant table.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMessageMock } = vi.hoisted(() => ({ captureMessageMock: vi.fn() }));
vi.mock('@/lib/observability', () => ({ captureMessage: captureMessageMock }));

import { wrapGuard } from '@/lib/supabase-guard';

// Loose builder view so the dynamic fake chains without per-method typing.
type Chain = {
  select: (c?: string) => Chain & Promise<unknown>;
  update: (v: unknown) => Chain & Promise<unknown>;
  delete: () => Chain & Promise<unknown>;
  insert: (v: unknown) => Chain & Promise<unknown>;
  eq: (c: string, v: string) => Chain & Promise<unknown>;
  in: (c: string, v: unknown) => Chain & Promise<unknown>;
  unscoped: (r: string) => Chain;
};
type LooseClient = { from: (t: string) => Chain };

/**
 * Minimal chainable builder that resolves to `{ data, error }` when awaited —
 * the same shape supabase-js exposes. Every filter method returns `this`.
 */
function makeFakeClient() {
  function builder() {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ['select', 'update', 'delete', 'insert', 'eq', 'in', 'or', 'order', 'limit', 'maybeSingle']) {
      b[m] = vi.fn(chain);
    }
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return b;
  }
  return { from: vi.fn(() => builder()) };
}

beforeEach(() => {
  captureMessageMock.mockReset();
  vi.stubEnv('TENANT_GUARD', '1');
  vi.stubEnv('NODE_ENV', 'test'); // hard-fail mode
});
afterEach(() => vi.unstubAllEnvs());

describe('wrapGuard', () => {
  it('throws on an unscoped select of a tenant table', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(client.from('Contact').select('id, name')).rejects.toThrow(/Unscoped tenant query/i);
  });

  it('allows a select scoped by spaceId', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(
      client.from('Contact').select('id').eq('spaceId', 'space_1'),
    ).resolves.toEqual({ data: [], error: null });
  });

  it('allows a brokerage table scoped by brokerageId', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(
      client.from('BrokerNotification').select('id').eq('brokerageId', 'bk_1'),
    ).resolves.toEqual({ data: [], error: null });
  });

  it('throws when a tenant table is scoped by the WRONG column', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    // BrokerNotification is brokerageId-scoped; an .eq('id', …) is not a scope.
    await expect(
      client.from('BrokerNotification').select('id').eq('id', 'x'),
    ).rejects.toThrow(/Unscoped tenant query/i);
  });

  it('respects the .unscoped() escape hatch', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(
      (client.from('Contact') as { unscoped: (r: string) => { select: (c: string) => Promise<unknown> } })
        .unscoped('post-fetch ownership check')
        .select('id'),
    ).resolves.toEqual({ data: [], error: null });
  });

  it('ignores non-tenant tables (User, Space)', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(client.from('User').select('id')).resolves.toEqual({ data: [], error: null });
    await expect(client.from('Space').select('id')).resolves.toEqual({ data: [], error: null });
  });

  it('does not flag inserts (tenant decided by payload, not filter)', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(
      client.from('Contact').insert({ spaceId: 'space_1', name: 'x' }),
    ).resolves.toEqual({ data: [], error: null });
  });

  it('is a no-op when TENANT_GUARD is unset', async () => {
    vi.stubEnv('TENANT_GUARD', '');
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(client.from('Contact').select('id')).resolves.toEqual({ data: [], error: null });
  });

  it('logs to Sentry instead of throwing outside dev/test', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(client.from('Deal').select('id')).resolves.toEqual({ data: [], error: null });
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringMatching(/Unscoped tenant query/i),
      'warning',
      expect.objectContaining({ table: 'Deal' }),
    );
  });

  it('throws in production when TENANT_GUARD_ENFORCE=1 (enforce-ready, not flipped in prod)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TENANT_GUARD', '1');
    vi.stubEnv('TENANT_GUARD_ENFORCE', '1');
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(client.from('Deal').select('id')).rejects.toThrow(/Unscoped tenant query/i);
  });

  it('stays observe-only in production when TENANT_GUARD_ENFORCE is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TENANT_GUARD', '1');
    vi.stubEnv('TENANT_GUARD_ENFORCE', '');
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(client.from('Contact').select('id')).resolves.toEqual({ data: [], error: null });
    expect(captureMessageMock).toHaveBeenCalled();
  });
});
