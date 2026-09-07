import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ results: [] as Array<{ count: number | null; error?: unknown }>, scopes: [] as unknown[], filters: [] as unknown[] }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: async () => ({ userId: 'user' }) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: async () => ({ id: 'space' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/tenant-db', () => ({ tenantTable: (_db: unknown, table: string, scope: unknown) => {
  state.scopes.push({ table, scope });
  const result = state.results.shift();
  const chain: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve) };
  for (const key of ['select','eq','in','gte','lt']) chain[key] = (...args: unknown[]) => { state.filters.push({ table, key, args }); return chain; };
  return chain;
} }));
import { GET } from '@/app/api/agent/health/route';
beforeEach(() => { state.scopes = []; state.filters = []; });
describe('workspace outcome metrics', () => {
  it('uses scoped durable sending and completion states', async () => {
    state.results = [4,2,1,3].map(count => ({ count }));
    const response = await GET();
    expect(await response.json()).toMatchObject({ sentMessages: 4, completedHandoffs: 2, failedRuns: 1, overdueCommitments: 3 });
    expect(state.scopes).toHaveLength(4);
    for (const value of state.scopes) expect(value).toMatchObject({ scope: { spaceId: 'space' } });
    expect(state.filters).toContainEqual({ table: 'ScheduledMessage', key: 'eq', args: ['status', 'sent'] });
    expect(state.filters).toContainEqual({ table: 'ClientCommitment', key: 'eq', args: ['status', 'completed'] });
  });
  it('does not turn unavailable counts into zero', async () => {
    state.results = [{ count: null, error: { message: 'offline' } }, { count: 0 }, { count: 0 }, { count: 0 }];
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty('error');
  });
});
