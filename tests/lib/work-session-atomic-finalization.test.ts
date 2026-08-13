import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('WorkSession atomic artifact and action finalization contract', () => {
  it('publishes File metadata and proposals only through one phase-fenced RPC', () => {
    const engine = read('lib/work-sessions/engine.ts');
    expect(engine).toContain("supabase.rpc('finalize_work_session_artifact'");
    expect(engine).not.toContain(".from('File')\n      .insert(");
    expect(engine).toContain('p_actions: proposals');
    expect(engine).toContain("finalStatus !== 'completed' && finalStatus !== 'awaiting_actions'");
  });

  it('keeps proposal generation pure and parent-locks action decisions', () => {
    const actions = read('lib/work-sessions/actions.ts');
    expect(actions).toContain('Promise<ProposedWorkSessionAction[]>');
    expect(actions).not.toContain("supabase.from('WorkSessionAction').insert(rows)");
    expect(actions).toContain("supabase.rpc('claim_work_session_action_decision_v2'");
    expect(actions).toContain("supabase.rpc('claim_work_session_action_execution'");
    expect(actions).toContain("supabase.rpc('finish_claimed_work_session_action_execution'");
  });

  it('defines private, search-path-pinned transaction authorities', () => {
    const migration = read(
      'supabase/migrations/20260915000021_work_session_atomic_finalization.sql',
    );
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.finalize_work_session_artifact');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.claim_work_session_action_decision');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.finish_work_session_action_execution');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('ON CONFLICT (id) DO NOTHING');
    expect(migration).toContain("v_session.status <> 'running'");
    expect(migration).toContain('v_session."phaseClaimToken" IS DISTINCT FROM p_token');
    expect(migration).toContain('v_session."phaseLeaseExpiresAt" < now()');
    expect(migration).toContain("v_session.status <> 'awaiting_actions'");
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.finalize_work_session_artifact',
    );

    const executionMigration = read(
      'supabase/migrations/20260915000024_work_session_action_execution_leases.sql',
    );
    expect(executionMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.claim_work_session_action_decision_v2',
    );
    expect(executionMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.finish_claimed_work_session_action_execution',
    );
  });
});
