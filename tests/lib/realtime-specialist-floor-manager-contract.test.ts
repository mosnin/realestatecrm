import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Realtime specialist floor-manager durable contract', () => {
  it('links future delegated runs to server-held conversation context', () => {
    const delegate = read('lib/ai-tools/tools/delegate-task.ts');
    expect(delegate).toContain('conversationId: ctx.conversationId');
    expect(delegate).not.toContain('conversationId: args.');
  });

  it('adds nullable conversation linkage and a service-only idempotent cancellation receipt', () => {
    const sql = read('supabase/migrations/20260915000006_realtime_swarm_floor_manager.sql');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "conversationId" text');
    expect(sql).toContain('ON DELETE SET NULL');
    expect(sql).toContain('swarm_run_space_conversation_created_idx');
    expect(sql).toContain('"RealtimeSwarmControlReceipt"');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('UNIQUE ("spaceId", "conversationId", "callId", action)');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("action = 'cancel_specialist_task'");
    expect(sql).toContain("status IN ('queued','planning','running','auditing')");
    expect(sql).toContain("VALUES (v_run.id, 'swarm_cancelled'");
    expect(sql).toContain("'no_run'");
    expect(sql).toContain("'already_terminal'");
    expect(sql).toContain('v_call_cutoff timestamptz := statement_timestamp()');
    expect(sql).toContain('"createdAt" <= v_call_cutoff');
    expect(sql).toContain("status IN ('completed','failed','cancelled')");
    expect(sql).toContain('RETURN QUERY SELECT v_receipt."runId", v_receipt.outcome, v_receipt.status, true');
    expect(sql).not.toContain('v_run.goal');
    expect(sql.indexOf('v_call_cutoff timestamptz := statement_timestamp()')).toBeLessThan(
      sql.indexOf('pg_advisory_xact_lock'),
    );
    expect(sql.indexOf('FROM public."RealtimeSwarmControlReceipt"')).toBeLessThan(
      sql.indexOf("status IN ('queued','planning','running','auditing')"),
    );
    expect(sql.indexOf("status IN ('completed','failed','cancelled')")).toBeLessThan(
      sql.indexOf("'already_terminal'::text"),
    );
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.cancel_conversation_swarm_run');
    expect(sql).toContain('TO service_role');
  });

  it('keeps cancellation available independently of the space kill switch', () => {
    const route = read('app/api/ai/realtime-delegate/route.ts');
    const controlStart = route.indexOf('if (specialistControl) {');
    const controlEnd = route.indexOf("if (body.action === 'continue_workspace_run')");
    expect(controlStart).toBeGreaterThan(-1);
    expect(controlEnd).toBeGreaterThan(controlStart);
    const controlBranch = route.slice(controlStart, controlEnd);
    expect(controlBranch).toContain("body.action === 'cancel_specialist_task'");
    // Starting a new specialist team is kill-switch gated; status and
    // cancellation remain available so an operator can still stop work.
    expect(controlBranch).not.toContain('assertSpaceEnabled');
  });
});
