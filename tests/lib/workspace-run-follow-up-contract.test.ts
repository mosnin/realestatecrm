import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { commandPlanForWorkspaceTask, isSafeWorkspaceInputName, validateWorkspaceCompletionManifest, validateWorkspaceTaskPlan } from '@/lib/workspace-runs/typed-plan';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const extractTaskHelper = `import ast
tree = ast.parse(open("agent/workspace_modal_app.py").read())
for node in tree.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "TASK_SCRIPT" for t in node.targets):
        print(ast.literal_eval(node.value)); break`;

describe('Workspace Run continuation contract', () => {
  it('accepts only grounded, closed typed operations and derives the visible commands', () => {
    const files = [{ name: 'brief.md', content: 'List price: $700,000. Seller wants a Thursday review.' }, { name: 'comps.csv', content: 'address,city,list_price\nA,Denver,700000\nB,Aurora,680000\n' }];
    expect(() => validateWorkspaceTaskPlan({ summary: 'Seller summary', title: 'Seller review', evidence: [{ file: 'brief.md', quote: 'Invented fact' }], nextSteps: ['Send it'], operations: [{ id: 'report', type: 'grounded_markdown_report' }, { id: 'actions', type: 'json_action_register' }] }, files)).toThrow('not grounded');
    const plan = validateWorkspaceTaskPlan({ summary: 'Seller summary', title: 'Seller review', evidence: [{ file: 'brief.md', quote: 'List price: $700,000.' }], nextSteps: ['Review the listed price'], operations: [{ id: 'report', type: 'grounded_markdown_report' }, { id: 'comps', type: 'comps_csv_projection', source: 'comps.csv', columns: ['address', 'list_price'], sort: { column: 'list_price', direction: 'desc' }, rowLimit: 2 }, { id: 'actions', type: 'json_action_register' }] }, files);
    expect(plan.evidence[0].quote).toBe('List price: $700,000.');
    expect(commandPlanForWorkspaceTask(plan).map((step) => step.command)).toEqual(['python /workspace/continue_workspace.py --inspect', 'python /workspace/continue_workspace.py --execute report', 'python /workspace/continue_workspace.py --execute comps', 'python /workspace/continue_workspace.py --execute actions', 'python /workspace/continue_workspace.py --validate']);
    expect(() => validateWorkspaceTaskPlan({ ...plan, operations: [{ id: 'shell', type: 'shell' }, { id: 'actions', type: 'json_action_register' }] }, files)).toThrow('invalid');
    expect(() => validateWorkspaceTaskPlan({ ...plan, operations: [{ id: 'comps', type: 'comps_csv_projection', source: 'comps.csv', columns: ['address'], rowLimit: 21 }, { id: 'actions', type: 'json_action_register' }] }, files)).toThrow('row limit');
    expect(() => validateWorkspaceTaskPlan({ ...plan, operations: [{ id: 'comps', type: 'comps_csv_projection', source: '../comps.csv', columns: ['address'], rowLimit: 2 }, { id: 'actions', type: 'json_action_register' }] }, files)).toThrow('comps.csv');
    expect(() => validateWorkspaceTaskPlan({ ...plan, operations: [...plan.operations, { id: 'duplicate', type: 'json_action_register' }] }, files)).toThrow('two or three');
    expect(isSafeWorkspaceInputName('workspace-follow-up-1.md')).toBe(true);
    expect(isSafeWorkspaceInputName('workspace-actions-1.json')).toBe(true);
    expect(isSafeWorkspaceInputName('../comps.csv')).toBe(false);
  });

  it('executes the fixed interpreter demo path and produces Markdown, CSV, and JSON artifacts', () => {
    const helper = spawnSync('python3', ['-c', extractTaskHelper], { cwd: root, encoding: 'utf8' }).stdout;
    const run = (instruction: string, source: string) => {
      const dir = mkdtempSync(join(tmpdir(), 'chippi-task-helper-'));
      try {
        writeFileSync(join(dir, 'continue_workspace.py'), helper.replaceAll('/workspace', dir));
        const quote = source.split('. ')[0] + '.';
        writeFileSync(join(dir, 'task-input.json'), JSON.stringify({ instruction, task_sequence: 1, files: [{ name: 'brief.md', content: source }, { name: 'comps.csv', content: 'address,city,list_price\nA,Denver,90000\nB,Aurora,100000\n' }], execution_plan: { summary: 'Grounded follow-up', title: 'Private review', evidence: [{ file: 'brief.md', quote }], nextSteps: ['Review the quoted fact'], operations: [{ id: 'report', type: 'grounded_markdown_report' }, { id: 'comps', type: 'comps_csv_projection', source: 'comps.csv', columns: ['address', 'list_price'], sort: { column: 'list_price', direction: 'desc' }, rowLimit: 2 }, { id: 'actions', type: 'json_action_register' }] } }));
        expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--inspect']).status).toBe(0);
        expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--execute', 'report']).status).toBe(0);
        expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--execute', 'comps']).status).toBe(0);
        expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--execute', 'actions']).status).toBe(0);
        expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--validate']).status).toBe(0);
        return { markdown: readFileSync(join(dir, 'workspace-report-1.md'), 'utf8'), csv: readFileSync(join(dir, 'workspace-comps-1.csv'), 'utf8'), actions: readFileSync(join(dir, 'workspace-actions-1.json'), 'utf8'), dir };
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    const seller = run('Prepare seller review', 'List price: $700,000. Seller prefers Thursday.');
    const buyer = run('Prepare buyer review', 'List price: $525,000. Buyer prefers Friday.');
    expect(seller.markdown).toContain('Prepare seller review');
    expect(seller.markdown).toContain('$700,000');
    expect(seller.csv).toBe('address,list_price\nB,100000\nA,90000\n');
    expect(JSON.parse(seller.actions).actions[0].nextStep).toBe('Review the quoted fact');
    expect(buyer.markdown).toContain('Prepare buyer review');
    expect(buyer.markdown).toContain('$525,000');
    expect(seller.markdown).not.toBe(buyer.markdown);
  });

  it('fails closed for unknown operations and extra typed artifacts', () => {
    const helper = spawnSync('python3', ['-c', extractTaskHelper], { cwd: root, encoding: 'utf8' }).stdout;
    const dir = mkdtempSync(join(tmpdir(), 'chippi-task-negative-'));
    try {
      writeFileSync(join(dir, 'continue_workspace.py'), helper.replaceAll('/workspace', dir));
      const base = { instruction: 'Prepare review', task_sequence: 1, files: [{ name: 'brief.md', content: 'Seller prefers Thursday.' }, { name: 'comps.csv', content: 'address,city\nA,Denver\n' }], execution_plan: { summary: 'Grounded', title: 'Review', evidence: [{ file: 'brief.md', quote: 'Seller prefers Thursday.' }], nextSteps: ['Review'], operations: [{ id: 'report', type: 'grounded_markdown_report' }, { id: 'actions', type: 'json_action_register' }] } };
      writeFileSync(join(dir, 'task-input.json'), JSON.stringify({ ...base, execution_plan: { ...base.execution_plan, operations: [{ id: 'bad', type: 'shell' }, { id: 'actions', type: 'json_action_register' }] } }));
      expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--inspect']).status).not.toBe(0);
      writeFileSync(join(dir, 'task-input.json'), JSON.stringify(base));
      expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--execute', 'report']).status).toBe(0);
      expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--execute', 'actions']).status).toBe(0);
      writeFileSync(join(dir, 'workspace-comps-1.csv'), 'unexpected\n');
      expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--validate']).status).not.toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('keeps prior typed artifacts hydrated while rejecting extra current-sequence artifacts', () => {
    const helper = spawnSync('python3', ['-c', extractTaskHelper], { cwd: root, encoding: 'utf8' }).stdout;
    const dir = mkdtempSync(join(tmpdir(), 'chippi-task-replay-'));
    try {
      writeFileSync(join(dir, 'continue_workspace.py'), helper.replaceAll('/workspace', dir));
      const plan = { summary: 'Grounded', title: 'Review', evidence: [{ file: 'brief.md', quote: 'Seller prefers Thursday.' }], nextSteps: ['Review'], operations: [{ id: 'report', type: 'grounded_markdown_report' }, { id: 'actions', type: 'json_action_register' }] };
      writeFileSync(join(dir, 'task-input.json'), JSON.stringify({ instruction: 'Prepare review', task_sequence: 2, files: [{ name: 'brief.md', content: 'Seller prefers Thursday.' }, { name: 'workspace-report-1.md', content: 'old report' }, { name: 'workspace-comps-1.csv', content: 'address\nold\n' }, { name: 'workspace-actions-1.json', content: '{"old":true}\n' }], execution_plan: plan }));
      expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--execute', 'report']).status).toBe(0);
      expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--execute', 'actions']).status).toBe(0);
      expect(spawnSync('python3', [join(dir, 'continue_workspace.py'), '--validate']).status).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('validates the complete callback manifest before any upload boundary', () => {
    const plan = { summary: 'Grounded', title: 'Review', evidence: [{ file: 'brief.md', quote: 'Seller prefers Thursday.' }], nextSteps: ['Review'], operations: [{ id: 'report', type: 'grounded_markdown_report' }, { id: 'comps', type: 'comps_csv_projection', source: 'comps.csv', columns: ['address'], rowLimit: 1 }, { id: 'actions', type: 'json_action_register' }] };
    const files = [{ name: 'workspace-report-2.md', content: Buffer.from('# Review\n').toString('base64') }, { name: 'workspace-comps-2.csv', content: Buffer.from('address\nA\n').toString('base64') }, { name: 'workspace-actions-2.json', content: Buffer.from('{"title":"Review","summary":"Grounded","actions":[{"nextStep":"Review","evidence":[]}]}').toString('base64') }];
    expect(validateWorkspaceCompletionManifest(files, plan, 2)?.map((file) => file.mimeType)).toEqual(['text/markdown', 'text/csv', 'application/json']);
    expect(validateWorkspaceCompletionManifest([...files, files[0]], plan, 2)).toBeNull();
    expect(validateWorkspaceCompletionManifest([{ ...files[0], mimeType: 'text/csv' }, files[1], files[2]], plan, 2)).toBeNull();
    expect(validateWorkspaceCompletionManifest([{ ...files[0], content: '%%%=' }, files[1], files[2]], plan, 2)).toBeNull();
    expect(validateWorkspaceCompletionManifest([{ ...files[0], content: Buffer.from([0xc3, 0x28]).toString('base64') }, files[1], files[2]], plan, 2)).toBeNull();
    expect(validateWorkspaceCompletionManifest([files[0], files[1], { ...files[2], content: Buffer.from('{bad').toString('base64') }], plan, 2)).toBeNull();
    expect(validateWorkspaceCompletionManifest([files[0]], { ...plan, operations: [plan.operations[0]] }, 2)).toBeNull();
  });

  it('keeps continuation state tenant-scoped, sequential, idempotent, cancellable, and feature-off', () => {
    const migration = read('supabase/migrations/20260915000000_workspace_run_follow_up_tasks.sql');
    const corrective = read('supabase/migrations/20260915000001_workspace_run_task_programs_and_cancel.sql');
    const declarative = read('supabase/migrations/20260915000002_workspace_run_task_declarative_plans.sql');
    expect(migration).toContain('UNIQUE ("runId", sequence)');
    expect(migration).toContain('UNIQUE ("runId", "idempotencyKey")');
    expect(migration).toContain('record_workspace_run_task_event');
    expect(migration).toContain('t."modalAcceptedAt" IS NULL');
    expect(migration).toContain('v_task."launchToken" IS DISTINCT FROM p_launch_token');
    expect(read('lib/workspace-runs/server.ts')).toContain("pending.launchToken && !pending.modalAcceptedAt");
    expect(corrective).toContain('cancel_workspace_run_task');
    expect(declarative).toContain('executionPlan');
    const typed = read('supabase/migrations/20260915000004_workspace_run_typed_artifacts.sql');
    expect(typed).toContain('workspace-comps-');
    expect(typed).toContain('json_action_register');
    expect(typed).toContain('BETWEEN 1 AND 5');
    expect(typed).toContain("COALESCE(jsonb_typeof(p_execution_plan->'operations') = 'array', false)");
    expect(typed).toContain('FOR UPDATE');
    expect(typed).toContain("MESSAGE='workspace continuation idempotency conflict'");
    expect(typed).toContain('INSERT INTO "WorkspaceRunTask"');
    expect(typed).not.toContain('enqueue_workspace_run_task(p_run_id');
    expect(typed).toContain('workspace-follow-up-');
    expect(typed).toContain('AS "mimeType"');
    expect(typed).toContain('v_task."launchToken" IS DISTINCT FROM p_launch_token');
    expect(read('lib/chippi/workspace-run-flag.ts')).toContain('CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS');
    const atomicConflict = read('supabase/migrations/20260915000003_workspace_run_task_idempotency_conflict.sql');
    expect(atomicConflict).toContain('FOR UPDATE');
    expect(atomicConflict).toContain("MESSAGE = 'workspace continuation idempotency conflict'");
    expect(atomicConflict).toContain("regexp_replace(btrim(v_existing.instruction), '\\s+', ' ', 'g') <> v_instruction");
  });

  it('uses a fresh no-network Modal VM and fixed declarative interpreter', () => {
    const worker = read('agent/workspace_modal_app.py');
    expect(worker).toContain('launch_workspace_task');
    expect(worker).toContain('_claim_task_launch(item)');
    expect(worker).toContain('block_network=True');
    expect(worker).toContain('group.add_argument("--execute")');
    expect(worker).not.toContain('parser.add_argument("--apply", action="store_true")');
    expect(worker).not.toContain('generated_follow_up.py');
    expect(worker).toContain('grounded evidence does not match private file');
    expect(worker).toContain('await sandbox.terminate.aio()');
  });

  it('renders continuation cancellation and preserves retry identity while protecting artifacts', () => {
    const panel = read('components/chippi/workspace-run-panel.tsx');
    expect(panel).toContain('Continue this workspace');
    expect(panel).toContain('continuationKeyRef');
    expect(panel).toContain('cancelTask');
    expect(read('app/api/workspace-runs/[id]/tasks/route.ts')).toContain('continueCompletedWorkspaceRun');
    const continuation = read('lib/workspace-runs/conversation-continuation.ts');
    expect(continuation).toContain('normalizedInstruction(existing.instruction) !== instruction');
    expect(continuation).toContain("code: 'conflict'");
    expect(read('app/api/internal/workspace-runs/tasks/callback/route.ts')).toContain('cancelledBeforePublish');
    expect(read('app/api/internal/workspace-runs/tasks/callback/route.ts')).toContain('validateWorkspaceCompletionManifest');
  });

  it('keeps model and voice run selection server-side and opens the existing panel only from structured results', () => {
    const continuation = read('lib/workspace-runs/conversation-continuation.ts');
    expect(continuation).toContain(".eq('conversationId', conversationId)");
    expect(continuation).toContain("tenantTable(supabase, 'WorkSession', { spaceId })");
    expect(continuation).toContain("tenantTable(supabase, 'WorkspaceRun', { spaceId })");
    expect(read('lib/ai-tools/tools/continue-workspace-run.ts')).not.toContain('runId:');
    expect(read('app/api/ai/realtime-delegate/route.ts')).toContain("z.literal('continue_workspace_run')");
    expect(read('components/chippi/chippi-workspace.tsx')).toContain("input.name === 'continue_workspace_run'");
    expect(read('components/chippi/chippi-workspace.tsx')).toContain("setRightTab('workspace')");
  });

  it('persists an idempotent voice continuation transcript with its durable task binding', () => {
    const delegate = read('app/api/ai/realtime-delegate/route.ts');
    expect(delegate).toContain('persistWorkspaceContinuationTurn');
    expect(delegate).toContain("name: 'continue_workspace_run'");
    expect(delegate).toContain('stableVoiceId(args.spaceId, args.conversationId, args.callId, \'user-message\')');
    expect(delegate).toContain('stableVoiceId(args.spaceId, args.conversationId, args.callId, \'assistant-message\')');
    expect(delegate).toContain('data: { runId: args.runId, taskId: args.taskId, status: args.status, openWorkspacePanel: true }');
    expect(delegate).toContain("ignoreDuplicates: true");
    expect(delegate).toContain('conversationRecorded');
    expect(delegate).not.toContain('accepted but its conversation record could not be saved');
  });

  it('immediately refreshes an already-open Workspace after chat or voice enqueues the same run', () => {
    const workspace = read('components/chippi/chippi-workspace.tsx');
    expect(workspace).toContain('setWorkspaceRunRefreshToken((value) => value + 1)');
    expect(workspace).toContain('workspaceRunRefreshToken={workspaceRunRefreshToken}');
    expect(read('components/chippi/right-panel.tsx')).toContain('refreshToken={workspaceRunRefreshToken}');
    expect(read('components/chippi/workspace-run-panel.tsx')).toContain('}, [load, refreshToken]);');
  });
});
