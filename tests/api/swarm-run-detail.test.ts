import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, supabase, requireAuthMock, getSpaceForUserMock } = vi.hoisted(() => {
  const state = {
    selects: [] as Array<{ table: string; fields: string }>,
    run: {
      id: 'run-1',
      spaceId: 'space-1',
      goal: 'Prepare a listing strategy',
      status: 'completed',
      plan: null,
      result: 'Combined answer',
      errorMessage: null,
      totalCostCents: 0,
      createdAt: '2026-07-29T12:00:00Z',
      completedAt: '2026-07-29T12:01:00Z',
    },
    members: [
      {
        id: 'member-1',
        swarmRunId: 'run-1',
        customAgentId: null,
        name: 'Pricing specialist',
        role: 'Pricing',
        task: 'Analyze comps',
        status: 'completed',
        output: 'Price near $500k',
        wave: 1,
        costCents: 0,
        startedAt: '2026-07-29T12:00:10Z',
        completedAt: '2026-07-29T12:00:30Z',
        createdAt: '2026-07-29T12:00:05Z',
      },
    ],
  };

  function chainFor(table: string): any {
    const chain: any = {
      select: vi.fn((fields: string) => {
        state.selects.push({ table, fields });
        return chain;
      }),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: state.run, error: null })),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: state.members, error: null }).then(resolve),
    };
    return chain;
  }

  return {
    state,
    supabase: { from: vi.fn((table: string) => chainFor(table)) },
    requireAuthMock: vi.fn(),
    getSpaceForUserMock: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({ supabase }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: getSpaceForUserMock }));

import { GET } from '@/app/api/swarm/[runId]/route';

describe('GET /api/swarm/[runId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.selects.length = 0;
    requireAuthMock.mockResolvedValue({ userId: 'user-1' });
    getSpaceForUserMock.mockResolvedValue({ id: 'space-1' });
  });

  it('hydrates terminal specialist results while excluding private system prompts', async () => {
    const response = await GET(
      new Request('https://example.test/api/swarm/run-1') as never,
      { params: Promise.resolve({ runId: 'run-1' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      run: { status: 'completed', result: 'Combined answer' },
      members: [{ name: 'Pricing specialist', output: 'Price near $500k' }],
    });
    const memberProjection = state.selects.find((entry) => entry.table === 'SwarmMember')?.fields;
    expect(memberProjection).toContain('task');
    expect(memberProjection).toContain('output');
    expect(memberProjection).not.toContain('systemPrompt');
  });
});
