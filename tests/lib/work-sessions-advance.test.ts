/**
 * advanceSession — the durable one-step-per-invocation execution unit behind
 * the Cloudflare queue path. Pins: exactly one step per call, idempotent
 * re-entry, failure → skipped (never a stuck session), artifact assembly on
 * the final advance, and clean stops for cancelled/missing sessions.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let sessionRow: Record<string, unknown> | null = null;
const patches: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === 'WorkSession'
                ? sessionRow
                : table === 'Space'
                  ? { id: 'sp1', slug: 'sp', name: 'Space', ownerId: 'u1' }
                  : table === 'User'
                    ? { clerkId: 'ck1' }
                    : null,
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        patches.push(patch);
        if (sessionRow) sessionRow = { ...sessionRow, ...patch };
        return { eq: async () => ({}) };
      },
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'file1' } }) }) }),
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
vi.mock('@/lib/notifications', () => ({ createAppNotification: vi.fn(async () => null) }));
vi.mock('@/lib/storage', () => ({ uploadObject: vi.fn(), buildKey: (...a: string[]) => a.join('/') }));
vi.mock('@/lib/ai-tools/agent-model', () => ({ getAgentModel: () => undefined }));
vi.mock('@/lib/ai-tools/sdk-bridge', () => ({ toSdkTool: vi.fn() }));
vi.mock('@/lib/ai-tools/tools', () => ({ ALL_TOOLS: [] }));

const agentRun = vi.hoisted(() => vi.fn());
vi.mock('@openai/agents', () => ({ run: agentRun, Agent: class {} }));

import { advanceSession, executeSession } from '@/lib/work-sessions/engine';

function runningSession(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ws1',
    spaceId: 'sp1',
    goal: 'Prep the Henderson listing appointment',
    autonomy: 'just_go',
    allowQuestions: false,
    status: 'running',
    plan: [
      { id: 's1', title: 'Pull comps', status: 'pending' },
      { id: 's2', title: 'Review the deal', status: 'pending' },
    ],
    findings: [],
    question: null,
    answer: null,
    ...over,
  };
}

beforeEach(() => {
  patches.length = 0;
  agentRun.mockReset();
  agentRun.mockResolvedValue({ finalOutput: '3 comps: 12 Oak $410k, 9 Elm $395k, 4 Pine $402k' });
  llmContent = '{"title":"Henderson prep","markdown":"# Henderson prep\\n...","summary":"Ready."}';
  sessionRow = runningSession();
});

describe('advanceSession', () => {
  it('executes exactly ONE step per call and reports more work', async () => {
    expect(await advanceSession('ws1')).toBe('more');
    expect(agentRun).toHaveBeenCalledTimes(1);
    const plan = (sessionRow!.plan as { status: string }[]);
    expect(plan[0].status).toBe('done');
    expect(plan[1].status).toBe('pending'); // untouched — next queued job's work
    expect((sessionRow!.findings as unknown[]).length).toBe(1);
  });

  it('skips already-done steps on re-entry (at-least-once delivery is safe)', async () => {
    sessionRow = runningSession({
      plan: [
        { id: 's1', title: 'Pull comps', status: 'done' },
        { id: 's2', title: 'Review the deal', status: 'pending' },
      ],
      findings: [{ stepId: 's1', text: 'already there' }],
    });
    await advanceSession('ws1');
    expect(agentRun).toHaveBeenCalledTimes(1);
    expect((sessionRow!.plan as { id: string; status: string }[])[1].status).toBe('done');
  });

  it('a failing step is skipped, not fatal — the session keeps moving', async () => {
    agentRun.mockRejectedValue(new Error('tool exploded'));
    expect(await advanceSession('ws1')).toBe('more');
    const plan = (sessionRow!.plan as { status: string; note?: string }[]);
    expect(plan[0].status).toBe('skipped');
    expect(sessionRow!.status).toBe('running'); // never wedged
  });

  it('assembles the deliverable when no pending steps remain', async () => {
    sessionRow = runningSession({
      plan: [
        { id: 's1', title: 'Pull comps', status: 'done' },
        { id: 's2', title: 'Review the deal', status: 'skipped' },
      ],
      findings: [{ stepId: 's1', text: 'findings' }],
    });
    expect(await advanceSession('ws1')).toBe('done');
    expect(agentRun).not.toHaveBeenCalled();
    expect(sessionRow!.status).toBe('completed');
    expect(sessionRow!.artifactFileId).toBe('file1');
  });

  it('stops cleanly for cancelled or missing sessions', async () => {
    sessionRow = runningSession({ status: 'cancelled' });
    expect(await advanceSession('ws1')).toBe('stopped');
    sessionRow = null;
    expect(await advanceSession('ws1')).toBe('stopped');
    expect(agentRun).not.toHaveBeenCalled();
  });
});

describe('executeSession (inline fallback)', () => {
  it('advances to completion in one invocation — same state machine', async () => {
    await executeSession('ws1');
    expect(agentRun).toHaveBeenCalledTimes(2); // both steps
    expect(sessionRow!.status).toBe('completed');
  });
});
