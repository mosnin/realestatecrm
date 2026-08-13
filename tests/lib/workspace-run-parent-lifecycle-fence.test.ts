import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('parent WorkspaceRun lifecycle fence contract', () => {
  it('routes every parent mutation through launch-token-fenced RPCs', () => {
    const route = read('app/api/internal/workspace-runs/callback/route.ts');
    const server = read('lib/workspace-runs/server.ts');
    expect(route).toContain("supabase.rpc('record_workspace_run_event'");
    expect(route).not.toContain("from('WorkspaceRunEvent').insert");
    expect(route).not.toContain("status: 'running', updatedAt");
    expect(route.match(/p_launch_token: launchToken/g)?.length).toBeGreaterThanOrEqual(3);
    expect(server).toContain('p_launch_token: input.launchToken');
    expect(read('agent/workspace_modal_app.py')).toContain('"launch_token":launch_token');
  });

  it('replaces and revokes the unfenced terminal function', () => {
    const migration = read('supabase/migrations/20260915000009_workspace_lifecycle_fence_repair.sql');
    expect(migration).toContain('DROP FUNCTION finish_workspace_run_and_session(text,text,text,text,integer,text,jsonb)');
    expect(migration).toContain('p_launch_token text');
    expect(migration).toContain('v_run."launchToken" IS DISTINCT FROM p_launch_token');
    expect(migration).toContain("p_type='workspace_started'");
    expect(migration).toContain("SET status='running'");
    expect(migration).toContain('ON CONFLICT ("runId",sequence) DO NOTHING');
    expect(migration).toContain('FROM PUBLIC');
    expect(migration).toContain('TO service_role');
  });
});
