import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
  enqueue: vi.fn(),
  flags: {
    workspaceRecovery: false,
    workspaceSpaces: [] as string[],
    followUpSpaces: [] as string[],
  },
}));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mocks.send } }));
vi.mock('@/lib/queue', () => ({
  enqueueWorkerTask: mocks.enqueue,
  workerQueueConfigured: () => Boolean(
    process.env.WORKER_URL?.trim() && process.env.WORKER_SECRET?.trim(),
  ),
}));
vi.mock('@/lib/chippi/workspace-run-flag', () => ({
  isWorkspaceRunRecoveryEnabled: () => mocks.flags.workspaceRecovery,
  isWorkspaceRunsEnabledForSpace: (spaceId: string) =>
    mocks.flags.workspaceSpaces.includes(spaceId),
  workspaceRunEnabledSpaceIds: () => mocks.flags.workspaceSpaces,
  isWorkspaceRunTaskRecoveryEnabledForSpace: (spaceId: string) =>
    mocks.flags.followUpSpaces.includes(spaceId),
  workspaceRunTaskRecoveryEnabledSpaceIds: () => mocks.flags.followUpSpaces,
}));

import {
  parseResearchWorkSessionRecoveryCandidates,
  parseWorkspaceRunTaskRecoveryCandidates,
  reconcileResearchWorkSessions,
  reconcileWorkRecovery,
  reconcileWorkspaceRunTasks,
} from '@/lib/workspace-runs/recovery';

const researchPlan = {
  sessionId: 'session-plan',
  spaceId: 'space-research',
  kind: 'research',
  sessionStatus: 'planning',
  action: 'plan',
  recoveryKey: 'planning:1720000000',
  staleForSeconds: 601,
};

const queuedTask = {
  taskId: 'task-1',
  runId: 'run-1',
  spaceId: 'space-1',
  taskStatus: 'queued',
  runStatus: 'completed',
  launchToken: null,
  action: 'dispatch',
  staleBasis: 'updatedAt',
  recoveryKey: 'queued:1720000000',
  staleForSeconds: 121,
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.send.mockReset();
  mocks.enqueue.mockReset();
  mocks.flags.workspaceRecovery = false;
  mocks.flags.workspaceSpaces = [];
  mocks.flags.followUpSpaces = [];
  delete process.env.WORKER_URL;
  delete process.env.WORKER_SECRET;
  delete process.env.INNGEST_EVENT_KEY;
  delete process.env.INNGEST_SIGNING_KEY;
});

describe('periodic durable work recovery', () => {
  it('recovers ordinary research through Cloudflare even while Workspace Runs are off', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'worker-secret';
    mocks.enqueue.mockResolvedValue(true);
    mocks.rpc.mockResolvedValueOnce({
      data: [
        researchPlan,
        {
          ...researchPlan,
          sessionId: 'session-running',
          sessionStatus: 'running',
          action: 'advance',
          recoveryKey: 'running:1720000001',
          staleForSeconds: 912,
        },
      ],
      error: null,
    });

    await expect(reconcileWorkRecovery()).resolves.toEqual({
      rail: 'cloudflare',
      research: {
        scanned: 2,
        enqueued: 2,
        planning: 1,
        advancing: 1,
        maxStaleSeconds: 912,
      },
      workspaceRuns: expect.objectContaining({ enabled: false, scanned: 0, enqueued: 0 }),
      workspaceTasks: expect.objectContaining({ enabled: false, scanned: 0, enqueued: 0 }),
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      'list_research_work_session_recovery_candidates',
      { p_limit: 25 },
    );
    expect(mocks.enqueue).toHaveBeenNthCalledWith(
      1,
      'work-session-plan',
      { sessionId: 'session-plan' },
    );
    expect(mocks.enqueue).toHaveBeenNthCalledWith(
      2,
      'work-session-advance',
      { sessionId: 'session-running' },
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('uses stable Inngest recovery ids only when both legacy keys are configured', async () => {
    process.env.INNGEST_EVENT_KEY = 'event-key';
    process.env.INNGEST_SIGNING_KEY = 'signing-key';
    mocks.rpc.mockResolvedValueOnce({ data: [researchPlan], error: null });

    await expect(reconcileResearchWorkSessions()).resolves.toMatchObject({
      scanned: 1,
      enqueued: 1,
      planning: 1,
    });
    expect(mocks.send).toHaveBeenCalledWith({
      id: 'research-work-session-recovery:session-plan:planning:1720000000',
      name: 'work-session/plan',
      data: { sessionId: 'session-plan' },
    });

    mocks.rpc.mockReset();
    mocks.send.mockReset();
    delete process.env.INNGEST_SIGNING_KEY;
    await expect(reconcileWorkRecovery()).rejects.toThrow(
      'Durable recovery rail is not configured',
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('scans queued continuation tasks only for the enabled follow-up allowlist', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'worker-secret';
    mocks.flags.workspaceRecovery = true;
    mocks.flags.workspaceSpaces = ['space-1', 'space-2'];
    mocks.flags.followUpSpaces = ['space-1'];
    mocks.enqueue.mockResolvedValue(true);
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_research_work_session_recovery_candidates') {
        return { data: [], error: null };
      }
      if (name === 'list_workspace_run_recovery_candidates') {
        return { data: [], error: null };
      }
      if (name === 'list_workspace_run_task_recovery_candidates') {
        return {
          data: [queuedTask, { ...queuedTask, taskId: 'task-disabled', spaceId: 'space-2' }],
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    });

    const summary = await reconcileWorkRecovery();

    expect(summary.workspaceRuns).toMatchObject({ enabled: true, scanned: 0 });
    expect(summary.workspaceTasks).toEqual({
      enabled: true,
      scanned: 2,
      enqueued: 1,
      failedSilent: 0,
      featureDisabled: 1,
      maxStaleSeconds: 121,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'list_workspace_run_task_recovery_candidates',
      { p_limit: 25, p_space_ids: ['space-1'] },
    );
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(mocks.enqueue).toHaveBeenCalledWith('workspace-run-task', {
      taskId: 'task-1',
      runId: 'run-1',
      spaceId: 'space-1',
    });
  });

  it('validates each complete RPC batch before any recovery enqueue', async () => {
    expect(() => parseResearchWorkSessionRecoveryCandidates([
      researchPlan,
      { ...researchPlan, sessionId: 'session-bad', kind: 'workspace' },
    ])).toThrow(/Research recovery candidate/);
    expect(() => parseResearchWorkSessionRecoveryCandidates([
      researchPlan,
      { ...researchPlan },
    ])).toThrow(/duplicate/);
    expect(() => parseWorkspaceRunTaskRecoveryCandidates([
      queuedTask,
      { ...queuedTask, taskId: 'task-bad', runStatus: 'running' },
    ])).toThrow(/Workspace task recovery candidate/);

    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'worker-secret';
    mocks.flags.workspaceSpaces = ['space-1'];
    mocks.flags.followUpSpaces = ['space-1'];
    mocks.rpc.mockResolvedValueOnce({
      data: [queuedTask, { ...queuedTask, taskId: 'task-bad', staleForSeconds: 119 }],
      error: null,
    });

    await expect(reconcileWorkspaceRunTasks()).rejects.toThrow(
      /Workspace task recovery candidate/,
    );
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('backs up accepted task timeouts through the current launch-token fence', async () => {
    process.env.INNGEST_EVENT_KEY = 'event-key';
    process.env.INNGEST_SIGNING_KEY = 'signing-key';
    mocks.flags.workspaceSpaces = ['space-1'];
    mocks.flags.followUpSpaces = ['space-1'];
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          ...queuedTask,
          taskId: 'task-running',
          taskStatus: 'running',
          launchToken: '00000000-0000-4000-8000-000000000001',
          action: 'fail_accepted_silent',
          staleBasis: 'updatedAt',
          recoveryKey: 'running:00000000-0000-4000-8000-000000000001:1720000000',
          staleForSeconds: 301,
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });

    await expect(reconcileWorkspaceRunTasks()).resolves.toEqual({
      enabled: true,
      scanned: 1,
      enqueued: 0,
      failedSilent: 1,
      featureDisabled: 0,
      maxStaleSeconds: 301,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'fail_silent_accepted_workspace_run_task',
      {
        p_task_id: 'task-running',
        p_space_id: 'space-1',
        p_launch_token: '00000000-0000-4000-8000-000000000001',
      },
    );
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('binds launching silence to acceptance age and running timeout to activity age', () => {
    expect(() => parseWorkspaceRunTaskRecoveryCandidates([{
      ...queuedTask,
      taskStatus: 'launching',
      launchToken: '00000000-0000-4000-8000-000000000001',
      action: 'fail_accepted_silent',
      staleBasis: 'updatedAt',
      staleForSeconds: 301,
    }])).toThrow(/state\/action binding/);

    expect(() => parseWorkspaceRunTaskRecoveryCandidates([{
      ...queuedTask,
      taskStatus: 'running',
      launchToken: '00000000-0000-4000-8000-000000000001',
      action: 'fail_accepted_silent',
      staleBasis: 'modalAcceptedAt',
      staleForSeconds: 301,
    }])).toThrow(/state\/action binding/);
  });
});
