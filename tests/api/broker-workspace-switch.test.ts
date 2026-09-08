import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ clerkId: 'clerk-a' as string | null, role: 'broker_admin' as string | null, filters: [] as unknown[][] }));
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: state.clerkId }) }));
vi.mock('@/lib/supabase-guard', () => ({ unscoped: (q: unknown) => q }));
vi.mock('@/lib/supabase', () => ({ supabase: { from(table: string) {
  const query = { select: () => query, eq: (key: string, value: string) => { state.filters.push([table, key, value]); return query; }, maybeSingle: async () => ({ data: table === 'User' ? { id: 'user-a', status: 'active' } : state.role ? { role: state.role } : null, error: null }) };
  return query;
} } }));
import { GET } from '@/app/broker/switch/[id]/route';
const context = { params: Promise.resolve({ id: 'broker-b' }) };
beforeEach(() => { state.clerkId = 'clerk-a'; state.role = 'broker_admin'; state.filters.length = 0; });
describe('explicit brokerage switch route', () => {
  it('rechecks exact membership and sets the selected account before redirecting to People', async () => {
    const response = await GET(new Request('https://example.test/broker/switch/broker-b?next=%2Fbroker%2Fpeople'), context);
    expect(response.headers.get('location')).toBe('https://example.test/broker/people');
    expect(response.headers.get('set-cookie')).toContain('chippi-brokerage=broker-b');
    expect(state.filters).toContainEqual(['BrokerageMembership', 'userId', 'user-a']);
    expect(state.filters).toContainEqual(['BrokerageMembership', 'brokerageId', 'broker-b']);
  });
  it.each(['https://evil.test', '/broker/deals'])('does not redirect a regular member to %s', async next => {
    state.role = 'realtor_member';
    const response = await GET(new Request(`https://example.test/broker/switch/broker-b?next=${encodeURIComponent(next)}`), context);
    expect(response.headers.get('location')).toBe('https://example.test/broker');
  });
  it('cannot switch a removed membership', async () => {
    state.role = null;
    const response = await GET(new Request('https://example.test/broker/switch/broker-b'), context);
    expect(response.status).toBe(403); expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('does not change selection from prefetch or a cross-site request', async () => {
    for (const headers of [new Headers({ purpose: 'prefetch' }), new Headers({ 'sec-fetch-site': 'cross-site' })]) {
      const response = await GET(new Request('https://example.test/broker/switch/broker-b', { headers }), context);
      expect([204, 403]).toContain(response.status); expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(state.filters).toEqual([]);
  });
});
