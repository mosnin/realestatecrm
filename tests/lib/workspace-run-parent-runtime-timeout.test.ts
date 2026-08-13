import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260915000014_workspace_parent_runtime_timeout.sql',
  ),
  'utf8',
);

describe('parent WorkspaceRun runtime timeout SQL contract', () => {
  it('extends bounded candidate discovery only to stale, active running parents', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.list_workspace_run_recovery_candidates',
    );
    expect(migration).toContain("wr.status = 'running'");
    expect(migration).toContain("ws.status = 'running'");
    expect(migration).toContain("now() - interval '6 minutes'");
    expect(migration).toContain("'fail_runtime_timeout'");
    expect(migration).toContain('wr."cancellationRequestedAt" IS NULL');
    expect(migration).toContain('NULLIF(btrim(wr."launchToken"), \'\') IS NOT NULL');
  });

  it('defines a locked, token-fenced atomic terminal authority with private execution', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.fail_stale_running_workspace_run');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('FOR UPDATE OF ws');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('v_run."launchToken" IS DISTINCT FROM p_token');
    expect(migration).toContain("v_run.status <> 'running'");
    expect(migration).toContain("v_session.status <> 'running'");
    expect(migration).toContain('UPDATE public."WorkspaceRun"');
    expect(migration).toContain('UPDATE public."WorkSession"');
    expect(migration).toContain('INSERT INTO public."WorkspaceRunEvent"');
    expect(migration).toContain('INSERT INTO public."WorkspaceRunLaunchReceipt"');
    expect(migration).toContain('FROM PUBLIC');
    expect(migration).toContain('FROM anon');
    expect(migration).toContain('FROM authenticated');
    expect(migration).toContain('TO service_role');
  });
});
