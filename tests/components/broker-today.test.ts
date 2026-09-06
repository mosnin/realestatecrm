import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { queries, failing, context } = vi.hoisted(() => ({
  queries: [] as Array<{ table: string; filters: unknown[][] }>,
  failing: { table: '' },
  context: vi.fn(),
}));
vi.mock('@/lib/permissions', () => ({ getBrokerMemberContext: context }));
vi.mock('@/lib/brokerage-members', () => ({
  getBrokerageMembers: async () => [
    {
      userId: 'agent-1',
      User: { name: 'Maya', onboard: true },
      Space: { id: 'member-space' },
    },
  ],
}));
vi.mock('@/app/broker/member-dashboard', () => ({
  MemberDashboard: () => React.createElement('p', null, 'Member dashboard'),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, filters: [] as unknown[][] };
      queries.push(entry);
      const chain: Record<string, unknown> = {};
      for (const method of [
        'select',
        'eq',
        'in',
        'is',
        'not',
        'gt',
        'gte',
        'lte',
        'or',
        'contains',
        'order',
        'limit',
      ])
        chain[method] = (...args: unknown[]) => {
          entry.filters.push([method, ...args]);
          return chain;
        };
      const result = () => {
        if (failing.table === table)
          return { data: null, count: null, error: { message: 'unavailable' } };
        if (table === 'Space')
          return { data: { id: 'owner-space' }, error: null };
        if (table === 'AgentActivityLog')
          return {
            data: [
              {
                id: 'receipt',
                actionType: 'send_email',
                reasoning: 'Confirmed by the action receipt.',
              },
            ],
            error: null,
          };
        if (
          table === 'Contact' &&
          entry.filters.some((f) => f[0] === 'eq' && f[1] === 'brokerageId')
        )
          return {
            data: [{ id: 'lead', name: 'Alex', tags: ['brokerage-lead'] }],
            count: 9,
            error: null,
          };
        return { data: [], count: 0, error: null };
      };
      chain.maybeSingle = async () => result();
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve);
      return chain;
    },
  },
}));
import BrokerBriefPage from '@/app/broker/brief/page';
beforeEach(() => {
  queries.length = 0;
  failing.table = '';
  context.mockResolvedValue({
    membership: { role: 'owner' },
    brokerage: {
      id: 'broker-1',
      ownerId: 'owner-1',
      name: 'Oak Realty',
      slaFirstResponseMinutes: 15,
    },
  });
});
describe('Brokerage Today', () => {
  it('prioritizes exact ownership counts, real work and the team within the brokerage scope', async () => {
    const html = renderToStaticMarkup(await BrokerBriefPage());
    expect(html).toContain('9 leads need an owner');
    expect(html).toContain('Email sent');
    expect(html).toContain('Maya');
    expect(html).toContain('href="/broker/settings/auto-assignment"');
    expect(
      queries.find((q) => q.table === 'AgentActivityLog')?.filters,
    ).toContainEqual(['in', 'spaceId', ['member-space', 'owner-space']]);
    expect(
      queries
        .filter((q) => q.table === 'Contact')
        .every((q) =>
          q.filters.some(
            (f) =>
              ['eq', 'in'].includes(String(f[0])) &&
              ['spaceId', 'brokerageId'].includes(String(f[1])),
          ),
        ),
    ).toBe(true);
  });
  it('does not present failed contact queries as an empty lead queue', async () => {
    failing.table = 'Contact';
    const html = renderToStaticMarkup(await BrokerBriefPage());
    expect(html).toContain('Lead ownership could not be checked');
    expect(html).toContain('First responses could not be checked');
    expect(html).not.toContain('No unassigned leads');
    expect(html).toContain('Email sent');
  });
  it('keeps a member on their own dashboard without fetching team-wide data', async () => {
    context.mockResolvedValue({ membership: { role: 'realtor_member' } });
    expect(renderToStaticMarkup(await BrokerBriefPage())).toContain(
      'Member dashboard',
    );
    expect(queries).toHaveLength(0);
  });
});
