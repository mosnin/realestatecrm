import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260915000016_swarm_launch_fence.sql'),
  'utf8',
);

describe('SwarmRun launch fence SQL contract', () => {
  it('adds a durable launch receipt and fail-closed per-space concurrency', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public."SwarmRunLaunchReceipt"');
    expect(migration).toContain('CREATE UNIQUE INDEX');
    expect(migration).toContain("status IN ('queued','planning','running','auditing')");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_claimed_swarm_run');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.claim_swarm_launch');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("RETURN 'concurrent'");
  });

  it('token-fences acceptance, transitions, events, members, and timeout failure', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.accept_swarm_launch');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.transition_fenced_swarm_run');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.insert_fenced_swarm_member');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.insert_fenced_swarm_event');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.fail_stale_swarm_launch');
    expect(migration).toContain('"launchToken" IS DISTINCT FROM p_launch_token');
    expect(migration).toContain("interval '11 minutes'");
    expect(migration).toContain('INSERT INTO public."SwarmEvent"');
    expect(migration).toContain('SECURITY DEFINER');
  });

  it('keeps launch authorities private', () => {
    expect(migration).toContain('FROM PUBLIC');
    expect(migration).toContain("ARRAY['anon','authenticated']");
    expect(migration).toContain("EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I'");
    expect(migration).toContain('TO service_role');
  });
});
