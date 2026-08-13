import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    pendingTask: null as null | {
      status: string;
      launchToken: string | null;
      modalAcceptedAt: string | null;
      cancellationRequestedAt?: string | null;
    },
    pendingError: null as Error | null,
  };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: state.pendingTask,
      error: state.pendingError,
    })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    enqueue: vi.fn(),
    from: vi.fn(() => query),
    rpc: vi.fn(),
    send: vi.fn(),
    state,
    afterCallbacks: [] as Array<() => Promise<void>>,
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/queue', () => ({ enqueueWorkerTask: mocks.enqueue }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mocks.send } }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/storage', () => ({ getObjectText: vi.fn(), buildKey: vi.fn(), uploadObject: vi.fn() }));
vi.mock('@/lib/llm', () => ({ getLLMClient: vi.fn() }));
vi.mock('@/lib/chippi/workspace-run-flag', () => ({
  isWorkspaceRunRecoveryEnabled: () => false,
  isWorkspaceRunsEnabledForSpace: () => true,
}));
vi.mock('next/server', () => ({
  after: (callback: () => Promise<void>) => mocks.afterCallbacks.push(callback),
}));

import {
  failSilentAcceptedWorkspaceRunTask,
  dispatchWorkspaceRunTask,
  kickWorkspaceRunTask,
  markWorkspaceTaskTerminal,
  markWorkspaceTerminal,
  rearmRunningWorkspaceTaskTimeout,
  scheduleWorkspaceLaunchRecovery,
  scheduleWorkspaceTaskAcceptedSilenceTimeout,
  scheduleWorkspaceTaskRecovery,
} from '@/lib/workspace-runs/server';

const task = { taskId: 'task-1', runId: 'run-1', spaceId: 'space-1' };

beforeEach(() => {
  mocks.enqueue.mockReset();
  mocks.from.mockClear();
  mocks.rpc.mockReset();
  mocks.send.mockReset();
  mocks.afterCallbacks.length = 0;
  mocks.enqueue.mockResolvedValue(true);
  mocks.state.pendingTask = null;
  mocks.state.pendingError = null;
  delete process.env.WORKER_URL;
  delete process.env.WORKER_SECRET;
  delete process.env.INNGEST_EVENT_KEY;
  delete process.env.INNGEST_SIGNING_KEY;
});

describe('Workspace Run Cloudflare dispatch', () => {
  it('selects Cloudflare for task dispatch and does not send a second rail', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'worker-secret';

    await kickWorkspaceRunTask(task);

    expect(mocks.enqueue).toHaveBeenCalledWith('workspace-run-task', task);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it('fails closed when configured Cloudflare enqueue is rejected', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'worker-secret';
    process.env.INNGEST_EVENT_KEY = 'legacy-key';
    process.env.INNGEST_SIGNING_KEY = 'legacy-signing-key';
    mocks.enqueue.mockResolvedValue(null);

    await expect(kickWorkspaceRunTask(task)).rejects.toThrow(
      'Cloudflare queue did not accept workspace-run-task',
    );
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it('uses Inngest only when Cloudflare is not configured', async () => {
    process.env.INNGEST_EVENT_KEY = 'legacy-key';
    process.env.INNGEST_SIGNING_KEY = 'legacy-signing-key';

    await kickWorkspaceRunTask(task);

    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith({
      id: 'workspace-run-task:task-1',
      name: 'workspace-run-task/execute',
      data: task,
    });
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it('does not select Inngest when only its event key is configured', async () => {
    process.env.INNGEST_EVENT_KEY = 'legacy-key';

    await kickWorkspaceRunTask(task);

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(1);
  });

  it('uses request after() only when neither durable rail is configured', async () => {
    await kickWorkspaceRunTask(task);

    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(1);
  });

  it('schedules task lease recovery on Cloudflare with a bounded delay', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'worker-secret';

    await scheduleWorkspaceTaskRecovery('task-1', 'run-1', 'space-1', 'token-1');

    expect(mocks.enqueue).toHaveBeenCalledWith(
      'workspace-run-task-recovery',
      task,
      { delaySeconds: 125 },
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('schedules a token-fenced accepted-silence timeout after the launch lease window', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'worker-secret';

    await scheduleWorkspaceTaskAcceptedSilenceTimeout('task-1', 'space-1', 'token-1');

    expect(mocks.enqueue).toHaveBeenCalledWith(
      'workspace-run-task-accepted-silence-timeout',
      { taskId: 'task-1', spaceId: 'space-1', launchToken: 'token-1' },
      { delaySeconds: 330 },
    );
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it('repairs the timeout-send window after the accepted task has already started', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'worker-secret';
    const launchToken = '123e4567-e89b-42d3-a456-426614174000';
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    mocks.state.pendingTask = {
      status: 'running',
      launchToken,
      modalAcceptedAt: '2026-08-12T12:00:00.000Z',
    };

    await dispatchWorkspaceRunTask(task);

    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      'workspace-run-task-accepted-silence-timeout',
      { taskId: 'task-1', spaceId: 'space-1', launchToken },
      { delaySeconds: 330 },
    );
  });

  it('does not pretend a request-lifetime timer is a durable accepted-silence rail', async () => {
    await scheduleWorkspaceTaskAcceptedSilenceTimeout('task-1', 'space-1', 'token-1');

    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it('delegates timeout authority to the fixed token-fenced RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(failSilentAcceptedWorkspaceRunTask({
      taskId: 'task-1',
      spaceId: 'space-1',
      launchToken: 'token-1',
    })).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'fail_silent_accepted_workspace_run_task',
      {
        p_task_id: 'task-1',
        p_space_id: 'space-1',
        p_launch_token: 'token-1',
      },
    );

    const databaseError = new Error('database unavailable');
    mocks.rpc.mockResolvedValueOnce({ data: null, error: databaseError });
    await expect(failSilentAcceptedWorkspaceRunTask({
      taskId: 'task-1',
      spaceId: 'space-1',
      launchToken: 'token-1',
    })).rejects.toBe(databaseError);
  });

  it('rearms only the exact current running token on Cloudflare', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'worker-secret';
    const input = {
      taskId: 'task-1',
      spaceId: 'space-1',
      launchToken: '123e4567-e89b-42d3-a456-426614174000',
    };
    mocks.state.pendingTask = {
      status: 'running',
      launchToken: input.launchToken,
      modalAcceptedAt: '2026-08-12T12:00:00.000Z',
      cancellationRequestedAt: null,
    };

    await expect(rearmRunningWorkspaceTaskTimeout(input)).resolves.toBe(true);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      'workspace-run-task-accepted-silence-timeout',
      input,
      { delaySeconds: 330 },
    );

    mocks.enqueue.mockClear();
    mocks.state.pendingTask = { ...mocks.state.pendingTask, launchToken: 'replacement-token' };
    await expect(rearmRunningWorkspaceTaskTimeout(input)).resolves.toBe(false);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('fails closed if a running timeout needs rearming without Cloudflare', async () => {
    const input = {
      taskId: 'task-1',
      spaceId: 'space-1',
      launchToken: '123e4567-e89b-42d3-a456-426614174000',
    };
    mocks.state.pendingTask = {
      status: 'running',
      launchToken: input.launchToken,
      modalAcceptedAt: '2026-08-12T12:00:00.000Z',
      cancellationRequestedAt: null,
    };

    await expect(rearmRunningWorkspaceTaskTimeout(input)).rejects.toThrow(
      'Cloudflare queue is required',
    );
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('keeps failed terminal writes retryable for parent and continuation launches', async () => {
    const databaseError = new Error('terminal database unavailable');
    mocks.rpc.mockResolvedValue({ data: null, error: databaseError });

    await expect(markWorkspaceTaskTerminal({
      taskId: 'task-1',
      spaceId: 'space-1',
      launchToken: 'token-1',
    }, 'failed', 'runtime rejected')).rejects.toBe(databaseError);
    await expect(markWorkspaceTerminal({
      runId: 'run-1',
      workSessionId: 'session-1',
      spaceId: 'space-1',
      launchToken: 'token-1',
    }, 'failed', 'runtime rejected')).rejects.toBe(databaseError);
  });

  it('schedules parent launch recovery on Cloudflare without an Inngest duplicate', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'worker-secret';
    process.env.INNGEST_EVENT_KEY = 'legacy-key';
    process.env.INNGEST_SIGNING_KEY = 'legacy-signing-key';

    await scheduleWorkspaceLaunchRecovery('session-1', 'run-1', 'token-1');

    expect(mocks.enqueue).toHaveBeenCalledWith(
      'workspace-run-launch-recovery',
      { sessionId: 'session-1', workspaceRunId: 'run-1' },
      { delaySeconds: 125 },
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('retains delayed Inngest recovery as the explicit legacy fallback', async () => {
    process.env.INNGEST_EVENT_KEY = 'legacy-key';
    process.env.INNGEST_SIGNING_KEY = 'legacy-signing-key';

    await scheduleWorkspaceLaunchRecovery('session-1', 'run-1', 'token-1');

    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      id: 'workspace-launch-recovery:run-1:token-1',
      name: 'work-session/execute',
      data: { sessionId: 'session-1', workspaceRunId: 'run-1', reason: 'launch_lease_recovery' },
    }));
  });
});
