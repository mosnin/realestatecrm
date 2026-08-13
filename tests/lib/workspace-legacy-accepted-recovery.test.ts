import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260915000018_workspace_legacy_accepted_recovery.sql'),
  'utf8',
);

describe('legacy accepted Workspace recovery migration', () => {
  it('keeps terminal recovery token-fenced and age-bounded', () => {
    expect(migration).toContain('FOR UPDATE OF ws');
    expect(migration).toContain('v_run."launchToken" IS DISTINCT FROM p_token');
    expect(migration).toContain("v_run.\"modalAcceptedAt\" >= now() - interval '4 minutes'");
    expect(migration).toContain('v_run."cancellationRequestedAt" IS NOT NULL');
  });

  it('does not require a pre-receipt row during an upgrade', () => {
    expect(migration).toContain('IF v_attempt IS NOT NULL THEN');
    expect(migration).not.toContain('workspace launch claim receipt missing');
    expect(migration).toContain("status = 'failed'");
  });

  it('retains server-only execution privileges', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.fail_stale_accepted_workspace_launch(text,text,text) FROM PUBLIC',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.fail_stale_accepted_workspace_launch(text,text,text) TO service_role',
    );
  });
});
