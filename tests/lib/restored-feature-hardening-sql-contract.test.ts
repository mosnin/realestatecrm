import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260915000010_restored_feature_hardening.sql',
  ),
  'utf8',
);

describe('restored feature hardening SQL contract', () => {
  it('removes worker-id-only AgentJobRun mutations and fences their replacements', () => {
    expect(migration).toContain(
      'DROP FUNCTION IF EXISTS public.heartbeat_agent_job(uuid, text, integer)',
    );
    expect(migration).toContain(
      'DROP FUNCTION IF EXISTS public.finish_agent_job(uuid, text, text, jsonb, text, text)',
    );
    expect(migration).toContain('"leaseToken" = p_lease_token');
    expect(migration).toContain('"leaseGeneration" = p_lease_generation');
    expect(migration).toContain('"leaseExpiresAt" > now()');
  });

  it('repairs already-applied WorkspaceRunTask lifecycle overloads additively', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260915000012_workspace_task_lifecycle_fence_repair.sql'),
      'utf8',
    );

    expect(sql).toContain(
      'finish_workspace_run_task(text,text,text,text,integer,text,text,jsonb)',
    );
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.finish_workspace_run_task',
    );
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.claim_workspace_run_task_launch',
    );
    expect(sql).toContain('t."modalAcceptedAt" IS NULL');
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.record_workspace_run_task_event',
    );
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.finish_workspace_run_task',
    );
    expect(sql).toContain('v_task."launchToken" IS DISTINCT FROM p_launch_token');
  });

  it('requires the headless finisher to own a live active-session lease', () => {
    const finishBrowser = migration.match(
      /CREATE OR REPLACE FUNCTION public\.finish_headless_browser_worker\([\s\S]*?\n\$\$;/,
    )?.[0];

    expect(finishBrowser).toBeDefined();
    expect(finishBrowser).toContain("AND status = 'active'");
    expect(finishBrowser).toContain('AND "workerLeaseToken" = p_lease_token');
    expect(finishBrowser).toContain('AND "workerLeaseExpiresAt" > now()');
  });

  it('checks every durable schedule source against the requested space', () => {
    const materialize = migration.match(
      /CREATE OR REPLACE FUNCTION public\.materialize_schedule_occurrence\([\s\S]*?\n\$\$;/,
    )?.[0];

    expect(materialize).toBeDefined();
    expect(materialize).toContain('FROM public."Routine"');
    expect(materialize).toContain('FROM public."Workflow"');
    expect(materialize).toContain('FROM public."AgentTask"');
    expect(materialize?.match(/"spaceId" = p_space_id/g)).toHaveLength(5);
    expect(materialize).toContain('FOR KEY SHARE');
  });

  it('drops the free-form program RPC and applies least privilege to workspace RPCs', () => {
    expect(migration).toContain(
      'DROP FUNCTION IF EXISTS public.enqueue_workspace_run_task_with_program',
    );
    expect(migration).toContain("'record_workspace_run_event'");
    expect(migration).toContain("'finish_workspace_run_task'");
    expect(migration).toContain("'create_workspace_workbook_artifact'");
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION %s FROM authenticated",
    );
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION %s TO service_role');
  });
});
