import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { rows, filters } = vi.hoisted(() => ({ rows: {} as Record<string, unknown>, filters: [] as unknown[][] }));
vi.mock('@/lib/api-auth', () => ({ isPremiumAccessBlocked: () => false }));
vi.mock('@/lib/billing/comp', () => ({ isAccountComped: async () => false }));
vi.mock('@/lib/supabase-guard', () => ({ unscoped: (query: unknown) => query }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => {
  const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([table, key, value]); return query; }, maybeSingle: async () => ({ data: rows[table], error: null }) };
  return query;
} } }));
import { resolveWorkforceScope } from '@/lib/workforce/scope';
beforeEach(() => { filters.length = 0; rows.User = { id: 'user-a', status: 'active' }; rows.Space = { id: 'space-a', slug: 'my-space', name: 'Synthetic', ownerId: 'user-a' }; rows.Brokerage = { id: 'brokerage-a', name: 'Synthetic brokerage', status: 'active' }; rows.BrokerageMembership = { role: 'broker_admin' }; });
describe('live Workforce scope resolution', () => {
  it('binds personal work to an owned CRM space', async () => {
    const scope = await resolveWorkforceScope('personal', 'my-space', 'clerk-a');
    expect(scope.principal).toMatchObject({ actorId: 'user-a', scopeId: 'space-a', role: 'owner' });
    expect(filters).toContainEqual(['Space', 'ownerId', 'user-a']); expect(filters).toContainEqual(['Space', 'slug', 'my-space']);
  });
  it('binds brokerage access to both the user and selected brokerage', async () => {
    const scope = await resolveWorkforceScope('brokerage', 'brokerage-a', 'clerk-a');
    expect(scope.principal).toMatchObject({ scopeId: 'brokerage-a', role: 'admin' });
    expect(filters).toContainEqual(['BrokerageMembership', 'userId', 'user-a']); expect(filters).toContainEqual(['BrokerageMembership', 'brokerageId', 'brokerage-a']);
  });
  it('does not give regular members the shared administrative computer', async () => {
    rows.BrokerageMembership = { role: 'realtor_member' };
    await expect(resolveWorkforceScope('brokerage', 'brokerage-a', 'clerk-a')).rejects.toThrow();
    rows.BrokerageMembership = null;
    await expect(resolveWorkforceScope('brokerage', 'brokerage-a', 'clerk-a')).rejects.toThrow();
  });
  it('revokes access for offboarded users, banned users and inactive brokerages', async () => {
    for (const user of [{ id: 'user-a', status: 'offboarded' }, { id: 'user-a', platformRole: 'banned' }]) {
      rows.User = user; await expect(resolveWorkforceScope('personal', 'my-space', 'clerk-a')).rejects.toThrow();
    }
    rows.User = { id: 'user-a', status: 'active' }; rows.Brokerage = { status: 'suspended' };
    await expect(resolveWorkforceScope('brokerage', 'brokerage-a', 'clerk-a')).rejects.toThrow();
  });
});
