/**
 * Work-session planning transitions — the state machine's front door:
 * question-vs-plan, plan_first vs just_go, and failure on junk output.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// ── Supabase mock: getSession reads + patch captures ─────────────────────────
let sessionRow: Record<string, unknown> | null = null;
const patches: Record<string, unknown>[] = [];
let claimAvailable = true;
let claimError: Error | null = null;
let sessionReadError: Error | null = null;
let propertyRows: Array<Record<string, unknown>> = [];
let propertyError: Error | null = null;
const { dispatchWorkspaceRun } = vi.hoisted(() => ({
  dispatchWorkspaceRun: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_work_session_phase') {
        if (claimError) return { data: null, error: claimError };
        if (!claimAvailable || !sessionRow) return { data: false, error: null };
        sessionRow = {
          ...sessionRow,
          phaseClaimToken: args.p_token,
          phaseClaimKind: args.p_phase,
          phaseClaimKey: args.p_phase_key,
          phaseLeaseExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        };
        return { data: true, error: null };
      }
      if (name === 'patch_work_session_phase') {
        const owned = Boolean(
          sessionRow
          && sessionRow.phaseClaimToken === args.p_token
          && sessionRow.phaseClaimKind === args.p_phase
          && sessionRow.phaseClaimKey === args.p_phase_key,
        );
        if (!owned || !sessionRow) return { data: false, error: null };
        const patch = args.p_patch as Record<string, unknown>;
        patches.push(patch);
        sessionRow = { ...sessionRow, ...patch };
        if (args.p_release !== false) {
          sessionRow = {
            ...sessionRow,
            phaseClaimToken: null,
            phaseClaimKind: null,
            phaseClaimKey: null,
            phaseLeaseExpiresAt: null,
          };
        }
        return { data: true, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
    from: (table: string) => {
      const afterSelect: Record<string, unknown> = {
        eq: () => afterSelect,
        order: () => afterSelect,
        limit: async () => ({
          data: table === 'Property' ? propertyRows : [],
          error: table === 'Property' ? propertyError : null,
        }),
        maybeSingle: async () => ({
          data: table === 'WorkSession' && !sessionReadError ? sessionRow : null,
          error: table === 'WorkSession' ? sessionReadError : null,
        }),
      };
      return {
        select: () => afterSelect,
        update: (patch: Record<string, unknown>) => {
          patches.push(patch);
          return { eq: async () => ({}) };
        },
      };
    },
  },
}));

let llmContent = '{}';
const llmCreate = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm', () => ({
  resolveChatModel: () => process.env.OPENROUTER_API_KEY ? 'qwen/qwen3.7-plus' : 'gpt-4o-mini',
  getLLMClient: () => ({
    chat: { completions: { create: llmCreate } },
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/push', () => ({ sendPushToSpace: vi.fn(async () => 0) }));
vi.mock('@/lib/storage', () => ({ uploadObject: vi.fn(), buildKey: (...a: string[]) => a.join('/') }));
vi.mock('@/lib/ai-tools/agent-model', () => ({ getAgentModel: () => undefined }));
vi.mock('@/lib/ai-tools/sdk-bridge', () => ({ toSdkTool: vi.fn() }));
vi.mock('@/lib/ai-tools/tools', () => ({ ALL_TOOLS: [] }));
vi.mock('@openai/agents', () => ({ run: vi.fn(), Agent: class {} }));
vi.mock('@/lib/workspace-runs/server', () => ({ dispatchWorkspaceRun }));

import { executeSession, planSession } from '@/lib/work-sessions/engine';

function baseSession(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ws1',
    spaceId: 'sp1',
    goal: 'Prep the Henderson listing appointment',
    autonomy: 'plan_first',
    allowQuestions: true,
    status: 'planning',
    plan: [],
    findings: [],
    question: null,
    answer: null,
    ...over,
  };
}

beforeEach(() => {
  patches.length = 0;
  claimAvailable = true;
  claimError = null;
  sessionReadError = null;
  sessionRow = baseSession();
  propertyRows = [];
  propertyError = null;
  llmContent = '{"steps":[{"title":"Pull comps"},{"title":"Review the deal"}],"question":null}';
  llmCreate.mockReset();
  llmCreate.mockImplementation(async () => ({ choices: [{ message: { content: llmContent } }] }));
  dispatchWorkspaceRun.mockReset();
});

describe('planSession', () => {
  it('plan_first lands in awaiting_approval with the steps pending', async () => {
    const status = await planSession('ws1');
    expect(status).toBe('awaiting_approval');
    const patch = patches.at(-1)!;
    expect(patch.status).toBe('awaiting_approval');
    expect((patch.plan as { status: string }[]).every((s) => s.status === 'pending')).toBe(true);
  });

  it('just_go lands in running (caller executes immediately)', async () => {
    sessionRow = baseSession({ autonomy: 'just_go' });
    expect(await planSession('ws1')).toBe('running');
  });

  it('a clarifying question pauses in awaiting_input when questions are allowed', async () => {
    llmContent = '{"steps":[{"title":"Pull comps"}],"question":"Which Henderson — buyer or seller?"}';
    expect(await planSession('ws1')).toBe('awaiting_input');
    expect(patches.at(-1)!.question).toContain('Which Henderson');
  });

  it('the question is ignored when questions are disabled, and after an answer', async () => {
    llmContent = '{"steps":[{"title":"Pull comps"}],"question":"Which one?"}';
    sessionRow = baseSession({ allowQuestions: false });
    expect(await planSession('ws1')).toBe('awaiting_approval');

    sessionRow = baseSession({ answer: 'The seller appointment' });
    expect(await planSession('ws1')).toBe('awaiting_approval');
  });

  it('fails cleanly on junk output and on an empty plan', async () => {
    llmContent = 'not json at all';
    sessionRow = baseSession();
    expect(await planSession('ws1')).toBe('failed');

    llmContent = '{"steps":[]}';
    sessionRow = baseSession();
    expect(await planSession('ws1')).toBe('failed');
  });

  it('accepts a valid plan wrapped in prose without spending a corrective retry', async () => {
    llmContent = 'Here is the plan:\n{"steps":[{"title":"Pull comps"}],"question":null}\n';
    expect(await planSession('ws1')).toBe('awaiting_approval');
    expect(llmCreate).toHaveBeenCalledTimes(1);
  });

  it('retries one malformed planner response, then accepts the corrected response', async () => {
    llmCreate
      .mockImplementationOnce(async () => ({ choices: [{ message: { content: 'not json' } }] }))
      .mockImplementationOnce(async () => ({
        choices: [{ message: { content: '```json\n{"steps":[{"title":"Pull comps"}],"question":null}\n```' } }],
      }));

    expect(await planSession('ws1')).toBe('awaiting_approval');
    expect(llmCreate).toHaveBeenCalledTimes(2);
    expect(llmCreate.mock.calls[1]?.[0]?.messages.at(-1)?.content).toContain('usable planner object');
  });

  it('fails honestly after the bounded corrective retry is also unreadable', async () => {
    llmCreate
      .mockImplementationOnce(async () => ({ choices: [{ message: { content: 'not json' } }] }))
      .mockImplementationOnce(async () => ({ choices: [{ message: { content: 'still prose' } }] }));

    expect(await planSession('ws1')).toBe('failed');
    expect(llmCreate).toHaveBeenCalledTimes(2);
    expect(patches.at(-1)).toMatchObject({
      status: 'failed',
      error: 'Planning returned an unreadable plan.',
    });
  });

  it('does nothing when the session is not in planning', async () => {
    sessionRow = baseSession({ status: 'running' });
    expect(await planSession('ws1')).toBe('running');
    expect(patches.length).toBe(0);
  });

  it('does not call the planner and keeps the colliding delivery retryable', async () => {
    claimAvailable = false;
    await expect(planSession('ws1')).rejects.toThrow(/already leased/);
    expect(llmCreate).not.toHaveBeenCalled();
    expect(patches).toHaveLength(0);
  });

  it('discards a stale planner result after a recovery token replaces it', async () => {
    let resolvePlanner!: (value: unknown) => void;
    llmCreate.mockReturnValue(new Promise((resolve) => { resolvePlanner = resolve; }));
    const planning = planSession('ws1');
    await vi.waitFor(() => expect(llmCreate).toHaveBeenCalledTimes(1));
    sessionRow = { ...sessionRow!, phaseClaimToken: 'replacement-token-after-expired-lease' };
    resolvePlanner({ choices: [{ message: { content: llmContent } }] });

    expect(await planning).toBe('planning');
    expect(sessionRow!.plan).toEqual([]);
    expect(patches).toHaveLength(0);
  });

  it('fails closed when the database claim RPC is unavailable', async () => {
    claimError = new Error('database unavailable');
    await expect(planSession('ws1')).rejects.toThrow('database unavailable');
    expect(llmCreate).not.toHaveBeenCalled();
  });

  it('keeps a transient session read failure retryable instead of treating it as missing', async () => {
    sessionReadError = new Error('session read unavailable');
    await expect(planSession('ws1')).rejects.toThrow('session read unavailable');
    expect(llmCreate).not.toHaveBeenCalled();
  });

  it('refuses a stale recovery event after the session was linked to another run', async () => {
    sessionRow = baseSession({
      status: 'running',
      kind: 'workspace',
      workspaceRunId: 'run-current',
    });
    await executeSession('ws1', 'run-stale');
    expect(dispatchWorkspaceRun).not.toHaveBeenCalled();

    await executeSession('ws1', 'run-current');
    expect(dispatchWorkspaceRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-current', workSessionId: 'ws1' }),
    );
  });

  it('plans a workspace session from a matched property without calling the LLM', async () => {
    propertyRows = [{ id: 'prop-1', address: '12 Oak Street', mlsNumber: 'MLS12345' }];
    sessionRow = baseSession({
      kind: 'workspace',
      goal: 'Prep the 12 Oak Street listing packet',
      autonomy: 'plan_first',
    });

    expect(await planSession('ws1')).toBe('awaiting_approval');
    expect(llmCreate).not.toHaveBeenCalled();
    const plan = patches.at(-1)!.plan as Array<{ id: string; title: string; status: string }>;
    expect(plan).toHaveLength(4);
    expect(plan[0]).toMatchObject({
      id: 's1',
      title: 'Confirm target property: 12 Oak Street',
      status: 'pending',
    });
  });

  it('asks which property to use when workspace planning cannot identify one', async () => {
    propertyRows = [{ id: 'prop-1', address: '88 Pine', mlsNumber: 'OTHER99' }];
    sessionRow = baseSession({
      kind: 'workspace',
      goal: 'Build a listing packet',
      allowQuestions: true,
    });

    expect(await planSession('ws1')).toBe('awaiting_input');
    expect(llmCreate).not.toHaveBeenCalled();
    expect(patches.at(-1)).toMatchObject({
      status: 'awaiting_input',
      question: 'Which property should I use? Please provide the address or MLS number.',
    });
  });

  it('uses a generic first step when workspace questions are disabled and no property matches', async () => {
    sessionRow = baseSession({
      kind: 'workspace',
      goal: 'Build a listing packet',
      allowQuestions: false,
      autonomy: 'just_go',
    });

    expect(await planSession('ws1')).toBe('running');
    expect(llmCreate).not.toHaveBeenCalled();
    const plan = patches.at(-1)!.plan as Array<{ title: string }>;
    expect(plan).toHaveLength(4);
    expect(plan[0].title).toBe('Identify or flag the target property');
  });
});
