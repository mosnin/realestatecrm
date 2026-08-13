import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, send, enqueueWorkerTask, flags } = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
  enqueueWorkerTask: vi.fn(),
  flags: { enabledSpaceIds: ['space-1'] as string[] },
}));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send } }));
vi.mock('@/lib/queue', () => ({
  enqueueWorkerTask,
  workerQueueConfigured: () => Boolean(process.env.WORKER_URL && process.env.WORKER_SECRET),
}));
vi.mock('@/lib/chippi/workspace-run-flag', () => ({
  isWorkspaceRunRecoveryEnabled: () => false,
  isWorkspaceRunTaskRecoveryEnabledForSpace: () => false,
  isWorkspaceRunsEnabledForSpace: (spaceId: string) => flags.enabledSpaceIds.includes(spaceId),
  workspaceRunEnabledSpaceIds: () => flags.enabledSpaceIds,
  workspaceRunTaskRecoveryEnabledSpaceIds: () => [],
}));

import { workspaceLaunchMessage } from '@/lib/workspace-runs/presentation';
import { reconcileWorkspaceRunLaunches } from '@/lib/workspace-runs/recovery';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('durable Workspace launch recovery', () => {
  beforeEach(() => {
    rpc.mockReset();
    send.mockReset();
    enqueueWorkerTask.mockReset();
    delete process.env.WORKER_URL;
    delete process.env.WORKER_SECRET;
    process.env.INNGEST_EVENT_KEY = 'legacy-event';
    process.env.INNGEST_SIGNING_KEY = 'legacy-signing';
    flags.enabledSpaceIds = ['space-1'];
  });

  afterEach(() => {
    delete process.env.WORKER_URL;
    delete process.env.WORKER_SECRET;
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
  });

  it('does not let disabled spaces consume the bounded recovery batch', async () => {
    flags.enabledSpaceIds = [];
    await expect(reconcileWorkspaceRunLaunches()).resolves.toEqual({
      scanned: 0,
      enqueued: 0,
      planning: 0,
      execution: 0,
      failedSilent: 0,
      failedRuntime: 0,
      featureDisabled: 0,
      maxStaleSeconds: 0,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('re-enters planning and execution through stable, run-scoped Inngest events', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          runId: 'run-plan',
          workSessionId: 'session-plan',
          spaceId: 'space-1',
          sessionStatus: 'planning',
          runStatus: 'queued',
          launchToken: null,
          action: 'plan',
          recoveryKey: 'queued:unclaimed:1',
          staleForSeconds: 301,
        },
        {
          runId: 'run-launch',
          workSessionId: 'session-launch',
          spaceId: 'space-1',
          sessionStatus: 'running',
          runStatus: 'launching',
          launchToken: 'token-1',
          action: 'execute',
          recoveryKey: 'launching:token-1:2',
          staleForSeconds: 126,
        },
      ],
      error: null,
    });

    await expect(reconcileWorkspaceRunLaunches(500)).resolves.toEqual({
      scanned: 2,
      enqueued: 2,
      planning: 1,
      execution: 1,
      failedSilent: 0,
      failedRuntime: 0,
      featureDisabled: 0,
      maxStaleSeconds: 301,
    });
    expect(rpc).toHaveBeenCalledWith(
      'list_workspace_run_recovery_candidates',
      { p_limit: 25, p_space_ids: ['space-1'] },
    );
    expect(send).toHaveBeenNthCalledWith(1, {
      id: 'workspace-run-recovery:run-plan:queued:unclaimed:1',
      name: 'work-session/plan',
      data: {
        sessionId: 'session-plan',
        workspaceRunId: 'run-plan',
        reason: 'durable_launch_recovery',
      },
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      id: 'workspace-run-recovery:run-launch:launching:token-1:2',
      name: 'work-session/execute',
      data: {
        sessionId: 'session-launch',
        workspaceRunId: 'run-launch',
        reason: 'durable_launch_recovery',
      },
    });
  });

  it('uses the configured Cloudflare rail without also sending Inngest events', async () => {
    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    process.env.WORKER_SECRET = 'secret';
    process.env.INNGEST_EVENT_KEY = 'legacy';
    enqueueWorkerTask.mockResolvedValue(true);
    rpc.mockResolvedValue({
      data: [{
        runId: 'run-plan', workSessionId: 'session-plan', spaceId: 'space-1',
        sessionStatus: 'planning', runStatus: 'queued', launchToken: null,
        action: 'plan', recoveryKey: 'queued:unclaimed:1', staleForSeconds: 301,
      }],
      error: null,
    });

    await expect(reconcileWorkspaceRunLaunches()).resolves.toMatchObject({ enqueued: 1, planning: 1 });
    expect(enqueueWorkerTask).toHaveBeenCalledWith('work-session-plan', {
      sessionId: 'session-plan',
      workspaceRunId: 'run-plan',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('fails a stale running parent through the current launch-token fence without dispatch', async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{
          runId: 'run-runtime-timeout',
          workSessionId: 'session-runtime-timeout',
          spaceId: 'space-1',
          sessionStatus: 'running',
          runStatus: 'running',
          launchToken: 'token-current',
          action: 'fail_runtime_timeout',
          recoveryKey: 'running:token-current:1',
          staleForSeconds: 361,
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });

    await expect(reconcileWorkspaceRunLaunches()).resolves.toEqual({
      scanned: 1,
      enqueued: 0,
      planning: 0,
      execution: 0,
      failedSilent: 0,
      failedRuntime: 1,
      featureDisabled: 0,
      maxStaleSeconds: 361,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'fail_stale_running_workspace_run', {
      p_run_id: 'run-runtime-timeout',
      p_space_id: 'space-1',
      p_token: 'token-current',
    });
    expect(send).not.toHaveBeenCalled();
    expect(enqueueWorkerTask).not.toHaveBeenCalled();
  });

  it('fails visibly when candidate loading or event acceptance fails', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('db unavailable') });
    await expect(reconcileWorkspaceRunLaunches()).rejects.toThrow('db unavailable');

    rpc.mockResolvedValueOnce({
      data: [{
        runId: 'run-1',
        workSessionId: 'session-1',
        spaceId: 'space-1',
      sessionStatus: 'running',
      runStatus: 'queued',
      launchToken: null,
      action: 'execute',
      recoveryKey: 'queued:unclaimed:1',
      staleForSeconds: 31,
      }],
      error: null,
    });
    send.mockRejectedValueOnce(new Error('event not accepted'));
    await expect(reconcileWorkspaceRunLaunches()).rejects.toThrow('event not accepted');
  });

  it('rejects the complete malformed-candidate batch before any side effect', async () => {
    const valid = {
      runId: 'run-1',
      workSessionId: 'session-1',
      spaceId: 'space-1',
      sessionStatus: 'planning',
      runStatus: 'queued',
      launchToken: null,
      action: 'plan',
      recoveryKey: 'queued:unclaimed:1',
      staleForSeconds: 301,
    };
    const invalid = [
      { ...valid, action: undefined },
      { ...valid, action: 'unknown' },
      { ...valid, runId: ' ' },
      { ...valid, action: 'execute' },
      { ...valid, runStatus: 'launching', action: 'execute', launchToken: null },
      { ...valid, action: 'fail_accepted_silent' },
      {
        ...valid,
        sessionStatus: 'running',
        runStatus: 'running',
        launchToken: 'token-1',
        action: 'execute',
      },
      {
        ...valid,
        sessionStatus: 'running',
        runStatus: 'launching',
        launchToken: 'token-1',
        action: 'fail_runtime_timeout',
      },
      {
        ...valid,
        sessionStatus: 'running',
        runStatus: 'running',
        launchToken: null,
        action: 'fail_runtime_timeout',
      },
      { ...valid, staleForSeconds: Number.NaN },
      { ...valid, staleForSeconds: -1 },
    ];
    for (const candidate of invalid) {
      rpc.mockResolvedValueOnce({ data: [valid, candidate], error: null });
      await expect(reconcileWorkspaceRunLaunches()).rejects.toThrow(
        /Workspace recovery candidate/,
      );
    }
    await expect(reconcileWorkspaceRunLaunches(Number.NaN)).rejects.toThrow(
      'Workspace recovery limit is invalid',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps terminal and live-running work outside the SQL candidate set', () => {
    const migration = read(
      'supabase/migrations/20260915000007_workspace_launch_receipts.sql',
    );
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "WorkspaceRunLaunchReceipt"');
    expect(migration).toContain('"WorkspaceRun_recovery_scan_idx"');
    expect(migration).toContain('"WorkspaceRunLaunchReceipt_space_idx"');
    expect(migration).toContain('COALESCE(max(attempt), 0) + 1');
    expect(migration).toContain('v_run."modalAcceptedAt" IS NOT NULL');
    expect(migration).toContain('list_workspace_run_recovery_candidates');
    expect(migration).toContain('wr."spaceId" = ANY');
    expect(migration).toContain('"staleForSeconds" integer');
    expect(migration).toContain("ws.status = 'planning'");
    expect(migration).toContain("ws.status = 'running'");
    expect(migration).toContain("wr.status = 'queued'");
    expect(migration).toContain("wr.status = 'launching'");
    expect(migration).toContain('wr."launchLeaseExpiresAt" < now()');
    expect(migration).toContain('wr."modalAcceptedAt" IS NULL');
    expect(migration).toContain('fail_stale_accepted_workspace_launch');
    expect(migration).toContain('wr."cancellationRequestedAt" IS NULL');
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION list_workspace_run_recovery_candidates(integer,text[]) FROM PUBLIC',
    );
    expect(migration).not.toContain("wr.status = 'completed'");
  });
});

describe('Workspace launch presentation', () => {
  it('states that saved or recovering work is safe to leave without claiming completion', () => {
    expect(workspaceLaunchMessage('queued')).toBe(
      'Saved and waiting to launch. Safe to leave.',
    );
    expect(
      workspaceLaunchMessage('launching', {
        attempt: 1,
        state: 'recovering',
        reason: 'launch outcome unknown',
        createdAt: '2026-07-30T00:00:00Z',
      }),
    ).toBe('Saved; safely recovering the same launch. Safe to leave.');
    expect(
      workspaceLaunchMessage('launching', {
        attempt: 1,
        state: 'accepted',
        reason: null,
        createdAt: '2026-07-30T00:00:00Z',
      }),
    ).toBe('Runtime accepted; starting the isolated workspace. Safe to leave.');
    expect(
      workspaceLaunchMessage('launching', {
        attempt: 2,
        state: 'accepted',
        reason: null,
        createdAt: '2026-07-30T00:00:00Z',
      }),
    ).toBe('Runtime accepted the recovered launch. Safe to leave.');
    expect(
      workspaceLaunchMessage('launching', {
        attempt: 2,
        state: 'claimed',
        reason: null,
        createdAt: '2026-07-30T00:00:00Z',
      }),
    ).toBe('Saved; safely retrying the same workspace. Safe to leave.');
    expect(workspaceLaunchMessage('running')).toBe(
      'Running in the isolated workspace.',
    );
  });

  it('announces launch continuity and failures without exposing internal receipt reasons', () => {
    const panel = read('components/chippi/workspace-run-panel.tsx');
    expect(panel).toContain('aria-labelledby="workspace-launch-status-title"');
    expect(panel).toContain('role="status" aria-atomic="true"');
    expect(panel).toContain('run.status === \'failed\' && run.error');
    expect(panel).toContain('role="alert"');
    expect(panel).not.toContain('launchReceipt?.reason');
  });
});
