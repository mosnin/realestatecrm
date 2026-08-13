/**
 * The work-session task handlers behind /api/worker/execute: one step per
 * queued job, self-chaining while work remains, and the never-strand inline
 * fallback when re-enqueue fails.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

const engine = vi.hoisted(() => ({
  planSession: vi.fn(),
  executeSession: vi.fn(async () => {}),
  advanceSession: vi.fn(),
}));
vi.mock('@/lib/work-sessions/engine', () => engine);

const actions = vi.hoisted(() => ({ executeApprovedWorkSessionAction: vi.fn() }));
vi.mock('@/lib/work-sessions/actions', () => actions);

const enqueueMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queue', () => ({ enqueueWorkerTask: enqueueMock }));

const workspace = vi.hoisted(() => ({
  dispatchWorkspaceRunTask: vi.fn(),
  failSilentAcceptedWorkspaceRunTask: vi.fn(),
  rearmRunningWorkspaceTaskTimeout: vi.fn(),
}));
vi.mock('@/lib/workspace-runs/server', () => workspace);

import { WORKER_TASKS } from '@/lib/jobs/tasks';

beforeEach(() => {
  engine.planSession.mockReset();
  engine.executeSession.mockClear();
  engine.advanceSession.mockReset();
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue(true);
  workspace.dispatchWorkspaceRunTask.mockReset();
  workspace.failSilentAcceptedWorkspaceRunTask.mockReset();
  workspace.failSilentAcceptedWorkspaceRunTask.mockResolvedValue(false);
  workspace.rearmRunningWorkspaceTaskTimeout.mockReset();
  workspace.rearmRunningWorkspaceTaskTimeout.mockResolvedValue(false);
  actions.executeApprovedWorkSessionAction.mockReset();
  actions.executeApprovedWorkSessionAction.mockResolvedValue({ status: 'not_claimed', attempts: 0 });
  delete process.env.WORKER_URL;
  delete process.env.WORKER_SECRET;
});

describe('work-session-plan task', () => {
  it('plan lands in running → chains one advance job', async () => {
    engine.planSession.mockResolvedValue('running');
    const out = await WORKER_TASKS['work-session-plan']({ sessionId: 'ws1' });
    expect(enqueueMock).toHaveBeenCalledWith('work-session-advance', { sessionId: 'ws1' });
    expect(out).toEqual({ sessionId: 'ws1', status: 'running', chained: true });
    expect(engine.executeSession).not.toHaveBeenCalled();
  });

  it('plan lands in awaiting_approval → no execution chained', async () => {
    engine.planSession.mockResolvedValue('awaiting_approval');
    const out = await WORKER_TASKS['work-session-plan']({ sessionId: 'ws1' });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(out).toEqual({ sessionId: 'ws1', status: 'awaiting_approval' });
  });

  it('re-enqueue failure without a configured worker → finishes inline', async () => {
    engine.planSession.mockResolvedValue('running');
    enqueueMock.mockResolvedValue(null);
    await WORKER_TASKS['work-session-plan']({ sessionId: 'ws1' });
    expect(engine.executeSession).toHaveBeenCalledWith('ws1');
  });

  it('configured worker re-enqueue failure throws for queue retry and never runs inline', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'secret';
    engine.planSession.mockResolvedValue('running');
    enqueueMock.mockResolvedValue(null);
    await expect(WORKER_TASKS['work-session-plan']({ sessionId: 'ws1' })).rejects.toThrow(
      'Cloudflare queue did not accept work-session-advance',
    );
    expect(engine.executeSession).not.toHaveBeenCalled();
  });

  it('preserves the expected workspace run id through plan chaining', async () => {
    engine.planSession.mockResolvedValue('running');
    await WORKER_TASKS['work-session-plan']({ sessionId: 'ws1', workspaceRunId: 'run1' });
    expect(engine.planSession).toHaveBeenCalledWith('ws1', 'run1');
    expect(enqueueMock).toHaveBeenCalledWith('work-session-advance', { sessionId: 'ws1', workspaceRunId: 'run1' });
  });

  it('rejects a payload without a sessionId', async () => {
    await expect(WORKER_TASKS['work-session-plan']({})).rejects.toThrow(/sessionId/);
  });
});

describe('work-session-advance task', () => {
  it('more steps remain → re-enqueues itself (one step per job)', async () => {
    engine.advanceSession.mockResolvedValue('more');
    const out = await WORKER_TASKS['work-session-advance']({ sessionId: 'ws1' });
    expect(engine.advanceSession).toHaveBeenCalledWith('ws1');
    expect(enqueueMock).toHaveBeenCalledWith('work-session-advance', { sessionId: 'ws1' });
    expect(out).toEqual({ sessionId: 'ws1', progress: 'more', chained: true });
  });

  it('done → chain ends quietly', async () => {
    engine.advanceSession.mockResolvedValue('done');
    const out = await WORKER_TASKS['work-session-advance']({ sessionId: 'ws1' });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(out).toEqual({ sessionId: 'ws1', progress: 'done' });
  });

  it('re-enqueue failure mid-run without a configured worker → inline continuation', async () => {
    engine.advanceSession.mockResolvedValue('more');
    enqueueMock.mockResolvedValue(null);
    await WORKER_TASKS['work-session-advance']({ sessionId: 'ws1' });
    expect(engine.executeSession).toHaveBeenCalledWith('ws1');
  });

  it('configured worker re-enqueue failure mid-run throws and never continues inline', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'secret';
    engine.advanceSession.mockResolvedValue('more');
    enqueueMock.mockResolvedValue(null);
    await expect(WORKER_TASKS['work-session-advance']({ sessionId: 'ws1' })).rejects.toThrow(
      'Cloudflare queue did not accept work-session-advance',
    );
    expect(engine.executeSession).not.toHaveBeenCalled();
  });

  it('preserves the expected workspace run id through advance chaining', async () => {
    engine.advanceSession.mockResolvedValue('more');
    await WORKER_TASKS['work-session-advance']({ sessionId: 'ws1', workspaceRunId: 'run1' });
    expect(engine.advanceSession).toHaveBeenCalledWith('ws1', 'run1');
    expect(enqueueMock).toHaveBeenCalledWith('work-session-advance', { sessionId: 'ws1', workspaceRunId: 'run1' });
  });

  it('dispatches workspace tasks only after strict identifier validation', async () => {
    await WORKER_TASKS['workspace-run-task']({ taskId: 'task1', runId: 'run1', spaceId: 'space1' });
    expect(workspace.dispatchWorkspaceRunTask).toHaveBeenCalledWith({ taskId: 'task1', runId: 'run1', spaceId: 'space1' });
    await expect(WORKER_TASKS['workspace-run-task']({ taskId: 'task1', runId: 'run1', spaceId: 'space1', extra: true })).rejects.toThrow(/not allowed/);
    await expect(WORKER_TASKS['workspace-run-task']({ taskId: 'task1', runId: 'run1' })).rejects.toThrow(/spaceId/);
    expect(workspace.dispatchWorkspaceRunTask).toHaveBeenCalledTimes(1);
  });

  it('checks accepted-silent task launches only after strict token validation', async () => {
    workspace.failSilentAcceptedWorkspaceRunTask.mockResolvedValue(true);
    const payload = {
      taskId: 'task1',
      spaceId: 'space1',
      launchToken: '123e4567-e89b-42d3-a456-426614174000',
    };

    await expect(
      WORKER_TASKS['workspace-run-task-accepted-silence-timeout'](payload),
    ).resolves.toEqual({ ...payload, failed: true, rearmed: false });
    expect(workspace.failSilentAcceptedWorkspaceRunTask).toHaveBeenCalledWith(payload);
    expect(workspace.rearmRunningWorkspaceTaskTimeout).not.toHaveBeenCalled();

    await expect(
      WORKER_TASKS['workspace-run-task-accepted-silence-timeout']({ ...payload, extra: true }),
    ).rejects.toThrow(/not allowed/);
    await expect(
      WORKER_TASKS['workspace-run-task-accepted-silence-timeout']({ taskId: 'task1', spaceId: 'space1' }),
    ).rejects.toThrow(/launchToken/);
    await expect(
      WORKER_TASKS['workspace-run-task-accepted-silence-timeout']({ ...payload, launchToken: ' token1' }),
    ).rejects.toThrow(/launchToken/);
    await expect(
      WORKER_TASKS['workspace-run-task-accepted-silence-timeout']({ ...payload, launchToken: 'not-a-uuid' }),
    ).rejects.toThrow(/UUID/);
    await expect(
      WORKER_TASKS['workspace-run-task-accepted-silence-timeout']({ ...payload, taskId: 'x'.repeat(129) }),
    ).rejects.toThrow(/too long/);
    expect(workspace.failSilentAcceptedWorkspaceRunTask).toHaveBeenCalledTimes(1);
  });

  it('rearms a late-started running task when the first timeout wake is too early', async () => {
    const payload = {
      taskId: 'task1',
      spaceId: 'space1',
      launchToken: '123e4567-e89b-42d3-a456-426614174000',
    };
    workspace.failSilentAcceptedWorkspaceRunTask.mockResolvedValue(false);
    workspace.rearmRunningWorkspaceTaskTimeout.mockResolvedValue(true);

    await expect(
      WORKER_TASKS['workspace-run-task-accepted-silence-timeout'](payload),
    ).resolves.toEqual({ ...payload, failed: false, rearmed: true });
    expect(workspace.rearmRunningWorkspaceTaskTimeout).toHaveBeenCalledWith(payload);
  });

  it('validates delayed parent launch recovery payloads and preserves its run guard', async () => {
    engine.advanceSession.mockResolvedValue('done');
    const out = await WORKER_TASKS['workspace-run-launch-recovery']({ sessionId: 'ws1', workspaceRunId: 'run1' });
    expect(engine.advanceSession).toHaveBeenCalledWith('ws1', 'run1');
    expect(out).toEqual({ sessionId: 'ws1', workspaceRunId: 'run1', progress: 'done' });
    await expect(WORKER_TASKS['workspace-run-launch-recovery']({ sessionId: 'ws1', workspaceRunId: '' })).rejects.toThrow(/workspaceRunId/);
  });
});

describe('work-session-action-execute task', () => {
  it('enters the leased executor only after strict tenant payload validation', async () => {
    actions.executeApprovedWorkSessionAction.mockResolvedValue({ status: 'executed', attempts: 1 });
    const payload = { sessionId: 'ws1', actionId: 'action1', spaceId: 'space1' };

    await expect(WORKER_TASKS['work-session-action-execute'](payload)).resolves.toEqual({
      status: 'executed', attempts: 1,
    });
    expect(actions.executeApprovedWorkSessionAction).toHaveBeenCalledWith(payload);
    await expect(WORKER_TASKS['work-session-action-execute']({ ...payload, extra: true }))
      .rejects.toThrow(/not allowed/);
    await expect(WORKER_TASKS['work-session-action-execute']({ sessionId: 'ws1', actionId: 'action1' }))
      .rejects.toThrow(/spaceId/);
    await expect(WORKER_TASKS['work-session-action-execute']({ ...payload, actionId: 'x'.repeat(201) }))
      .rejects.toThrow(/too long/);
    expect(actions.executeApprovedWorkSessionAction).toHaveBeenCalledTimes(1);
  });
});
