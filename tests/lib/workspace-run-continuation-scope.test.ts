/**
 * Behavioral lock: conversation continuation looks up WorkSession /
 * WorkspaceRun through tenantTable so a dropped .eq cannot read another
 * workspace. Replaces the source-grep that required a literal
 * `.eq('spaceId', spaceId)` next to those queries.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/chippi/workspace-run-flag', () => ({
  isWorkspaceRunFollowUpsEnabledForSpace: vi.fn(() => true),
}));

const eqCalls: { table: string; column: string; value: unknown }[] = [];
const tableData: Record<string, unknown> = {
  WorkSession: [{ workspaceRunId: 'run_1' }],
  WorkspaceRun: [],
};

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const passthrough = ['select', 'order', 'limit', 'in', 'insert', 'upsert', 'update', 'delete'];
  for (const m of passthrough) chain[m] = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ table, column, value });
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null }));
  chain.single = vi.fn(() => Promise.resolve({ data: null }));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: tableData[table] ?? [] }).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { continueWorkspaceForConversation } from '@/lib/workspace-runs/conversation-continuation';

beforeEach(() => {
  eqCalls.length = 0;
});

describe('continueWorkspaceForConversation tenant scope', () => {
  it('scopes WorkSession and WorkspaceRun lookups to the caller space', async () => {
    const result = await continueWorkspaceForConversation({
      spaceId: 'space_caller',
      conversationId: 'conv_1',
      instruction: 'Please continue the packet for VICTIM at 555-0100',
      idempotencySeed: 'seed-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_completed');
    expect(eqCalls.filter((c) => c.table === 'WorkSession' && c.column === 'spaceId').map((c) => c.value)).toEqual([
      'space_caller',
    ]);
    expect(eqCalls.filter((c) => c.table === 'WorkSession' && c.column === 'conversationId').map((c) => c.value)).toEqual([
      'conv_1',
    ]);
    expect(eqCalls.filter((c) => c.table === 'WorkspaceRun' && c.column === 'spaceId').map((c) => c.value)).toEqual([
      'space_caller',
    ]);
    expect(JSON.stringify(result)).not.toContain('VICTIM');
    expect(JSON.stringify(result)).not.toContain('555-0100');
  });
});
