import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
vi.mock('server-only', () => ({}));
const { from, execute, lookup } = vi.hoisted(() => ({ from: vi.fn(), execute: vi.fn(), lookup: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from } }));
vi.mock('@/lib/ai-tools/registry', () => ({ getTool: lookup }));
vi.mock('@/lib/ai-tools/execute', () => ({ executeTool: execute }));
import { queryWorkforceCrm } from '@/lib/workforce/crm';
const principal = { actorId: 'user', kind: 'brokerage' as const, scopeId: 'brokerage-a', name: 'Synthetic brokerage', role: 'admin' as const };
const signal = new AbortController().signal;
beforeEach(() => { vi.clearAllMocks(); lookup.mockImplementation(name => ({ name, description: 'Synthetic query', requiresApproval: false, riskLevel: 'safe', parameters: z.object({}) })); });
describe('native CRM workforce boundary', () => {
  it('refuses mutations even if the central registry contains them', async () => {
    await expect(queryWorkforceCrm(principal, 'clerk-user', { operation: 'query', tool: 'send_email' }, signal)).rejects.toThrow('Unsupported');
    expect(from).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
  });
  it('does not execute a broker query without an explicit accessible CRM workspace', async () => {
    await expect(queryWorkforceCrm(principal, 'clerk-user', { operation: 'query', tool: 'list_contacts' }, signal)).rejects.toThrow('Select');
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); from.mockReturnValue(chain);
    await expect(queryWorkforceCrm(principal, 'clerk-user', { operation: 'query', tool: 'list_contacts', spaceId: 'foreign-space' }, signal)).rejects.toThrow('access unavailable');
    expect(chain.eq).toHaveBeenCalledWith('brokerageId', 'brokerage-a'); expect(execute).not.toHaveBeenCalled();
  });
  it('derives personal scope from verified authority instead of worker arguments', async () => {
    const space = { id: 'personal-a', slug: 'personal', name: 'Synthetic', ownerId: 'user' };
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: space, error: null }) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); from.mockReturnValue(chain); execute.mockResolvedValue({ ok: true });
    await queryWorkforceCrm({ ...principal, kind: 'personal', scopeId: 'personal-a', role: 'owner' }, 'clerk-user', { operation: 'query', tool: 'list_contacts', spaceId: 'victim', args: { limit: 5 } }, signal);
    expect(chain.eq).toHaveBeenCalledWith('id', 'personal-a'); expect(chain.eq).toHaveBeenCalledWith('ownerId', 'user');
    expect(execute).toHaveBeenCalledWith('list_contacts', { limit: 5 }, expect.objectContaining({ userId: 'clerk-user', space, signal }));
  });
  it('refuses a policy change that turns an allowed query into a mutation', async () => {
    lookup.mockReturnValue({ requiresApproval: true });
    await expect(queryWorkforceCrm(principal, 'clerk-user', { operation: 'catalog' }, signal)).rejects.toThrow('policy mismatch');
  });
});
