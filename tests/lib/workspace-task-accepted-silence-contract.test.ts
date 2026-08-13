import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260915000013_workspace_task_accepted_silence_repair.sql',
  ),
  'utf8',
);

describe('WorkspaceRunTask accepted-silence repair contract', () => {
  it('keeps terminal timeout authority fixed, token-fenced, and least-privileged', () => {
    const rpc = migration.match(
      /CREATE OR REPLACE FUNCTION public\.fail_silent_accepted_workspace_run_task\([\s\S]*?\n\$\$;/,
    )?.[0];

    expect(rpc).toBeDefined();
    expect(rpc).toContain('SECURITY DEFINER');
    expect(rpc).toContain('SET search_path = public, pg_temp');
    expect(rpc).toContain("p_launch_token !~* '^[0-9a-f]{8}");
    expect(rpc).toContain("t.status IN ('launching', 'running')");
    expect(rpc).toContain('t."launchToken" = p_launch_token');
    expect(rpc).toContain('t."modalAcceptedAt" IS NOT NULL');
    expect(rpc).toContain("t.\"modalAcceptedAt\" < now() - interval '5 minutes'");
    expect(rpc).toContain('t."cancellationRequestedAt" IS NULL');
    expect(rpc).toContain("e.type = 'workspace_started'");
    expect(rpc).not.toContain('p_silence');

    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.fail_silent_accepted_workspace_run_task(text, text, text) FROM PUBLIC',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.fail_silent_accepted_workspace_run_task(text, text, text) FROM anon',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.fail_silent_accepted_workspace_run_task(text, text, text) FROM authenticated',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.fail_silent_accepted_workspace_run_task(text, text, text) TO service_role',
    );
  });
});
