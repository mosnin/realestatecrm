import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260822043207_durable_work_session_production_contract.sql',
  ),
  'utf8',
);
const recovery = readFileSync(
  join(process.cwd(), 'lib/workspace-runs/recovery.ts'),
  'utf8',
);
const workerSchedule = readFileSync(
  join(process.cwd(), 'worker/src/schedule.ts'),
  'utf8',
);

describe('production durable WorkSession contract', () => {
  it('installs the schema and server-only authorities used by current main', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS kind');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION claim_work_session_phase');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION patch_work_session_phase');
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.finalize_work_session_artifact',
    );
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.claim_work_session_action_execution',
    );
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.list_recoverable_work_session_actions',
    );
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION claim_work_session_phase');
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.finalize_work_session_artifact',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.claim_work_session_action_execution',
    );
  });

  it('repairs lost enqueue windows without enabling the private workspace backlog', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.list_research_work_session_recovery_candidates',
    );
    expect(migration).toContain("session.\"updatedAt\" < now() - interval '10 minutes'");
    expect(migration).toContain('session.\"phaseLeaseExpiresAt\" < now()');
    expect(migration).not.toContain('CREATE TABLE IF NOT EXISTS public.\"WorkspaceRun\"');
    expect(migration).not.toContain(
      'CREATE OR REPLACE FUNCTION public.list_workspace_run_task_recovery_candidates',
    );
  });

  it('keeps the recurring recovery wake wired to the authoritative database scan', () => {
    expect(recovery).toContain("'list_research_work_session_recovery_candidates'");
    expect(recovery).toContain("plan ? 'work-session-plan' : 'work-session-advance'");
    expect(workerSchedule).toContain(
      "{ id: 'cron-workspace-run-recovery', path: '/api/cron/workspace-run-recovery', pattern: '*/5 * * * *' }",
    );
  });
});
