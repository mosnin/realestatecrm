import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rankWorkspaceComparisons, selectWorkspaceTarget } from '@/lib/workspace-runs/packet';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Workspace Run vertical contract', () => {
  it('keeps the user-visible journey feature-gated and attached to natural-language Work mode', () => {
    expect(read('components/chippi/chippi-workspace.tsx')).toContain('ChatWorkModeSwitch');
    expect(read('components/chippi/chippi-workspace.tsx')).not.toContain('WorkSessionDialog');
    expect(read('components/ui/chippi-prompt-box.tsx')).not.toContain("action: 'work-session'");
    expect(read('lib/ai-tools/tools/start-work-session.ts')).toContain(".enum(['research', 'workspace'])");
    expect(read('lib/ai-tools/tools/start-work-session.ts')).toContain('isWorkspaceRunsEnabledForSpace');
    expect(read('components/chippi/chippi-workspace.tsx')).toContain("setRightTab('workspace')");
    expect(read('components/chippi/chippi-workspace.tsx')).toContain('setWorkspaceRunId(null);');
    expect(read('components/chippi/workspace-run-panel.tsx')).toContain("const active = (status: string)");
    expect(read('components/chippi/right-panel-tabs.tsx')).toContain("'workspace'");
    expect(read('lib/chippi/workspace-run-flag.ts')).toContain('CHIPPI_WORKSPACE_RUNS_SPACE_IDS');
    expect(read('app/s/[slug]/chippi/page.tsx')).toContain('workspaceRunsEnabled={isWorkspaceRunsEnabledForSpace(space.id)}');
    expect(read('app/broker/page.tsx')).toContain('workspaceRunsEnabled={false}');
    expect(read('components/chippi/chippi-workspace.tsx')).toContain(
      "workspaceRunsEnabled && input.name === 'continue_workspace_run'",
    );
  });
  it('requires a real VM Sandbox with no network or sandbox secrets', () => {
    const worker = read('agent/workspace_modal_app.py');
    expect(worker).toContain('experimental_options={"vm_runtime": True}');
    expect(worker).toContain('block_network=True');
    expect(worker).toContain('launch_workspace');
    expect(worker).toContain('await run_workspace.spawn.aio(item)');
    expect(worker).toContain('await sandbox.terminate.aio()');
  });
  it('persists ordered lifecycle evidence and private per-file links', () => {
    const migration = read('supabase/migrations/20260914000000_workspace_runs.sql');
    expect(migration).toContain('UNIQUE ("runId", sequence)');
    expect(migration).toContain('launchToken');
    expect(migration).toContain("'brief.md','launch-checklist.md','comps.csv','handoff.md'");
    expect(read('app/api/internal/workspace-runs/callback/route.ts')).toContain('p_files: terminal === \'completed\' ? publishedFiles : []');
    expect(read('components/chippi/workspace-run-panel.tsx')).toContain('/api/workspace-runs/${encodeURIComponent(runId)}/files/');
    expect(read('app/api/workspace-runs/[id]/files/[fileId]/route.ts')).toContain('requireSpaceOwner');
    expect(read('lib/work-sessions/engine.ts')).toContain('await dispatchWorkspaceRun');
    expect(read('app/api/internal/workspace-runs/callback/route.ts')).toContain("ignored: 'terminal'");
    expect(read('app/api/internal/workspace-runs/callback/route.ts')).toContain("ignored: 'duplicate_event'");
    expect(read('app/api/work-sessions/[id]/route.ts')).toContain("cancel_workspace_run_and_session");
    expect(read('lib/workspace-runs/server.ts')).toContain("claim_workspace_launch");
    expect(read('supabase/migrations/20260914000000_workspace_runs.sql')).toContain('cancel_workspace_run_and_session');
    expect(read('supabase/migrations/20260914000000_workspace_runs.sql')).toContain('finish_workspace_run_and_session');
    expect(read('supabase/migrations/20260914000000_workspace_runs.sql')).toContain('FOR UPDATE OF ws');
    expect(read('supabase/migrations/20260914000000_workspace_runs.sql')).toContain('count(DISTINCT wrf.name)');
    expect(read('lib/workspace-runs/server.ts')).toContain("run.status === 'completed' ? files ?? [] : []");
    expect(read('agent/workspace_modal_app.py')).toContain('_claim_launch(item)');
    expect(read('agent/workspace_modal_app.py')).toContain('"launch_token":launch_token');
    expect(read('app/api/internal/workspace-runs/launch-claim/route.ts')).toContain('accept_workspace_launch');
    expect(read('app/api/internal/workspace-runs/callback/route.ts')).toContain("ignored: 'stale_launch'");
    expect(read('supabase/migrations/20260914000000_workspace_runs.sql')).toContain("jsonb_to_recordset(p_files)");
    expect(read('supabase/migrations/20260914000000_workspace_runs.sql')).toContain('INSERT INTO "File"');
    expect(read('app/api/internal/workspace-runs/callback/route.ts')).not.toContain("from('File').upsert");
    expect(read('lib/workspace-runs/server.ts')).toContain('scheduleWorkspaceLaunchRecovery');
    expect(read('supabase/migrations/20260914000000_workspace_runs.sql')).toContain('"launchLeaseExpiresAt" < now()');
  });
  it('selects a named target then ranks same-area/type numeric comparisons', () => {
    const rows = [
      { id: 'target', address: '123 Ocean Ave', mlsNumber: 'ABC123', city: 'Miami', propertyType: 'Condo', listPrice: 500000, beds: 2, baths: 2, squareFeet: 1100 },
      { id: 'near', address: '125 Ocean Ave', city: 'Miami', propertyType: 'Condo', listPrice: 510000, beds: 2, baths: 2, squareFeet: 1080 },
      { id: 'far', address: '9 Inland Rd', city: 'Orlando', propertyType: 'House', listPrice: 900000, beds: 5, baths: 4, squareFeet: 3200 },
    ];
    const target = selectWorkspaceTarget('Build a packet for 123 Ocean Ave MLS ABC123', rows);
    expect(target?.id).toBe('target');
    expect(rankWorkspaceComparisons(target, rows)[0].row.id).toBe('near');
    expect(selectWorkspaceTarget('make a listing packet', rows)).toBeNull();
  });
});
