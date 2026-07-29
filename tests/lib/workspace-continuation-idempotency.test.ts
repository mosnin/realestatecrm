import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWorkspaceRun: vi.fn(),
  findWorkspaceRunTaskByIdempotency: vi.fn(),
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
    mocks.workspaceTaskFiles.mockResolvedValue([{ name: 'brief.md', content: 'Seller prefers Thursday.' }]);
    mocks.planWorkspaceRunTask.mockResolvedValue({
      commandPlan: [{ command: 'python /workspace/continue_workspace.py --apply', description: 'Apply' }],
      executionPlan: { summary: 'Grounded', title: 'Grounded', evidence: [{ file: 'brief.md', quote: 'Seller prefers Thursday.' }], nextSteps: ['Review'] },
    });
    mocks.kickWorkspaceRunTask.mockResolvedValue(undefined);
  });

  it('maps the stable RPC conflict to a deterministic conflicting-retry result', async () => {
    mocks.enqueueWorkspaceRunTask.mockRejectedValue({ message: 'workspace continuation idempotency conflict' });

    await expect(continueCompletedWorkspaceRun({
      spaceId: 'space-1', runId: 'run-1', instruction: 'Prepare seller review', idempotencyKey: 'a'.repeat(16),
    })).resolves.toEqual({
      ok: false,
      code: 'conflict',
      error: 'This continuation key was already used for a different request.',
    });
  });

  it('keeps concurrent same-key different-instruction requests from both succeeding', async () => {
    let acceptedInstruction: string | null = null;
    mocks.enqueueWorkspaceRunTask.mockImplementation(async (input: { instruction: string }) => {
      if (acceptedInstruction === null) {
        acceptedInstruction = input.instruction;
        return { taskId: 'task-1', status: 'queued', created: true };
      }
      if (acceptedInstruction !== input.instruction) {
        throw { message: 'workspace continuation idempotency conflict' };
      }
      return { taskId: 'task-1', status: 'queued', created: false };
    });

    const [first, second] = await Promise.all([
      continueCompletedWorkspaceRun({ spaceId: 'space-1', runId: 'run-1', instruction: 'Prepare seller review', idempotencyKey: 'b'.repeat(16) }),
      continueCompletedWorkspaceRun({ spaceId: 'space-1', runId: 'run-1', instruction: 'Prepare buyer review', idempotencyKey: 'b'.repeat(16) }),
    ]);

    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second].find((result) => !result.ok)).toMatchObject({ code: 'conflict' });
  });
});
