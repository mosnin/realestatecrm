/**
 * Work-session ACTIONS — approval-gated execution + immutable audit trail.
 * Pins: proposal generation is pure, only schema-valid allowlisted rows leave
 * the generator, and approve/deny plus execution completion use parent-locked
 * database authorities rather than split child/parent writes.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// A mutating tool whose name is on ACTION_ALLOWLIST. `parameters` exposes the
// same `safeParse` contract the engine relies on (valid iff contactId + non-
// empty body), hand-rolled so it works inside the hoisted mock factory without
// importing zod above the hoist boundary.
const { addNoteTool } = vi.hoisted(() => ({
  addNoteTool: {
    name: 'add_note',
    description: 'Add a note to a contact',
    requiresApproval: true as const,
    parameters: {
      safeParse: (v: unknown) => {
        const o = (v ?? {}) as { contactId?: unknown; body?: unknown };
        return typeof o.contactId === 'string' && typeof o.body === 'string' && o.body.length > 0
          ? { success: true, data: { contactId: o.contactId, body: o.body } }
          : { success: false, error: { issues: [{ path: [], message: 'invalid' }] } };
      },
    },
    summariseCall: (a: { contactId: string; body: string }) =>
      `Note on ${a.contactId}: ${a.body.slice(0, 20)}`,
    rateLimit: { max: 10, windowSeconds: 60 },
    handler: () => Promise.resolve({ summary: 'noted' }),
  },
}));
vi.mock('@/lib/ai-tools/tools', () => ({ ALL_TOOLS: [addNoteTool] }));

const executeToolMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ai-tools/execute', () => ({ executeTool: executeToolMock }));

let llmContent = '{"actions":[]}';
vi.mock('@/lib/llm', () => ({
  resolveChatModel: () => process.env.OPENROUTER_API_KEY ? 'qwen/qwen3.7-plus' : 'gpt-4o-mini',
  getLLMClient: () => ({
    chat: { completions: { create: async () => ({ choices: [{ message: { content: llmContent } }] }) } },
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// Supabase mock: capture the parent-locking claim and finish authorities.
const db = vi.hoisted(() => ({
  actionRow: null as Record<string, unknown> | null, // what the claim returns
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  claimError: null as Error | null,
  finishError: null as Error | null,
  finishResult: true,
  space: { id: 'sp1', slug: 'sp', name: 'Space', ownerId: 'u1' } as Record<string, unknown> | null,
  owner: { clerkId: 'ck1' } as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase', () => {
  const chain = (table: string) => ({
    select: () => {
      const result = {
        eq: () => result,
        maybeSingle: async () => ({
          data: table === 'Space' ? db.space : table === 'User' ? db.owner : null,
          error: null,
        }),
      };
      return result;
    },
  });
  return {
    supabase: {
      from: chain,
      rpc: async (name: string, args: Record<string, unknown>) => {
        db.rpcCalls.push({ name, args });
        if (name === 'claim_work_session_action_decision') {
          if (db.claimError) return { data: null, error: db.claimError };
          return {
            data: db.actionRow
              ? [{ ...db.actionRow, status: args.p_decision === 'approve' ? 'approved' : 'denied' }]
              : [],
            error: null,
          };
        }
        if (name === 'finish_work_session_action_execution') {
          return { data: db.finishResult, error: db.finishError };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    },
  };
});

import {
  proposeActions,
  decideAction,
  proposableTools,
  workSessionActionRuntimeReadiness,
} from '@/lib/work-sessions/actions';

function session(over: Record<string, unknown> = {}) {
  return {
    id: 'ws1',
    spaceId: 'sp1',
    goal: 'Follow up with the Henderson lead',
    findings: [{ stepId: 's1', text: 'Contact c_123 asked about financing.' }],
    ...over,
  } as never;
}

beforeEach(() => {
  db.actionRow = null;
  db.rpcCalls.length = 0;
  db.claimError = null;
  db.finishError = null;
  db.finishResult = true;
  db.space = { id: 'sp1', slug: 'sp', name: 'Space', ownerId: 'u1' };
  db.owner = { clerkId: 'ck1' };
  executeToolMock.mockReset();
  delete process.env.WORK_SESSION_ACTIONS_DISABLED;
});

describe('proposableTools', () => {
  it('surfaces only allowlisted mutating tools', () => {
    expect(proposableTools().map((t) => t.name)).toEqual(['add_note']);
  });
});

describe('proposeActions', () => {
  it('is construction-only so Work sessions never fall into a human-review queue', async () => {
    expect(workSessionActionRuntimeReadiness()).toEqual({
      enabled: false,
      reason: 'direct_work_mode_execution_only',
    });
    llmContent = JSON.stringify({ actions: [{ tool: 'add_note', args: { contactId: 'c', body: 'x' } }] });
    expect(await proposeActions(session())).toEqual([]);
  });

  it.skip('legacy generator validation remains documented but is not runtime-reachable', async () => {
    llmContent = JSON.stringify({
      actions: [
        { tool: 'add_note', args: { contactId: 'c_123', body: 'Send financing options' }, rationale: 'Asked about financing' },
        { tool: 'add_note', args: { contactId: 'c_123' }, rationale: 'missing body — invalid' }, // dropped
        { tool: 'delete_everything', args: {}, rationale: 'not a tool' }, // dropped
      ],
    });
    const proposals = await proposeActions(session());
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      tool: 'add_note',
      args: { contactId: 'c_123', body: 'Send financing options' },
      rationale: 'Asked about financing',
    });
    expect(proposals[0].summary).toContain('Note on c_123');
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('proposes nothing when the model returns an empty list', async () => {
    llmContent = '{"actions":[]}';
    expect(await proposeActions(session())).toEqual([]);
  });

  it('is kill-switchable', async () => {
    process.env.WORK_SESSION_ACTIONS_DISABLED = '1';
    llmContent = JSON.stringify({ actions: [{ tool: 'add_note', args: { contactId: 'c', body: 'x' } }] });
    expect(await proposeActions(session())).toEqual([]);
  });
});

describe('decideAction', () => {
  it('does not claim or execute legacy approval rows while the review runtime is quarantined', async () => {
    db.actionRow = { id: 'a1', tool: 'add_note', args: { contactId: 'c_123', body: 'hi' } };
    expect(await decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'approve', spaceId: 'sp1', decidedByUserId: 'u1',
    })).toBeNull();
    expect(db.rpcCalls).toEqual([]);
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it.skip('legacy approve executor is retained for a future leased recovery rail', async () => {
    db.actionRow = { id: 'a1', tool: 'add_note', args: { contactId: 'c_123', body: 'hi' } };
    executeToolMock.mockResolvedValue({ ok: true, name: 'add_note', result: { summary: 'noted' } });

    const terminal = await decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'approve', spaceId: 'sp1', decidedByUserId: 'u1',
    });
    expect(terminal).toBe('executed');
    expect(executeToolMock).toHaveBeenCalledWith('add_note', { contactId: 'c_123', body: 'hi' }, expect.objectContaining({ userId: 'ck1' }));
    expect(db.rpcCalls).toEqual([
      {
        name: 'claim_work_session_action_decision',
        args: expect.objectContaining({ p_session_id: 'ws1', p_action_id: 'a1', p_decision: 'approve' }),
      },
      {
        name: 'finish_work_session_action_execution',
        args: expect.objectContaining({ p_terminal_status: 'executed', p_result: { summary: 'noted' } }),
      },
    ]);
  });

  it.skip('legacy failure receipt is retained for a future leased recovery rail', async () => {
    db.actionRow = { id: 'a1', tool: 'add_note', args: { contactId: 'c', body: 'x' } };
    executeToolMock.mockResolvedValue({ ok: false, name: 'add_note', error: { code: 'boom', message: 'exploded' } });
    const terminal = await decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'approve', spaceId: 'sp1', decidedByUserId: 'u1',
    });
    expect(terminal).toBe('failed');
    expect(db.rpcCalls.at(-1)).toEqual({
      name: 'finish_work_session_action_execution',
      args: expect.objectContaining({ p_terminal_status: 'failed', p_error: 'exploded' }),
    });
  });

  it.skip('legacy deny transition is retained for compatibility only', async () => {
    db.actionRow = { id: 'a1', tool: 'add_note', args: { contactId: 'c', body: 'x' } };
    const terminal = await decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'deny', spaceId: 'sp1', decidedByUserId: 'u1',
    });
    expect(terminal).toBe('denied');
    expect(executeToolMock).not.toHaveBeenCalled();
    expect(db.rpcCalls).toHaveLength(1);
  });

  it('unclaimable action (already decided / wrong tenant) → null, no execution', async () => {
    db.actionRow = null; // claim returns nothing
    const terminal = await decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'approve', spaceId: 'sp1', decidedByUserId: 'u1',
    });
    expect(terminal).toBeNull();
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it.skip('legacy parent-fence behavior is retained for a future leased recovery rail', async () => {
    db.actionRow = { id: 'a1', tool: 'add_note', args: { contactId: 'c', body: 'x' } };
    db.finishResult = false;
    executeToolMock.mockResolvedValue({ ok: true, name: 'add_note', result: {} });
    await expect(decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'approve', spaceId: 'sp1', decidedByUserId: 'u1',
    })).rejects.toThrow(/parent fence/);
  });

  it.skip('legacy claim parser is retained for a future leased recovery rail', async () => {
    db.actionRow = { id: 'wrong-action', tool: 'add_note', args: { contactId: 'c', body: 'x' } };
    await expect(decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'approve', spaceId: 'sp1', decidedByUserId: 'u1',
    })).rejects.toThrow(/Malformed/);
    expect(executeToolMock).not.toHaveBeenCalled();
  });
});
