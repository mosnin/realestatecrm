import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
import { queryWorkforceCrm, WORKFORCE_CRM_QUERIES } from '@/lib/workforce/crm';
describe('real CRM query catalog', () => {
  it('exports actual registered input schemas without granting writes', async () => {
    const catalog = await queryWorkforceCrm({ actorId: 'synthetic', kind: 'personal', scopeId: 'synthetic', name: 'Synthetic', role: 'owner' }, 'clerk-synthetic', { operation: 'catalog' }, new AbortController().signal);
    expect(catalog).toMatchObject({ tools: WORKFORCE_CRM_QUERIES.map(name => ({ name, parameters: expect.objectContaining({ type: 'object' }) })) });
  });
});
