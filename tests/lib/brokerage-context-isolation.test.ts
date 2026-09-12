import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ selected: 'broker-a', cookie: 'broker-b', roleA: 'broker_admin', revoked: false, filters: [] as unknown[][] }));
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'clerk-a' }) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-chippi-brokerage': state.selected }), cookies: async () => ({ get: () => ({ value: state.cookie }) }) }));
vi.mock('@/lib/supabase-guard', () => ({ unscoped: (q: unknown) => q }));
vi.mock('@/lib/supabase', () => ({ supabase: { from(table: string) {
  const filters: Record<string, string> = {};
  let roles: string[] = [];
  const query = { select: () => query, eq: (key: string, value: string) => { filters[key] = value; state.filters.push([table,key,value]); return query; },
    in: (_key: string, values: string[]) => { roles=values; return query; },
    order: async () => ({ data: [...(!state.revoked ? [{ brokerageId:'broker-a',role:state.roleA }] : []), { brokerageId:'broker-b',role:'broker_owner' }].filter(m => table !== 'BrokerageMembership' || roles.includes(m.role)) }),
    maybeSingle: async () => ({ data: table === 'User' ? { id:'user-a',status:'active' } : { id:filters.id }, error:null }) };
  return query;
} } }));
import { getBrokerContext, getBrokerMemberContext } from '@/lib/permissions';
beforeEach(() => { state.selected='broker-a';state.cookie='broker-b';state.revoked=false;state.roleA='broker_admin';state.filters=[]; });
describe('brokerage authorization uses the request selection', () => {
  it.each([getBrokerContext, getBrokerMemberContext])('does not follow another tab’s cookie', async resolve => {
    const ctx = await resolve();
    expect(ctx?.brokerage.id).toBe('broker-a');
    expect(state.filters).toContainEqual(['Brokerage','id','broker-a']);
    expect(state.filters).not.toContainEqual(['Brokerage','id','broker-b']);
  });
  it.each([getBrokerContext, getBrokerMemberContext])('rejects revoked selection instead of using another valid membership', async resolve => {
    state.revoked=true;
    expect(await resolve()).toBeNull();
    expect(state.filters.some(f=>f[0]==='Brokerage')).toBe(false);
  });
  it('uses current roles after an admin is downgraded to member', async () => {
    state.roleA='realtor_member';
    expect(await getBrokerContext()).toBeNull();
    expect((await getBrokerMemberContext())?.brokerage.id).toBe('broker-a');
  });
  it('rejects unknown and missing request scope', async () => {
    state.selected='__unavailable_brokerage__';
    expect(await getBrokerContext()).toBeNull();
  });
});
