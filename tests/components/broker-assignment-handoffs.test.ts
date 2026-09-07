import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const state = vi.hoisted(() => ({ filters: [] as unknown[], error: null as unknown }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => {
  const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => void) => Promise.resolve({ error: state.error, data: [{ id: '1', title: 'First response: Alex', status: 'open', dueAt: '2020-01-01T12:00:00Z', Space: { name: 'Alex agent' } }] }).then(resolve) };
  for (const key of ['select','eq','in','order','limit']) chain[key] = (...args: unknown[]) => { state.filters.push([key,args]); return chain; };
  return chain;
} } }));
vi.mock('@/lib/supabase-guard', () => ({ unscoped: (query: unknown) => query }));
import { AssignmentHandoffs } from '@/components/broker/assignment-handoffs';
describe('broker handoff visibility', () => {
  it('shows ownership, deadline and acceptance with a brokerage filter', async () => {
    state.error = null; state.filters = [];
    const html = renderToStaticMarkup(await AssignmentHandoffs({ brokerageId: 'b' }));
    expect(html).toContain('Alex agent');
    expect(html).toContain('Awaiting acceptance');
    expect(html).toContain('Overdue');
    expect(state.filters).toContainEqual(['eq', ['brokerageId', 'b']]);
  });
  it('does not disguise unavailable tracking as no open work', async () => {
    state.error = { message: 'migration unavailable' };
    const html = renderToStaticMarkup(await AssignmentHandoffs({ brokerageId: 'b' }));
    expect(html).toContain('Handoff tracking is unavailable');
    expect(html).not.toContain('No open tracked handoffs');
  });
});
