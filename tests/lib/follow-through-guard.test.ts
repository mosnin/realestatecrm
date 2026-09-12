import { describe, expect, it, vi } from 'vitest';
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/tenant-db', () => ({ tenantTable: (_db: unknown, _table: unknown, scope: unknown) => { lookup(scope); const chain = { select: () => chain, eq: () => chain, maybeSingle: () => lookup() }; return chain; } }));
import { checkCoverageAction } from '@/lib/follow-through/guard';
import type { ToolContext } from '@/lib/ai-tools/types';
const ctx = (): ToolContext => ({ userId: 'u', space: { id: 's', slug: 's', name: 's', ownerId: 'u' }, signal: new AbortController().signal, followThroughScope: { contactId: 'c', workflowId: 'w', runId: 'r', channel: 'sms' } });
describe('Coverage execution bounds', () => {
  it('rejects changed contact or channel before querying a provider', async () => {
    lookup.mockClear();
    expect(await checkCoverageAction(ctx(), 'other', 'sms')).toMatch(/original contact/);
    expect(await checkCoverageAction(ctx(), 'c', 'email')).toMatch(/original contact/);
    expect(lookup).not.toHaveBeenCalled();
  });
  it('honors pause and unavailable policy reads', async () => {
    lookup.mockResolvedValue({ data: null, error: null });
    expect(await checkCoverageAction(ctx(), 'c', 'sms')).toMatch(/paused/);
    lookup.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect(await checkCoverageAction(ctx(), 'c', 'sms')).toMatch(/could not be checked/);
  });
  it('allows the original contact only with a current automatic policy', async () => {
    lookup.mockResolvedValue({ data: { id: 'w' }, error: null });
    expect(await checkCoverageAction(ctx(), 'c', 'sms')).toBeNull();
    expect(lookup).toHaveBeenCalledWith({ spaceId: 's' });
  });
});
