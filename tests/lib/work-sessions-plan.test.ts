/**
 * Work-session planning transitions — the state machine's front door:
 * question-vs-plan, plan_first vs just_go, and failure on junk output.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// ── Supabase mock: getSession reads + patch captures ─────────────────────────
let sessionRow: Record<string, unknown> | null = null;
const patches: Record<string, unknown>[] = [];
const { dispatchWorkspaceRun } = vi.hoisted(() => ({
  dispatchWorkspaceRun: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: table === 'WorkSession' ? sessionRow : null }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        patches.push(patch);
        return { eq: async () => ({}) };
      },
    }),
  },
}));

let llmContent = '{}';
vi.mock('@/lib/llm', () => ({
  getLLMClient: () => ({
    chat: { completions: { create: async () => ({ choices: [{ message: { content: llmContent } }] }) } },
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
  sessionRow = baseSession();
  llmContent = '{"steps":[{"title":"Pull comps"},{"title":"Review the deal"}],"question":null}';
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

  it('does nothing when the session is not in planning', async () => {
    sessionRow = baseSession({ status: 'running' });
    expect(await planSession('ws1')).toBe('running');
    expect(patches.length).toBe(0);
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
});
