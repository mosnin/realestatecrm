import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260915000017_work_session_empty_artifact_failure.sql'),
  'utf8',
);

describe('empty WorkSession artifact failure migration', () => {
  it('fences the terminal transition on the current live artifact claim', () => {
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('v_session."phaseClaimToken" <> p_token');
    expect(migration).toContain("v_session.\"phaseClaimKind\" IS DISTINCT FROM 'artifact'");
    expect(migration).toContain('v_session."phaseLeaseExpiresAt" < now()');
  });

  it('requires a terminal plan with no findings and records an honest failure', () => {
    expect(migration).toContain("jsonb_array_length(COALESCE(v_session.findings, '[]'::jsonb)) <> 0");
    expect(migration).toContain("NOT IN ('done', 'skipped')");
    expect(migration).toContain("status = 'failed'");
    expect(migration).toContain('All research steps failed; no report was produced.');
  });

  it('keeps the transition service-role only', () => {
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION fail_empty_work_session_artifact(text,text) FROM PUBLIC',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION fail_empty_work_session_artifact(text,text) TO service_role',
    );
  });
});
