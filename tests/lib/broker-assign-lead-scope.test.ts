import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), notify: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/notify', () => ({ notifyNewLead: mocks.notify }));
import { assignLeadToRealtor } from '@/lib/broker-assign-lead';
const input = { brokerage: { id: 'b', ownerId: 'owner', name: 'Brokerage' }, assignedByUserId: 'admin', contactId: 'lead', realtorUserId: 'agent' };
beforeEach(() => vi.clearAllMocks());
describe('atomic assignment caller', () => {
  it('passes authenticated identity and tenant to the transaction', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, newContactId: 'copy', assignedToSpaceId: 'target', contact: { name: 'Alex' } } });
    expect(await assignLeadToRealtor(input)).toEqual({ ok: true, newContactId: 'copy', assignedToSpaceId: 'target' });
    expect(mocks.rpc).toHaveBeenCalledWith('assign_broker_lead', { p_brokerage_id: 'b', p_actor_id: 'admin', p_contact_id: 'lead', p_realtor_id: 'agent' });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate notices after a retry', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, replayed: true, newContactId: 'copy', assignedToSpaceId: 'target' } });
    expect((await assignLeadToRealtor(input)).ok).toBe(true);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('preserves a transaction rejection without notification', async () => {
    const rejection = { ok: false, error: 'Broker permission required', status: 403 };
    mocks.rpc.mockResolvedValue({ data: rejection });
    expect(await assignLeadToRealtor(input)).toEqual(rejection);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('fails closed when the migration is unavailable', async () => {
    mocks.rpc.mockResolvedValue({ error: new Error('function missing') });
    await expect(assignLeadToRealtor(input)).rejects.toThrow('function missing');
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
