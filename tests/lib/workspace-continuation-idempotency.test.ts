import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  getWorkspaceRun: vi.fn(),
  findWorkspaceRunTaskByIdempotency: vi.fn(),
  reserveWorkspaceRunTaskPlan: vi.fn(),
  releaseWorkspaceRunTaskPlan: vi.fn(),
  workspaceTaskFiles: vi.fn(),
  planWorkspaceRunTask: vi.fn(),
  enqueueWorkspaceRunTask: vi.fn(),
  kickWorkspaceRunTask: vi.fn(),
}));

vi.mock('@/lib/chippi/workspace-run-flag', () => ({
  isWorkspaceRunFollowUpsEnabledForSpace: () => true,
}));
vi.mock('@/lib/workspace-runs/server', () => mocks);
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));

import { continueCompletedWorkspaceRun } from '@/lib/workspace-runs/conversation-continuation';

describe('Workspace continuation database idempotency boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceRun.mockResolvedValue({ id: 'run-1', status: 'completed', tasks: [] });
    mocks.findWorkspaceRunTaskByIdempotency.mockResolvedValue(null);
    mocks.reserveWorkspaceRunTaskPlan.mockResolvedValue({ state: 'claimed', planningToken: 'plan-token-1' });
    mocks.releaseWorkspaceRunTaskPlan.mockResolvedValue(true);
    mocks.workspaceTaskFiles.mockResolvedValue([{ name: 'brief.md', content: 'Seller prefers Thursday.' }]);
    mocks.planWorkspaceRunTask.mockResolvedValue({
      commandPlan: [{ command: 'python /workspace/continue_workspace.py --apply', description: 'Apply' }],
      executionPlan: { summary: 'Grounded', title: 'Grounded', evidence: [{ file: 'brief.md', quote: 'Seller prefers Thursday.' }], nextSteps: ['Review'] },
    });
    mocks.kickWorkspaceRunTask.mockResolvedValue(undefined);
  });

  it('maps the stable RPC conflict to a deterministic conflicting-retry result', async () => {
    mocks.reserveWorkspaceRunTaskPlan.mockRejectedValue({ message: 'workspace continuation idempotency conflict' });

    await expect(continueCompletedWorkspaceRun({
      spaceId: 'space-1', runId: 'run-1', instruction: 'Prepare seller review', idempotencyKey: 'a'.repeat(16),
    })).resolves.toEqual({
      ok: false,
      code: 'conflict',
      error: 'This continuation key was already used for a different request.',
    });
    expect(mocks.planWorkspaceRunTask).not.toHaveBeenCalled();
  });

  it('preserves the database active conflict from a plain PostgREST error', async () => {
    mocks.reserveWorkspaceRunTaskPlan.mockRejectedValue({ message: 'workspace continuation already active' });

    await expect(continueCompletedWorkspaceRun({
      spaceId: 'space-1', runId: 'run-1', instruction: 'Prepare seller review', idempotencyKey: 'e'.repeat(16),
    })).resolves.toMatchObject({ ok: false, code: 'active' });
    expect(mocks.planWorkspaceRunTask).not.toHaveBeenCalled();
  });

  it('reserves before the billable plan and keeps concurrent different instructions from both planning', async () => {
    let acceptedInstruction: string | null = null;
    mocks.reserveWorkspaceRunTaskPlan.mockImplementation(async (input: { instruction: string }) => {
      if (acceptedInstruction === null) {
        acceptedInstruction = input.instruction;
        return { state: 'claimed', planningToken: 'plan-token-1' };
      }
      if (acceptedInstruction !== input.instruction) {
        throw { message: 'workspace continuation idempotency conflict' };
      }
      return { state: 'pending' };
    });
    mocks.enqueueWorkspaceRunTask.mockResolvedValue({ taskId: 'task-1', status: 'queued', created: true });

    const [first, second] = await Promise.all([
      continueCompletedWorkspaceRun({ spaceId: 'space-1', runId: 'run-1', instruction: 'Prepare seller review', idempotencyKey: 'b'.repeat(16) }),
      continueCompletedWorkspaceRun({ spaceId: 'space-1', runId: 'run-1', instruction: 'Prepare buyer review', idempotencyKey: 'b'.repeat(16) }),
    ]);

    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second].find((result) => !result.ok)).toMatchObject({ code: 'conflict' });
    expect(mocks.planWorkspaceRunTask).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueWorkspaceRunTask).toHaveBeenCalledWith(expect.objectContaining({ planningToken: 'plan-token-1' }));
    expect(mocks.reserveWorkspaceRunTaskPlan.mock.invocationCallOrder[0]).toBeLessThan(mocks.planWorkspaceRunTask.mock.invocationCallOrder[0]);
    expect(mocks.planWorkspaceRunTask.mock.invocationCallOrder[0]).toBeLessThan(mocks.enqueueWorkspaceRunTask.mock.invocationCallOrder[0]);
  });

  it('does not bill twice for a concurrent same-instruction retry and later reuses the task', async () => {
    let reserved = false;
    mocks.reserveWorkspaceRunTaskPlan.mockImplementation(async () => {
      if (!reserved) {
        reserved = true;
        return { state: 'claimed', planningToken: 'plan-token-1' };
      }
      return { state: 'pending' };
    });
    mocks.enqueueWorkspaceRunTask.mockResolvedValue({ taskId: 'task-1', status: 'queued', created: true });

    const request = () => continueCompletedWorkspaceRun({
      spaceId: 'space-1', runId: 'run-1', instruction: 'Prepare seller review', idempotencyKey: 'c'.repeat(16),
    });
    const [first, duplicate] = await Promise.all([request(), request()]);

    expect(first).toMatchObject({ ok: true, taskId: 'task-1' });
    expect(duplicate).toMatchObject({ ok: false, code: 'planning_unavailable' });
    expect(mocks.planWorkspaceRunTask).toHaveBeenCalledTimes(1);

    mocks.findWorkspaceRunTaskByIdempotency.mockResolvedValue({ id: 'task-1', status: 'queued', instruction: 'Prepare seller review' });
    await expect(request()).resolves.toMatchObject({ ok: true, taskId: 'task-1', reused: true });
    expect(mocks.planWorkspaceRunTask).toHaveBeenCalledTimes(1);
  });

  it('releases only its own failed planning token so a safe retry can reclaim', async () => {
    mocks.planWorkspaceRunTask.mockRejectedValueOnce(new Error('Workspace continuation planning returned unreadable output.'));

    const input = { spaceId: 'space-1', runId: 'run-1', instruction: 'Prepare seller review', idempotencyKey: 'd'.repeat(16) };
    await expect(continueCompletedWorkspaceRun(input)).resolves.toMatchObject({ ok: false, code: 'planning_unavailable' });
    expect(mocks.releaseWorkspaceRunTaskPlan).toHaveBeenCalledWith(expect.objectContaining({ planningToken: 'plan-token-1' }));

    mocks.reserveWorkspaceRunTaskPlan.mockResolvedValueOnce({ state: 'claimed', planningToken: 'plan-token-2' });
    mocks.enqueueWorkspaceRunTask.mockResolvedValueOnce({ taskId: 'task-2', status: 'queued', created: true });
    await expect(continueCompletedWorkspaceRun(input)).resolves.toMatchObject({ ok: true, taskId: 'task-2' });
    expect(mocks.planWorkspaceRunTask).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueWorkspaceRunTask).toHaveBeenLastCalledWith(expect.objectContaining({ planningToken: 'plan-token-2' }));
  });

  it('defines an atomic leased claim, token consumption, and disables unfenced enqueue RPCs', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260915000011_workspace_continuation_plan_claim.sql'), 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "WorkspaceRunTaskPlanClaim"');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION reserve_workspace_run_task_plan');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('v_claim."leaseExpiresAt" > now()');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION enqueue_reserved_workspace_run_task_with_plan');
    expect(sql).toContain('v_claim."planningToken" IS DISTINCT FROM p_planning_token');
    expect(sql).toContain('DELETE FROM "WorkspaceRunTaskPlanClaim"');
    expect(sql).toContain('workspace continuation planning reservation required');
    expect(sql).toContain('REVOKE ALL ON FUNCTION reserve_workspace_run_task_plan');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION enqueue_reserved_workspace_run_task_with_plan');
  });
});
