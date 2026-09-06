import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { compose, queries, workspace } = vi.hoisted(() => ({
  compose: vi.fn(),
  queries: [] as unknown[][],
  workspace: {
    data: { id: 'my-space', slug: 'maya' } as Record<string, unknown> | null,
    error: null as Record<string, unknown> | null,
  },
}));
vi.mock('@/lib/briefing/dashboard', () => ({ composeBriefDashboard: compose }));
vi.mock('@/components/chippi/brief-dashboard', () => ({
  BriefDashboard: ({ slug }: { slug: string }) =>
    React.createElement('p', null, `Daily desk: ${slug}`),
}));
vi.mock('@/lib/brokerage-members', () => ({
  getBrokerageMembers: async () => [
    { role: 'broker_owner', Space: { id: 'admin-space' } },
    { role: 'realtor_member', Space: { id: 'other-agent-space' } },
  ],
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'ilike', 'order', 'limit'])
        chain[method] = (...args: unknown[]) => {
          queries.push([table, method, ...args]);
          return chain;
        };
      chain.maybeSingle = async () => workspace;
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: [], error: null });
      return chain;
    },
  },
}));
import { MemberDashboard } from '@/app/broker/member-dashboard';
const ctx = {
  brokerage: { id: 'broker', name: 'Oak' },
  membership: { role: 'realtor_member' },
  dbUserId: 'my-user',
} as Parameters<typeof MemberDashboard>[0]['ctx'];
beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  workspace.data = { id: 'my-space', slug: 'maya' };
  workspace.error = null;
  compose.mockResolvedValue({});
});
describe('Member daily work', () => {
  it('uses the member workspace and limits announcements to the brokerage administrators', async () => {
    expect(renderToStaticMarkup(await MemberDashboard({ ctx }))).toContain(
      'Daily desk: maya',
    );
    expect(compose).toHaveBeenCalledWith('my-space', 'my-user');
    expect(queries).toContainEqual(['Space', 'eq', 'ownerId', 'my-user']);
    expect(queries).toContainEqual(['Note', 'in', 'spaceId', ['admin-space']]);
  });
  it('does not turn a failed workspace lookup into a setup instruction', async () => {
    workspace.error = { message: 'unavailable' };
    workspace.data = null;
    await expect(MemberDashboard({ ctx })).rejects.toThrow(
      'could not be loaded',
    );
    expect(compose).not.toHaveBeenCalled();
  });
});
