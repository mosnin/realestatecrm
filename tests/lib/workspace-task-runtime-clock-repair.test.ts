import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260915000019_workspace_task_runtime_clock_repair.sql'),
  'utf8',
);

describe('WorkspaceRunTask runtime timeout clock repair', () => {
  it('uses acceptance age only while launching', () => {
    expect(migration).toContain("task.status = 'launching'");
    expect(migration).toContain("task.\"modalAcceptedAt\" < now() - interval '5 minutes'");
    expect(migration).toContain("event.type = 'workspace_started'");
  });

  it('uses the fenced start/activity age after the task is running', () => {
    expect(migration).toContain("task.status = 'running'");
    expect(migration).toContain("task.\"updatedAt\" < now() - interval '5 minutes'");
  });

  it('preserves token, cancellation, and service-role fences', () => {
    expect(migration).toContain('task."launchToken" = p_launch_token');
    expect(migration).toContain('task."cancellationRequestedAt" IS NULL');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.fail_silent_accepted_workspace_run_task(text, text, text) FROM PUBLIC',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.fail_silent_accepted_workspace_run_task(text, text, text) TO service_role',
    );
  });
});
