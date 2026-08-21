import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const runDelegatedChildTurnMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai-tools/delegate-run', () => ({
  runDelegatedChildTurn: (...args: unknown[]) => runDelegatedChildTurnMock(...(args as [])),
}));

vi.mock('@/lib/agent/kill-switch', () => ({
  assertSpaceEnabled: vi.fn(async () => undefined),
}));

import { buildDelegateTaskTool } from '@/lib/ai-tools/tools/delegate-task';
import type { ToolContext } from '@/lib/ai-tools/types';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
    conversationId: 'conv_server',
  };
}

describe('Realtime specialist floor-manager durable contract', () => {
  beforeEach(() => {
    runDelegatedChildTurnMock.mockReset();
    runDelegatedChildTurnMock.mockResolvedValue({
      ok: true,
      summary: 'Done.',
      toolNames: [],
    });
  });

  it('links chat specialists to server-held conversation context, never a model-authored id', async () => {
    const tool = buildDelegateTaskTool();
    expect(Object.keys((tool.parameters as unknown as { shape: Record<string, unknown> }).shape)).toEqual(['goal']);
    await tool.handler(
      { goal: 'Email Jane', conversationId: 'conv_spoofed' } as { goal: string },
      makeCtx(),
    );
    expect(runDelegatedChildTurnMock).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ conversationId: 'conv_server' }),
      goal: 'Email Jane',
    });
    expect(JSON.stringify(runDelegatedChildTurnMock.mock.calls[0])).not.toContain('conv_spoofed');
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
