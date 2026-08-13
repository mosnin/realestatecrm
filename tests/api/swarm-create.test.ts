import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const settingsChain: any = {
    select: vi.fn(() => settingsChain),
    eq: vi.fn(() => settingsChain),
    maybeSingle: vi.fn(async () => ({ data: { dailyTokenBudget: 50_000 }, error: null })),
  };
  return {
    supabase: { from: vi.fn(() => settingsChain) },
    requireAuth: vi.fn(),
    getSpaceForUser: vi.fn(),
    assertSpaceEnabled: vi.fn(),
    checkRateLimit: vi.fn(),
    getTodayTokenUsage: vi.fn(),
    createAndEnqueueSwarmRun: vi.fn(),
    swarmLaunchConfigured: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ supabase: mocks.supabase }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: mocks.getSpaceForUser }));
vi.mock('@/lib/agent/kill-switch', () => ({ assertSpaceEnabled: mocks.assertSpaceEnabled }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/usage/today-token-usage', () => ({
  getTodayTokenUsage: mocks.getTodayTokenUsage,
}));
vi.mock('@/lib/swarm-launch', () => ({
  createAndEnqueueSwarmRun: mocks.createAndEnqueueSwarmRun,
  swarmLaunchConfigured: mocks.swarmLaunchConfigured,
}));

import { POST } from '@/app/api/swarm/route';

function request() {
  return new Request('https://example.test/api/swarm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spaceId: 'space-1', goal: 'Research the listing market' }),
  }) as never;
}

describe('POST /api/swarm durable launch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getSpaceForUser.mockResolvedValue({ id: 'space-1' });
    mocks.assertSpaceEnabled.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.getTodayTokenUsage.mockResolvedValue({ total: 0 });
    mocks.swarmLaunchConfigured.mockReturnValue(true);
    mocks.createAndEnqueueSwarmRun.mockResolvedValue({
      state: 'queued',
      runId: '12060da9-b26e-47f0-8056-803441ab721b',
      spaceId: 'space-1',
      launchToken: '95945bee-15a4-47ee-86ae-ccf23ac224b9',
    });
  });

  it('fails before creating a run when either durable rail is unconfigured', async () => {
    mocks.swarmLaunchConfigured.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.createAndEnqueueSwarmRun).not.toHaveBeenCalled();
  });

  it('returns the server-minted run id only after the durable queue accepts it', async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      swarmRunId: '12060da9-b26e-47f0-8056-803441ab721b',
      delivery: 'queued',
    });
    expect(mocks.createAndEnqueueSwarmRun).toHaveBeenCalledWith({
      spaceId: 'space-1',
      goal: 'Research the listing market',
      customAgentIds: [],
    });
  });

  it('truthfully reports an unknown launch delivery whose timeout is already armed', async () => {
    mocks.createAndEnqueueSwarmRun.mockResolvedValue({
      state: 'delivery_unknown',
      runId: '12060da9-b26e-47f0-8056-803441ab721b',
      spaceId: 'space-1',
      launchToken: '95945bee-15a4-47ee-86ae-ccf23ac224b9',
    });

    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      delivery: 'unconfirmed_recovery_armed',
    });
  });

  it('fails closed on a second active run in the same space', async () => {
    mocks.createAndEnqueueSwarmRun.mockResolvedValue({
      state: 'concurrent',
      error: 'Another specialist run is already active.',
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
  });
});
