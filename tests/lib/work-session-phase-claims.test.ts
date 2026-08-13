import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260915000008_work_session_phase_claims.sql'),
  'utf8',
);

describe('WorkSession phase claim migration', () => {
  it('serializes plan, step, and artifact provider phases with an opaque leased token', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION claim_work_session_phase');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('"phaseClaimToken"');
    expect(migration).toContain('"phaseLeaseExpiresAt"');
    expect(migration).toContain("p_phase NOT IN ('plan','step','artifact')");
    expect(migration).toContain('v_session."phaseLeaseExpiresAt" >= now()');
  });

  it('validates the current status and exact next step before granting a claim', () => {
    expect(migration).toContain("p_phase = 'plan' AND v_session.status <> 'planning'");
    expect(migration).toContain("p_phase IN ('step','artifact') AND v_session.status <> 'running'");
    expect(migration).toContain('WITH ORDINALITY');
    expect(migration).toContain('v_expected_key <> p_phase_key');
  });

  it('fences every phase patch on token, phase, key, unexpired lease, and live status', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION patch_work_session_phase');
    expect(migration).toContain('v_session."phaseClaimToken" <> p_token');
    expect(migration).toContain('v_session."phaseClaimKind" <> p_phase');
    expect(migration).toContain('v_session."phaseClaimKey" <> p_phase_key');
    expect(migration).toContain('v_session."phaseLeaseExpiresAt" < now()');
    expect(migration).toContain('RETURN false');
  });

  it('keeps phase authority server-only', () => {
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION claim_work_session_phase(text,text,text,text,integer) FROM PUBLIC',
    );
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION patch_work_session_phase(text,text,text,text,jsonb,boolean,integer) FROM PUBLIC',
    );
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION claim_work_session_phase');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION patch_work_session_phase');
  });
});
