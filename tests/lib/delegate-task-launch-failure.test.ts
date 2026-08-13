import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  enqueueWorkerTask: vi.fn(),
  workerQueueConfigured: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/lib/queue', () => ({
  enqueueWorkerTask: mocks.enqueueWorkerTask,
  workerQueueConfigured: mocks.workerQueueConfigured,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createAndEnqueueSwarmRun } from '@/lib/swarm-launch';

describe('durable delegate_task swarm launch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MODAL_SWARM_URL = 'https://example--swarm.modal.run';
    process.env.AGENT_INTERNAL_SECRET = 'internal-secret';
    mocks.workerQueueConfigured.mockReturnValue(true);
    mocks.rpc.mockResolvedValue({ data: 'claimed', error: null });
    mocks.enqueueWorkerTask.mockResolvedValue(true);
    mocks.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      return chain;
    });
  });

  afterEach(() => {
    delete process.env.MODAL_SWARM_URL;
    delete process.env.AGENT_INTERNAL_SECRET;
  });

  it('commits one token, arms timeout first, then enqueues the same launch identity', async () => {
    const result = await createAndEnqueueSwarmRun({
      spaceId: 'space-1',
      goal: 'Research the listing market',
      conversationId: 'conversation-1',
    });

    expect(result.state).toBe('queued');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_claimed_swarm_run',
      expect.objectContaining({
        p_space_id: 'space-1',
        p_goal: 'Research the listing market',
        p_conversation_id: 'conversation-1',
        p_run_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        p_launch_token: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    );
    const [timeoutName, timeoutPayload, timeoutOptions] = mocks.enqueueWorkerTask.mock.calls[0];
    const [launchName, launchPayload] = mocks.enqueueWorkerTask.mock.calls[1];
    expect(timeoutName).toBe('swarm-run-timeout');
    expect(timeoutOptions).toEqual({ delaySeconds: 720 });
    expect(launchName).toBe('swarm-run-launch');
    expect(launchPayload).toEqual(timeoutPayload);
  });

  it('reports delivery unknown without terminal-failing when launch acceptance is ambiguous', async () => {
    mocks.enqueueWorkerTask
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(null);

    const result = await createAndEnqueueSwarmRun({
      spaceId: 'space-1',
      goal: 'Research the listing market',
    });

    expect(result.state).toBe('delivery_unknown');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('fails the unaccepted claim when timeout recovery cannot be armed', async () => {
    mocks.enqueueWorkerTask.mockResolvedValueOnce(null);
    mocks.rpc
      .mockResolvedValueOnce({ data: 'claimed', error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    const result = await createAndEnqueueSwarmRun({
      spaceId: 'space-1',
      goal: 'Research the listing market',
    });

    expect(result.state).toBe('unavailable');
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'fail_unaccepted_swarm_launch',
      expect.objectContaining({ p_space_id: 'space-1' }),
    );
    expect(mocks.enqueueWorkerTask).toHaveBeenCalledTimes(1);
  });

  it('replays the exact deterministic claim through the same token-fenced queue identity', async () => {
    const identity = {
      runId: '12060da9-b26e-47f0-8056-803441ab721b',
      launchToken: '95945bee-15a4-47ee-86ae-ccf23ac224b9',
    };
    mocks.rpc.mockResolvedValueOnce({ data: 'concurrent', error: null });
    mocks.from.mockImplementationOnce(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({
        data: {
          id: identity.runId,
          spaceId: 'space-1',
          conversationId: 'conversation-1',
          goal: 'Research the listing market',
          customAgentIds: [],
          launchToken: identity.launchToken,
          status: 'queued',
          modalAcceptedAt: null,
        },
        error: null,
      }));
      return chain;
    });

    const result = await createAndEnqueueSwarmRun({
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal: 'Research the listing market',
      idempotencyIdentity: identity,
    });

    expect(result).toMatchObject({ state: 'queued', reused: true, ...identity });
    expect(mocks.enqueueWorkerTask).toHaveBeenNthCalledWith(
      2,
      'swarm-run-launch',
      expect.objectContaining(identity),
    );
  });

  it('does not reuse a deterministic id when the stored payload differs', async () => {
    const identity = {
      runId: '12060da9-b26e-47f0-8056-803441ab721b',
      launchToken: '95945bee-15a4-47ee-86ae-ccf23ac224b9',
    };
    mocks.rpc.mockResolvedValueOnce({ data: 'concurrent', error: null });
    mocks.from.mockImplementationOnce(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({
        data: {
          id: identity.runId,
          spaceId: 'space-1',
          conversationId: 'conversation-1',
          goal: 'A different goal',
          customAgentIds: [],
          launchToken: identity.launchToken,
          status: 'queued',
          modalAcceptedAt: null,
        },
        error: null,
      }));
      return chain;
    });

    const result = await createAndEnqueueSwarmRun({
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal: 'Research the listing market',
      idempotencyIdentity: identity,
    });

    expect(result).toEqual({
      state: 'concurrent',
      error: 'Another specialist run is already active.',
    });
    expect(mocks.enqueueWorkerTask).not.toHaveBeenCalled();
  });

  it('returns a terminal deterministic replay without queueing it again', async () => {
    const identity = {
      runId: '12060da9-b26e-47f0-8056-803441ab721b',
      launchToken: '95945bee-15a4-47ee-86ae-ccf23ac224b9',
    };
    mocks.rpc.mockResolvedValueOnce({ data: 'concurrent', error: null });
    mocks.from.mockImplementationOnce(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({
        data: {
          id: identity.runId,
          spaceId: 'space-1',
          conversationId: 'conversation-1',
          goal: 'Research the listing market',
          customAgentIds: [],
          launchToken: identity.launchToken,
          status: 'completed',
          modalAcceptedAt: '2026-08-13T12:00:00.000Z',
        },
        error: null,
      }));
      return chain;
    });

    const result = await createAndEnqueueSwarmRun({
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal: 'Research the listing market',
      idempotencyIdentity: identity,
    });

    expect(result).toMatchObject({ state: 'already_exists', status: 'completed', reused: true });
    expect(mocks.enqueueWorkerTask).not.toHaveBeenCalled();
  });
});
