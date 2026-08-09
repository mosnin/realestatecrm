/**
 * Work-session ACTIONS — approval-gated execution + immutable audit trail.
 * Pins: only schema-valid allowlisted proposals are stored, approve executes
 * the real tool and records the result, deny records without executing, the
 * proposed→decided claim is atomic (no double-execute), and the session
 * completes only when no proposed actions remain.
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
  getLLMClient: () => ({
    chat: { completions: { create: async () => ({ choices: [{ message: { content: llmContent } }] }) } },
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// Supabase mock: capture inserts + the claim update + the pending count.
const db = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  actionRow: null as Record<string, unknown> | null, // what the claim returns
  claimStatusFilter: null as string | null,
  updates: [] as Record<string, unknown>[],
  pendingCount: 0,
  space: { id: 'sp1', slug: 'sp', name: 'Space', ownerId: 'u1' } as Record<string, unknown> | null,
  owner: { clerkId: 'ck1' } as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase', () => {
  const chain = (table: string) => ({
    insert: (rows: Record<string, unknown>[]) => {
      if (table === 'WorkSessionAction') db.inserted.push(...rows);
      return Promise.resolve({ error: null });
    },
    update: (patch: Record<string, unknown>) => {
      db.updates.push({ table, ...patch });
      const b: Record<string, unknown> = {};
      const eq = (col: string, val: unknown) => {
        // Only record the ACTION claim's status gate (not the session-complete
        // update's), so the test asserts the atomic proposed→decided lock.
        if (col === 'status' && table === 'WorkSessionAction') db.claimStatusFilter = String(val);
        return proxy;
      };
      const proxy: Record<string, unknown> = {
        eq,
        select: () => ({ maybeSingle: async () => ({ data: table === 'WorkSessionAction' ? db.actionRow : null }) }),
        then: (res: (v: { data: null }) => void) => res({ data: null }),
      };
      void b;
      return proxy;
    },
    select: (_sel?: string, opts?: { count?: string; head?: boolean }) => {
      const result = {
        eq: () => result,
        order: async () => ({ data: [] }),
        maybeSingle: async () => ({
          data: table === 'Space' ? db.space : table === 'User' ? db.owner : null,
        }),
      } as Record<string, unknown>;
      if (opts?.count) {
        // head-count query for pending actions
        return { eq: () => ({ eq: async () => ({ count: db.pendingCount }) }) };
      }
      return result;
    },
  });
  return { supabase: { from: chain } };
});

import { proposeActions, decideAction, proposableTools } from '@/lib/work-sessions/actions';

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
  db.inserted.length = 0;
  db.updates.length = 0;
  db.claimStatusFilter = null;
  db.actionRow = null;
  db.pendingCount = 0;
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
  it('stores only schema-valid proposals, with a frozen summary', async () => {
    llmContent = JSON.stringify({
      actions: [
        { tool: 'add_note', args: { contactId: 'c_123', body: 'Send financing options' }, rationale: 'Asked about financing' },
        { tool: 'add_note', args: { contactId: 'c_123' }, rationale: 'missing body — invalid' }, // dropped
        { tool: 'delete_everything', args: {}, rationale: 'not a tool' }, // dropped
      ],
    });
    const n = await proposeActions(session());
    expect(n).toBe(1);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      tool: 'add_note',
      status: 'proposed',
      spaceId: 'sp1',
      sessionId: 'ws1',
    });
    expect(db.inserted[0].summary).toContain('Note on c_123');
  });

  it('proposes nothing when the model returns an empty list', async () => {
    llmContent = '{"actions":[]}';
    expect(await proposeActions(session())).toBe(0);
    expect(db.inserted).toHaveLength(0);
  });

  it('is kill-switchable', async () => {
    process.env.WORK_SESSION_ACTIONS_DISABLED = '1';
    llmContent = JSON.stringify({ actions: [{ tool: 'add_note', args: { contactId: 'c', body: 'x' } }] });
    expect(await proposeActions(session())).toBe(0);
  });
});

describe('decideAction', () => {
  it('approve → executes the tool and records the result', async () => {
    db.actionRow = { id: 'a1', tool: 'add_note', args: { contactId: 'c_123', body: 'hi' } };
    db.pendingCount = 0;
    executeToolMock.mockResolvedValue({ ok: true, name: 'add_note', result: { summary: 'noted' } });

    const terminal = await decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'approve', spaceId: 'sp1', decidedByUserId: 'u1',
    });
    expect(terminal).toBe('executed');
    expect(executeToolMock).toHaveBeenCalledWith('add_note', { contactId: 'c_123', body: 'hi' }, expect.objectContaining({ userId: 'ck1' }));
    // claim was gated on status='proposed' (atomic, no double-execute)
    expect(db.claimStatusFilter).toBe('proposed');
    // session completed since no pending remain
    expect(db.updates.some((u) => u.table === 'WorkSession' && u.status === 'completed')).toBe(true);
  });

  it('approve with a failing tool → records failed, does not complete-hide the error', async () => {
    db.actionRow = { id: 'a1', tool: 'add_note', args: { contactId: 'c', body: 'x' } };
    executeToolMock.mockResolvedValue({ ok: false, name: 'add_note', error: { code: 'boom', message: 'exploded' } });
    const terminal = await decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'approve', spaceId: 'sp1', decidedByUserId: 'u1',
    });
    expect(terminal).toBe('failed');
    expect(db.updates.some((u) => u.table === 'WorkSessionAction' && u.status === 'failed' && u.error === 'exploded')).toBe(true);
  });

  it('deny → records without executing', async () => {
    db.actionRow = { id: 'a1', tool: 'add_note', args: { contactId: 'c', body: 'x' } };
    const terminal = await decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'deny', spaceId: 'sp1', decidedByUserId: 'u1',
    });
    expect(terminal).toBe('denied');
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it('unclaimable action (already decided / wrong tenant) → null, no execution', async () => {
    db.actionRow = null; // claim returns nothing
    const terminal = await decideAction({
      sessionId: 'ws1', actionId: 'a1', decision: 'approve', spaceId: 'sp1', decidedByUserId: 'u1',
    });
    expect(terminal).toBeNull();
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it('does not complete the session while other actions are still pending', async () => {
    db.actionRow = { id: 'a1', tool: 'add_note', args: { contactId: 'c', body: 'x' } };
    db.pendingCount = 2; // more await decisions
    executeToolMock.mockResolvedValue({ ok: true, name: 'add_note', result: {} });
    await decideAction({ sessionId: 'ws1', actionId: 'a1', decision: 'approve', spaceId: 'sp1', decidedByUserId: 'u1' });
    expect(db.updates.some((u) => u.table === 'WorkSession' && u.status === 'completed')).toBe(false);
  });
});
