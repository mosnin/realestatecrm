import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260911000000_chippi_workbook_transform_rpc.sql'), 'utf8');

describe('workbook transformation SQL contract', () => {
  it('uses one locked compare-and-swap before appending the new immutable version', () => {
    expect(source).toContain('append_transformed_workbook_artifact_version');
    expect(source).toContain('FOR UPDATE');
    expect(source).toContain('v_current IS DISTINCT FROM p_source_version_id');
    expect(source).toContain('v_hash IS DISTINCT FROM p_expected_content_hash');
    expect(source).toContain("'workbook version is stale'");
    expect(source).toContain("'workbook content is stale'");
    expect(source).toContain("'chippi_transform'");
    expect(source).toContain('SECURITY INVOKER');
    const lock = source.indexOf('FOR UPDATE');
    const currentCheck = source.indexOf('v_current IS DISTINCT FROM p_source_version_id');
    const hashCheck = source.indexOf('v_hash IS DISTINCT FROM p_expected_content_hash');
    const insert = source.indexOf('INSERT INTO public."ArtifactVersion"');
    expect(lock).toBeGreaterThan(-1);
    expect(currentCheck).toBeGreaterThan(lock);
    expect(hashCheck).toBeGreaterThan(currentCheck);
    expect(insert).toBeGreaterThan(hashCheck);
  });

  it('leaves the generic user append RPC untouched and restricts the new RPC to service role', () => {
    expect(source).toContain('REVOKE ALL ON FUNCTION public.append_transformed_workbook_artifact_version');
    expect(source).toContain('TO service_role');
  });
});
