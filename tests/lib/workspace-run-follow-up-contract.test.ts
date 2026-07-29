import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { validateWorkspaceTaskPlan } from '@/lib/workspace-runs/server';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const extractTaskHelper = `import ast
tree = ast.parse(open("agent/workspace_modal_app.py").read())
for node in tree.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "TASK_SCRIPT" for t in node.targets):
        print(ast.literal_eval(node.value)); break`;

describe('Workspace Run continuation contract', () => {
  it('rejects instruction-only output structurally and accepts only exact private evidence', () => {
    const files = [{ name: 'brief.md', content: 'List price: $700,000. Seller wants a Thursday review.' }];
    expect(() => validateWorkspaceTaskPlan({ summary: 'Seller summary', title: 'Seller review', evidence: [{ file: 'brief.md', quote: 'Invented fact' }], nextSteps: ['Send it'] }, files)).toThrow('not grounded');
    expect(validateWorkspaceTaskPlan({ summary: 'Seller summary', title: 'Seller review', evidence: [{ file: 'brief.md', quote: 'List price: $700,000.' }], nextSteps: ['Review the listed price'] }, files).evidence[0].quote).toBe('List price: $700,000.');
  });

  it('executes the fixed task interpreter with grounded evidence and different private fixtures', () => {
    const helper = spawnSync('python3', ['-c', extractTaskHelper], { cwd: root, encoding: 'utf8' }).stdout;
    const run = (instruction: string, source: string) => {
      const dir = mkdtempSync(join(tmpdir(), 'chippi-task-helper-'));
      try {
        writeFileSync(join(dir, 'continue_workspace.py'), helper.replaceAll('/workspace', dir));
        const quote = source.split('. ')[0] + '.';
        writeFileSync(join(dir, 'task-input.json'), JSON.stringify({ instruction, task_sequence: 1, files: [{ name: 'brief.md', content: source }], execution_plan: { summary: 'Grounded follow-up', title: 'Private review', evidence: [{ file: 'brief.md', quote }], nextSteps: ['Review the quoted fact'] } }));
        expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--inspect']).status).toBe(0);
        expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--apply']).status).toBe(0);
        expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--validate']).status).toBe(0);
        return readFileSync(join(dir, 'workspace-follow-up-1.md'), 'utf8');
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    const seller = run('Prepare seller review', 'List price: $700,000. Seller prefers Thursday.');
    const buyer = run('Prepare buyer review', 'List price: $525,000. Buyer prefers Friday.');
    expect(seller).toContain('Prepare seller review');
    expect(seller).toContain('$700,000');
    expect(buyer).toContain('Prepare buyer review');
    expect(buyer).toContain('$525,000');
    expect(seller).not.toBe(buyer);
  });

  it('keeps continuation state tenant-scoped, sequential, idempotent, cancellable, and feature-off', () => {
    const migration = read('supabase/migrations/20260915000000_workspace_run_follow_up_tasks.sql');
    const corrective = read('supabase/migrations/20260915000001_workspace_run_task_programs_and_cancel.sql');
    const declarative = read('supabase/migrations/20260915000002_workspace_run_task_declarative_plans.sql');
    expect(migration).toContain('UNIQUE ("runId", sequence)');
    expect(migration).toContain('UNIQUE ("runId", "idempotencyKey")');
    expect(corrective).toContain('cancel_workspace_run_task');
    expect(declarative).toContain('executionPlan');
    expect(read('lib/chippi/workspace-run-flag.ts')).toContain('CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS');
  });

  it('uses a fresh no-network Modal VM and fixed declarative interpreter', () => {
    const worker = read('agent/workspace_modal_app.py');
    expect(worker).toContain('launch_workspace_task');
    expect(worker).toContain('_claim_task_launch(item)');
    expect(worker).toContain('block_network=True');
    expect(worker).toContain('parser.add_argument("--apply", action="store_true")');
    expect(worker).not.toContain('generated_follow_up.py');
    expect(worker).toContain('grounded evidence does not match private file');
    expect(worker).toContain('await sandbox.terminate.aio()');
  });

  it('renders continuation cancellation and preserves retry identity while protecting artifacts', () => {
    const panel = read('components/chippi/workspace-run-panel.tsx');
    expect(panel).toContain('Continue this workspace');
    expect(panel).toContain('continuationKeyRef');
    expect(panel).toContain('cancelTask');
    expect(read('app/api/workspace-runs/[id]/tasks/route.ts')).toContain('findWorkspaceRunTaskByIdempotency');
    expect(read('app/api/workspace-runs/[id]/tasks/route.ts')).toContain("task.created || task.status === 'queued'");
    expect(read('app/api/internal/workspace-runs/tasks/callback/route.ts')).toContain('cancelledBeforePublish');
  });
});
