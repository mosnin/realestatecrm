import { beforeEach, describe, expect, it, vi } from 'vitest';
const { state } = vi.hoisted(() => ({ state: { selected: undefined as string | undefined, memberships: [] as Array<{ brokerageId: string; role: string }>, user: { id: 'user-a', status: 'active', platformRole: 'user' }, brokerageRead: '' } }));
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'clerk-a' }) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => state.selected ? { value: state.selected } : undefined }) }));
vi.mock('@/lib/supabase-guard', () => ({ unscoped: (query: unknown) => query }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => {
  let roles: string[] | undefined;
  const query = {
    select: () => query,
    eq: (key: string, value: string) => { if (table === 'Brokerage' && key === 'id') state.brokerageRead = value; return query; },
    in: (_: string, value: string[]) => { roles = value; return query; },
    order: async () => ({ data: state.memberships.filter(member => !roles || roles.includes(member.role)) }),
    maybeSingle: async () => ({ data: table === 'User' ? state.user : { id: state.brokerageRead } }),
  }; return query;
} } }));
import { getBrokerContext, getBrokerMemberContext } from '@/lib/permissions';
beforeEach(() => { state.selected = undefined; state.brokerageRead = ''; state.user = { id: 'user-a', status: 'active', platformRole: 'user' }; state.memberships = [{ brokerageId: 'admin-org', role: 'broker_admin' }, { brokerageId: 'owned-org', role: 'broker_owner' }, { brokerageId: 'member-org', role: 'realtor_member' }]; });
describe('explicit brokerage selection', () => {
  it('uses the selected authorized brokerage instead of silently preferring ownership elsewhere', async () => {
    state.selected = 'admin-org'; expect((await getBrokerContext())?.brokerage.id).toBe('admin-org');
  });
  it('refuses a removed or unknown selection without switching to a different organization', async () => {
    state.selected = 'removed-org'; expect(await getBrokerContext()).toBeNull(); expect(await getBrokerMemberContext()).toBeNull(); expect(state.brokerageRead).toBe('');
  });
  it('preserves the legacy deterministic default only when no workspace was selected', async () => {
    expect((await getBrokerContext())?.brokerage.id).toBe('owned-org');
  });
  it('does not turn a member selection into broker authority', async () => {
    state.selected = 'member-org'; expect(await getBrokerContext()).toBeNull(); expect((await getBrokerMemberContext())?.brokerage.id).toBe('member-org');
  });
  it('denies a banned or offboarded user even with a valid selection', async () => {
    state.selected = 'owned-org'; state.user.platformRole = 'banned'; expect(await getBrokerContext()).toBeNull();
    state.user.platformRole = 'user'; state.user.status = 'offboarded'; expect(await getBrokerMemberContext()).toBeNull();
  });
});
