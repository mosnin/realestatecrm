/**
 * Behavioral coverage for lib/supabase-guard.ts's `unscoped()` helper — the
 * production-safe call site admin routes use to annotate an intentional
 * cross-tenant read/write (see CLAUDE.md's tenant-scoping non-negotiable).
 *
 * The critical property under test: `unscoped(builder, reason)` must be safe
 * to call REGARDLESS of whether the guard is currently wrapping the client.
 * `wrapGuard` is a no-op unless TENANT_GUARD=1 (lib/supabase.ts wraps the
 * shared `supabase` export against that same flag), so in most environments
 * `supabase.from('Table')` returns the REAL supabase-js builder, which has no
 * `.unscoped` method. If `unscoped()` called `.unscoped(reason)` unconditionally,
 * every admin route annotated with it would throw at runtime whenever
 * TENANT_GUARD is unset — an outage, not a safety net. These tests pin that
 * it degrades to a no-op passthrough instead, and that it still marks the
 * query compliant when the guard IS active — mirroring the existing
 * tests/lib/tenant-scope-guard.test.ts pattern (fake PostgREST-shaped chain
 * driven through wrapGuard).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMessageMock } = vi.hoisted(() => ({ captureMessageMock: vi.fn() }));
vi.mock('@/lib/observability', () => ({ captureMessage: captureMessageMock }));

import { wrapGuard, unscoped } from '@/lib/supabase-guard';

type Chain = {
  select: (c?: string) => Chain & Promise<unknown>;
  update: (v: unknown) => Chain & Promise<unknown>;
  delete: () => Chain & Promise<unknown>;
  insert: (v: unknown) => Chain & Promise<unknown>;
  eq: (c: string, v: string) => Chain & Promise<unknown>;
  in: (c: string, v: unknown) => Chain & Promise<unknown>;
};
type LooseClient = { from: (t: string) => Chain };

/** Same fake chainable builder as tests/lib/tenant-scope-guard.test.ts —
 *  resolves to `{ data, error }` when awaited, every filter method returns
 *  `this`. Deliberately has NO `.unscoped` method, matching the real
 *  supabase-js PostgrestFilterBuilder shape when the guard isn't wrapping it. */
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

afterEach(() => vi.unstubAllEnvs());

describe('unscoped() — guard disabled (TENANT_GUARD unset, the common case)', () => {
  beforeEach(() => {
    vi.stubEnv('TENANT_GUARD', '');
  });

  it('passes an unwrapped builder through unchanged instead of throwing', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    const builder = client.from('Contact');
    // The real supabase-js builder (and this no-op-wrapped fake) has no
    // `.unscoped` method — calling it directly would throw. unscoped() must
    // detect that and hand the builder back untouched.
    const result = unscoped(builder, 'admin cross-tenant: platform-wide sweep');
    expect(result).toBe(builder);
    await expect(result.select('id')).resolves.toEqual({ data: [], error: null });
  });

  it('never throws even though the underlying builder lacks .unscoped', () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    expect(() => unscoped(client.from('Contact'), 'reason')).not.toThrow();
  });
});

describe('unscoped() — guard active (TENANT_GUARD=1)', () => {
  beforeEach(() => {
    vi.stubEnv('TENANT_GUARD', '1');
    vi.stubEnv('NODE_ENV', 'test'); // hard-fail mode, so a real violation would throw
    captureMessageMock.mockReset();
  });

  it('marks an otherwise-unscoped select as compliant — the guard does not throw', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    const query = unscoped(client.from('Contact'), 'admin cross-tenant: bulk rescoring sweep');
    await expect(query.select('id')).resolves.toEqual({ data: [], error: null });
  });

  it('still throws on a genuinely unscoped, unannotated read — regression guard', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(client.from('Contact').select('id')).rejects.toThrow(/Unscoped tenant query/i);
  });

  it('still allows a normally-scoped read via .eq(spaceId, …) without needing unscoped()', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    await expect(
      client.from('Contact').select('id').eq('spaceId', 'space_1'),
    ).resolves.toEqual({ data: [], error: null });
  });

  it('marking one query unscoped does not blanket-exempt a separate unscoped query', async () => {
    const client = wrapGuard(makeFakeClient()) as unknown as LooseClient;
    // A prior unscoped() call on a DIFFERENT builder instance must not leak
    // "compliant" state onto an unrelated query.
    unscoped(client.from('Contact'), 'admin cross-tenant: reason');
    await expect(client.from('Contact').select('id')).rejects.toThrow(/Unscoped tenant query/i);
  });
});
