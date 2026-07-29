import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { validateWorkspaceTaskProgram } from '@/lib/workspace-runs/server';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const groundedProgram = `source = (workspace / "brief.md").read_text(encoding="utf-8")
output_path.write_text("# " + instruction + "\\n\\n" + source, encoding="utf-8")`;

describe('Workspace Run continuation contract', () => {
  it('rejects canned output and executes a grounded program differently for private fixtures', () => {
    expect(() => validateWorkspaceTaskProgram('output_path.write_text("done")')).toThrow('not grounded');
    const dir = mkdtempSync(join(tmpdir(), 'chippi-workspace-task-'));
    try {
      const run = (instruction: string, source: string) => {
        writeFileSync(join(dir, 'brief.md'), source);
        const script = `from pathlib import Path
instruction = ${JSON.stringify(instruction)}
workspace = Path(${JSON.stringify(dir)})
output_path = workspace / "out.md"
${validateWorkspaceTaskProgram(groundedProgram)}`;
        expect(spawnSync('python3', ['-I', '-c', script]).status).toBe(0);
        return readFileSync(join(dir, 'out.md'), 'utf8');
      };
      const seller = run('Prepare a seller summary', 'List price: $700,000');
      const buyer = run('Prepare a buyer summary', 'List price: $525,000');
      expect(seller).toContain('Prepare a seller summary');
      expect(seller).toContain('$700,000');
      expect(buyer).toContain('Prepare a buyer summary');
      expect(buyer).toContain('$525,000');
      expect(seller).not.toBe(buyer);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('keeps continuation state tenant-scoped, sequential, idempotent, cancellable, and feature-off', () => {
    const migration = read('supabase/migrations/20260915000000_workspace_run_follow_up_tasks.sql');
    const corrective = read('supabase/migrations/20260915000001_workspace_run_task_programs_and_cancel.sql');
    expect(migration).toContain('UNIQUE ("runId", sequence)');
    expect(migration).toContain('UNIQUE ("runId", "idempotencyKey")');
    expect(migration).toContain("v_run.status <> 'completed'");
    expect(corrective).toContain('executionProgram');
    expect(corrective).toContain('cancel_workspace_run_task');
    expect(read('lib/chippi/workspace-run-flag.ts')).toContain('CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS');
  });

  it('uses a fresh no-network Modal VM, executable option flags, and signed task callbacks', () => {
    const worker = read('agent/workspace_modal_app.py');
    expect(worker).toContain('launch_workspace_task');
    expect(worker).toContain('_claim_task_launch(item)');
    expect(worker).toContain('run_workspace_task');
    expect(worker).toContain('block_network=True');
    expect(worker).toContain('parser.add_argument("--inspect", action="store_true")');
    expect(worker).toContain('generated_follow_up.py');
    expect(worker).toContain('await sandbox.terminate.aio()');
  });

  it('executes the task helper with its declared option flags', () => {
    const extract = `import ast
tree = ast.parse(open("agent/workspace_modal_app.py").read())
for node in tree.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "TASK_SCRIPT" for t in node.targets):
        print(ast.literal_eval(node.value)); break`;
    const helper = spawnSync('python3', ['-c', extract], { cwd: root, encoding: 'utf8' }).stdout.replaceAll('/workspace', '__WORKSPACE__');
    const dir = mkdtempSync(join(tmpdir(), 'chippi-task-helper-'));
    try {
      const script = helper.replaceAll('__WORKSPACE__', dir);
      writeFileSync(join(dir, 'continue_workspace.py'), script);
      writeFileSync(join(dir, 'task-input.json'), JSON.stringify({ task_sequence: 1, files: [{ name: 'brief.md', content: 'Private price: $700,000' }] }));
      expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--inspect']).status).toBe(0);
      writeFileSync(join(dir, 'workspace-follow-up-1.md'), 'Grounded result');
      expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--validate']).status).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('renders continuation cancellation and preserves retry identity while protecting artifacts', () => {
    const panel = read('components/chippi/workspace-run-panel.tsx');
    expect(panel).toContain('Continue this workspace');
    expect(panel).toContain('continuationKeyRef');
    expect(panel).toContain('cancelTask');
    expect(read('app/api/workspace-runs/[id]/tasks/route.ts')).toContain('findWorkspaceRunTaskByIdempotency');
    expect(read('app/api/workspace-runs/[id]/tasks/route.ts')).toContain("task.created || task.status === 'queued'");
    expect(read('app/api/internal/workspace-runs/tasks/callback/route.ts')).toContain('cancelledBeforePublish');
    expect(read('app/api/internal/workspace-runs/tasks/callback/route.ts')).toContain('uploadObject');
  });
});
