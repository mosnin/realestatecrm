import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260909000000_chippi_workbench_atomic_rpc.sql'), 'utf8');

describe('atomic Workbench SQL contract', () => {
  it('creates source/version/current pointer in one invoker transaction with service-only execution', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_workbook_artifact');
    expect(sql).toContain('LANGUAGE plpgsql SECURITY INVOKER');
    expect(sql).toContain('UPDATE public."Artifact" SET "currentVersionId" = v_id');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.create_workbook_artifact');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_workbook_artifact');
  });

  it('locks the workbook row before assigning the monotonic next version', () => {
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain('COALESCE(MAX("versionNumber"), 0) + 1');
    expect(sql).toContain('append_workbook_artifact_version');
    expect(sql).toContain('TO service_role');
  });

  it('returns the database-issued created_at in the original append migration', () => {
    // PostgreSQL cannot CREATE OR REPLACE a function while changing its
    // OUT-column type. Keeping this in the initial, unapplied migration is
    // what makes the append timestamp deployable.
    expect(sql).toContain('RETURNS TABLE(version_id text, version_number int, created_at timestamptz)');
    expect(sql).toContain('RETURNING id, "createdAt" INTO v_id, v_created');
    expect(sql).toContain('RETURN QUERY SELECT v_id, v_num, v_created');
  });
});
