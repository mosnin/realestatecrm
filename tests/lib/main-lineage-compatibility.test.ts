import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915000020_main_lineage_and_claim_invariants.sql'),
  'utf8',
);

describe('historical/current-main migration lineage compatibility', () => {
  it('reasserts every current-main delta whose historical version collided', () => {
    expect(migration).toContain('ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS language');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public."WorkSessionAction"');
    expect(migration).toContain("'awaiting_actions'");
    expect(migration).toContain('ALTER TABLE public."ChatUsage" ADD COLUMN IF NOT EXISTS "idempotencyKey"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_chatusage_idempotency');
  });

  it('aligns task claim tokens with the UUID-shaped timeout contract', () => {
    const claim = migration.match(
      /CREATE OR REPLACE FUNCTION public\.claim_workspace_run_task_launch\([\s\S]*?\n\$\$;/,
    )?.[0];
    expect(claim).toBeDefined();
    expect(claim).toContain("OR NULLIF(btrim(p_token), '') IS NULL");
    expect(claim).toContain("p_token !~* '^[0-9a-f]{8}-");
    expect(claim).toContain('r."spaceId" = p_space_id');
  });

  it('requires an optional swarm conversation to belong to the requested space', () => {
    const claim = migration.match(
      /CREATE OR REPLACE FUNCTION public\.create_claimed_swarm_run\([\s\S]*?\n\$\$;/,
    )?.[0];
    expect(claim).toBeDefined();
    expect(claim).toContain("OR NULLIF(btrim(p_launch_token), '') IS NULL");
    expect(claim).toContain('conversation."spaceId" = p_space_id');
    expect(claim).toContain("RETURN 'invalid_conversation'");
  });

  it('does not require a drifted historical Artifact check name to exist', () => {
    const workbench = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260908300000_chippi_workbench_artifacts.sql'),
      'utf8',
    );
    expect(workbench).toContain(
      'DROP CONSTRAINT IF EXISTS "Artifact_artifactType_check"',
    );
  });
});
