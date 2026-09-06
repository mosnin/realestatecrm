import { beforeEach, describe, expect, it, vi } from 'vitest';
const { failure } = vi.hoisted(() => ({ failure: { table: '' } }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order']) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: failure.table === table ? null : table === 'BrokerageMembership' ? [{ id: 'membership', userId: 'owner', role: 'broker_owner' }] : [], error: failure.table === table ? { message: 'unavailable' } : null });
  return chain;
} } }));
import { getBrokerageMembers } from '@/lib/brokerage-members';
beforeEach(() => { failure.table = ''; });
describe('Team availability on Today', () => {
  it.each(['BrokerageMembership', 'User', 'Space'])('does not turn failed %s reads into an empty team', async table => {
    failure.table = table;
    await expect(getBrokerageMembers('broker-1', { strict: true })).rejects.toThrow('unavailable');
  });
});
