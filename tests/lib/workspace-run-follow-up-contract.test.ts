import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planWorkspaceRunTask } from '@/lib/workspace-runs/server';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Workspace Run continuation contract', () => {
  it('uses a bounded, visible command plan without shell interpolation', () => {
    const plan = planWorkspaceRunTask('Summarize the pricing rationale for seller review.');
    expect(plan).toHaveLength(3);
    expect(plan.map((step) => step.command)).toEqual([
      'python /workspace/continue_workspace.py --inspect',
      'python /workspace/continue_workspace.py --apply',
      'python /workspace/continue_workspace.py --validate',
    ]);
    expect(plan[1].description).toContain('Summarize the pricing rationale');
  });

  it('keeps continuation state tenant-scoped, sequential, idempotent, and feature-off', () => {
    const migration = read('supabase/migrations/20260915000000_workspace_run_follow_up_tasks.sql');
    expect(migration).toContain('UNIQUE ("runId", sequence)');
    expect(migration).toContain('UNIQUE ("runId", "idempotencyKey")');
    expect(migration).toContain("v_run.status <> 'completed'");
    expect(migration).toContain("workspace continuation already active");
    expect(migration).toContain("claim_workspace_run_task_launch");
    expect(migration).toContain("finish_workspace_run_task");
    expect(read('lib/chippi/workspace-run-flag.ts')).toContain('CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS');
  });

  it('uses a new no-network Modal VM and signed task callbacks, never a warm terminal', () => {
    const worker = read('agent/workspace_modal_app.py');
    expect(worker).toContain('launch_workspace_task');
    expect(worker).toContain('_claim_task_launch(item)');
    expect(worker).toContain('run_workspace_task');
    expect(worker).toContain('block_network=True');
    expect(worker).toContain('await sandbox.terminate.aio()');
    expect(worker).toContain('CHIPPI_WORKSPACE_TASK_CALLBACK_URL');
    expect(worker).not.toContain('Sandbox.create.aio("bash"');
  });

  it('renders the continuation inside the existing right panel and protects private artifacts', () => {
    expect(read('components/chippi/workspace-run-panel.tsx')).toContain('Continue this workspace');
    expect(read('components/chippi/workspace-run-panel.tsx')).toContain('task.commandPlan');
    expect(read('app/api/workspace-runs/[id]/tasks/route.ts')).toContain('requireSpaceOwner');
    expect(read('app/api/workspace-runs/[id]/tasks/route.ts')).toContain('isWorkspaceRunFollowUpsEnabledForSpace');
    expect(read('app/api/internal/workspace-runs/tasks/callback/route.ts')).toContain('uploadObject');
    expect(read('app/api/workspace-runs/[id]/files/[fileId]/route.ts')).toContain('WorkspaceRunTaskFile');
  });
});
