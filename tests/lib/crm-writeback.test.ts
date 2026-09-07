import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ write: vi.fn(), table: vi.fn(), discover: vi.fn(), stale: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (name: string) => name } }));
vi.mock('@/lib/supabase-guard', () => ({ unscoped: () => {
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => mocks.discover(), update: () => q, lt: () => mocks.stale() }; return q;
} }));
vi.mock('@/lib/tenant-db', () => ({ tenantTable: (...args: unknown[]) => mocks.table(...args) }));
vi.mock('@/lib/crypto', () => ({ decrypt: () => 'key' }));
vi.mock('@/lib/integrations/follow-up-boss', () => ({ writePersonNote: mocks.write }));
import { dispatchCrmWritebacks } from '@/lib/follow-through/crm-writeback';
const chain = (result: unknown) => { const q = { select: () => q, update: () => q, eq: () => q, maybeSingle: async () => result }; return q; };
const row = { id: 'r', spaceId: 'tenant', connectionId: 'conn', externalId: '1', body: 'Confirmed activity' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.discover.mockResolvedValue({ data: [row], error: null });
  mocks.stale.mockResolvedValue({ error: null });
  mocks.write.mockResolvedValue('note-1');
});
function setup({ claim = true, enabled = true, receipt = true } = {}) {
  let writes = 0;
  mocks.table.mockImplementation((_db, table) => {
    if (table === 'IntegrationConnection') return chain({ data: { secretCiphertext: 'encrypted' } });
    if (table === 'CrmContactLink') return chain({ data: enabled ? { id: 'link' } : null });
    writes++;
    return chain({ data: (writes === 1 ? claim : receipt) ? { id: 'r' } : null, error: null });
  });
}
describe('CRM write-back receipts', () => {
  it('only delivers claimed work with current link permission', async () => {
    setup();
    expect(await dispatchCrmWritebacks()).toEqual({ sent: 1, unconfirmed: 0, blocked: 0, unavailable: false });
    expect(mocks.write).toHaveBeenCalledWith('key', '1', row.body);
    for (const call of mocks.table.mock.calls) expect(call[2]).toEqual({ spaceId: 'tenant' });
  });
  it('does not deliver a claim won by another sender', async () => {
    setup({ claim: false }); await dispatchCrmWritebacks(); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('honors disabled write-back after enqueue', async () => {
    setup({ enabled: false }); expect((await dispatchCrmWritebacks()).blocked).toBe(1); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('leaves ambiguous delivery unconfirmed without retry', async () => {
    setup(); mocks.write.mockRejectedValue(new Error('Timeout'));
    expect((await dispatchCrmWritebacks()).unconfirmed).toBe(1); expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it('does not count delivery as durably sent if its receipt cannot be saved', async () => {
    setup({ receipt: false });
    expect(await dispatchCrmWritebacks()).toMatchObject({ sent: 0, unconfirmed: 1, unavailable: true });
  });
});
