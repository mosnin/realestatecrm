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
let claimAvailable = true;
let claimError: Error | null = null;
let contextReadError: Error | null = null;
let finalizationError: Error | null = null;
let finalizationReceiptOverride: unknown = undefined;
const fileRows: Record<string, unknown>[] = [];
const actionRows: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_work_session_phase') {
        if (claimError) return { data: null, error: claimError };
        if (!claimAvailable || !sessionRow) return { data: false, error: null };
        const activeLease = typeof sessionRow.phaseLeaseExpiresAt === 'string'
          && Date.parse(sessionRow.phaseLeaseExpiresAt) >= Date.now();
        if (sessionRow.phaseClaimToken && (sessionRow.phaseLeaseExpiresAt == null || activeLease)) {
          return { data: false, error: null };
        }
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
        const leaseLive = typeof sessionRow?.phaseLeaseExpiresAt === 'string'
          && Date.parse(sessionRow.phaseLeaseExpiresAt) >= Date.now();
        const owned = Boolean(
          sessionRow
          && sessionRow.phaseClaimToken === args.p_token
          && sessionRow.phaseClaimKind === args.p_phase
          && sessionRow.phaseClaimKey === args.p_phase_key
          && leaseLive
          && (args.p_phase === 'plan' ? sessionRow.status === 'planning' : sessionRow.status === 'running'),
        );
        if (!owned || !sessionRow) return { data: false, error: null };
        const patch = args.p_patch as Record<string, unknown>;
        patches.push(patch);
        sessionRow = { ...sessionRow, ...patch };
        if (args.p_release === false) {
          sessionRow = {
            ...sessionRow,
            phaseLeaseExpiresAt: new Date(Date.now() + 900_000).toISOString(),
          };
        } else {
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
      if (name === 'fail_empty_work_session_artifact') {
        const leaseLive = typeof sessionRow?.phaseLeaseExpiresAt === 'string'
          && Date.parse(sessionRow.phaseLeaseExpiresAt) >= Date.now();
        const owned = Boolean(
          sessionRow
          && sessionRow.status === 'running'
          && sessionRow.phaseClaimToken === args.p_token
          && sessionRow.phaseClaimKind === 'artifact'
          && sessionRow.phaseClaimKey === 'artifact'
          && leaseLive
          && Array.isArray(sessionRow.findings)
          && sessionRow.findings.length === 0,
        );
        if (!owned || !sessionRow) return { data: false, error: null };
        sessionRow = {
          ...sessionRow,
          status: 'failed',
          error: 'All research steps failed; no report was produced.',
          completedAt: null,
          phaseClaimToken: null,
          phaseClaimKind: null,
          phaseClaimKey: null,
          phaseLeaseExpiresAt: null,
        };
        return { data: true, error: null };
      }
      if (name === 'finalize_work_session_artifact') {
        if (finalizationError) return { data: null, error: finalizationError };
        const leaseLive = typeof sessionRow?.phaseLeaseExpiresAt === 'string'
          && Date.parse(sessionRow.phaseLeaseExpiresAt) >= Date.now();
        const owned = Boolean(
          sessionRow
          && sessionRow.status === 'running'
          && sessionRow.kind !== 'workspace'
          && sessionRow.phaseClaimToken === args.p_token
          && sessionRow.phaseClaimKind === 'artifact'
          && sessionRow.phaseClaimKey === 'artifact'
          && leaseLive,
        );
        if (!owned || !sessionRow) return { data: [], error: null };
        if (finalizationReceiptOverride !== undefined) {
          return { data: finalizationReceiptOverride, error: null };
        }
        const proposals = args.p_actions as Record<string, unknown>[];
        const file = args.p_file as Record<string, unknown>;
        const artifactFileId = `work-session-artifact-${'a'.repeat(32)}`;
        fileRows.push({ id: artifactFileId, ...file });
        actionRows.push(...proposals);
        const finalStatus = proposals.length > 0 ? 'awaiting_actions' : 'completed';
        sessionRow = {
          ...sessionRow,
          status: finalStatus,
          summary: args.p_summary,
          artifactFileId,
          artifactName: file.name,
          completedAt: proposals.length === 0 ? new Date().toISOString() : null,
          phaseClaimToken: null,
          phaseClaimKind: null,
          phaseClaimKey: null,
          phaseLeaseExpiresAt: null,
        };
        return {
          data: [{ finalStatus, artifactFileId, proposedCount: proposals.length }],
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === 'WorkSession'
                ? sessionRow
                : table === 'Space'
                  ? contextReadError
                    ? null
                    : { id: 'sp1', slug: 'sp', name: 'Space', ownerId: 'u1' }
                  : table === 'User'
                    ? { clerkId: 'ck1' }
                    : null,
            error: table === 'Space' ? contextReadError : null,
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        patches.push(patch);
        if (sessionRow) sessionRow = { ...sessionRow, ...patch };
        return { eq: async () => ({}) };
      },
    }),
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
vi.mock('@/lib/notifications', () => ({ createAppNotification: vi.fn(async () => null) }));
const uploadObject = vi.hoisted(() => vi.fn());
vi.mock('@/lib/storage', () => ({ uploadObject, buildKey: (...a: string[]) => a.join('/') }));
vi.mock('@/lib/ai-tools/agent-model', () => ({ getAgentModel: () => undefined }));
vi.mock('@/lib/ai-tools/sdk-bridge', () => ({ toSdkTool: vi.fn() }));
vi.mock('@/lib/ai-tools/tools', () => ({ ALL_TOOLS: [] }));
const proposalMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/work-sessions/actions', () => ({ proposeActions: proposalMock }));

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
  claimAvailable = true;
  claimError = null;
  contextReadError = null;
  finalizationError = null;
  finalizationReceiptOverride = undefined;
  fileRows.length = 0;
  actionRows.length = 0;
  agentRun.mockReset();
  agentRun.mockResolvedValue({ finalOutput: '3 comps: 12 Oak $410k, 9 Elm $395k, 4 Pine $402k' });
  llmContent = '{"title":"Henderson prep","markdown":"# Henderson prep\\n...","summary":"Ready."}';
  llmCreate.mockReset();
  llmCreate.mockImplementation(async () => ({ choices: [{ message: { content: llmContent } }] }));
  uploadObject.mockReset();
  uploadObject.mockResolvedValue(undefined);
  proposalMock.mockReset();
  proposalMock.mockResolvedValue([]);
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
    expect(sessionRow!.artifactFileId).toBe(`work-session-artifact-${'a'.repeat(32)}`);
    expect(fileRows).toHaveLength(1);
  });

  it('publishes proposals, File metadata, and awaiting-actions together', async () => {
    sessionRow = runningSession({
      plan: [{ id: 's1', title: 'Pull comps', status: 'done' }],
      findings: [{ stepId: 's1', text: 'findings' }],
    });
    proposalMock.mockResolvedValue([
      { tool: 'add_note', args: { contactId: 'c1', body: 'Call' }, summary: 'Add note', rationale: 'Finding' },
    ]);

    expect(await advanceSession('ws1')).toBe('done');
    expect(sessionRow!.status).toBe('awaiting_actions');
    expect(sessionRow!.completedAt).toBeNull();
    expect(fileRows).toHaveLength(1);
    expect(actionRows).toHaveLength(1);

    // An at-least-once redelivery sees the atomic parent state and cannot
    // upload or insert a second artifact/proposal set.
    expect(await advanceSession('ws1')).toBe('stopped');
    expect(uploadObject).toHaveBeenCalledTimes(1);
    expect(fileRows).toHaveLength(1);
    expect(actionRows).toHaveLength(1);
  });

  it('leaves no visible File/actions when cancellation wins after private upload', async () => {
    sessionRow = runningSession({
      plan: [{ id: 's1', title: 'Pull comps', status: 'done' }],
      findings: [{ stepId: 's1', text: 'findings' }],
    });
    proposalMock.mockResolvedValue([
      { tool: 'add_note', args: { contactId: 'c1', body: 'Call' }, summary: 'Add note', rationale: null },
    ]);
    uploadObject.mockImplementationOnce(async () => {
      sessionRow = { ...sessionRow!, status: 'cancelled' };
    });

    expect(await advanceSession('ws1')).toBe('stopped');
    expect(uploadObject).toHaveBeenCalledTimes(1); // private orphan is allowed
    expect(fileRows).toHaveLength(0);
    expect(actionRows).toHaveLength(0);
    expect(sessionRow!.status).toBe('cancelled');
  });

  it('leaves no visible File/actions when the lease expires during upload', async () => {
    sessionRow = runningSession({
      plan: [{ id: 's1', title: 'Pull comps', status: 'done' }],
      findings: [{ stepId: 's1', text: 'findings' }],
    });
    uploadObject.mockImplementationOnce(async () => {
      sessionRow = { ...sessionRow!, phaseLeaseExpiresAt: new Date(Date.now() - 1_000).toISOString() };
    });

    expect(await advanceSession('ws1')).toBe('stopped');
    expect(fileRows).toHaveLength(0);
    expect(actionRows).toHaveLength(0);
    expect(sessionRow!.status).toBe('running');
  });

  it('keeps a database crash atomic and retryable after private upload', async () => {
    sessionRow = runningSession({
      plan: [{ id: 's1', title: 'Pull comps', status: 'done' }],
      findings: [{ stepId: 's1', text: 'findings' }],
    });
    finalizationError = new Error('transaction aborted');
    await expect(advanceSession('ws1')).rejects.toThrow('transaction aborted');
    expect(uploadObject).toHaveBeenCalledTimes(1);
    expect(fileRows).toHaveLength(0);
    expect(actionRows).toHaveLength(0);
    expect(sessionRow!.status).toBe('running');
  });

  it('rejects a malformed finalization receipt', async () => {
    sessionRow = runningSession({
      plan: [{ id: 's1', title: 'Pull comps', status: 'done' }],
      findings: [{ stepId: 's1', text: 'findings' }],
    });
    finalizationReceiptOverride = [{ finalStatus: 'completed', artifactFileId: 'untrusted', proposedCount: 0 }];
    await expect(advanceSession('ws1')).rejects.toThrow(/Malformed/);
  });

  it('fails honestly instead of completing an empty report when every step was skipped', async () => {
    sessionRow = runningSession({
      plan: [
        { id: 's1', title: 'Pull comps', status: 'skipped' },
        { id: 's2', title: 'Review the deal', status: 'skipped' },
      ],
      findings: [],
    });

    expect(await advanceSession('ws1')).toBe('stopped');
    expect(agentRun).not.toHaveBeenCalled();
    expect(llmCreate).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
    expect(sessionRow!.status).toBe('failed');
    expect(sessionRow!.error).toBe('All research steps failed; no report was produced.');
  });

  it('stops cleanly for cancelled or missing sessions', async () => {
    sessionRow = runningSession({ status: 'cancelled' });
    expect(await advanceSession('ws1')).toBe('stopped');
    sessionRow = null;
    expect(await advanceSession('ws1')).toBe('stopped');
    expect(agentRun).not.toHaveBeenCalled();
  });

  it('keeps a colliding step delivery retryable without a second provider call', async () => {
    let resolveFirst!: (value: unknown) => void;
    agentRun.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    const first = advanceSession('ws1');
    await vi.waitFor(() => expect(agentRun).toHaveBeenCalledTimes(1));

    await expect(advanceSession('ws1')).rejects.toThrow(/already leased/);
    expect(agentRun).toHaveBeenCalledTimes(1);

    resolveFirst({ finalOutput: 'first owner findings' });
    expect(await first).toBe('more');
  });

  it('reclaims an expired step and rejects the stale attempt result', async () => {
    let resolveStale!: (value: unknown) => void;
    let resolveRecovery!: (value: unknown) => void;
    agentRun
      .mockReturnValueOnce(new Promise((resolve) => { resolveStale = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveRecovery = resolve; }));

    const stale = advanceSession('ws1');
    await vi.waitFor(() => expect(agentRun).toHaveBeenCalledTimes(1));
    sessionRow = { ...sessionRow!, phaseLeaseExpiresAt: new Date(Date.now() - 1_000).toISOString() };

    const recovery = advanceSession('ws1');
    await vi.waitFor(() => expect(agentRun).toHaveBeenCalledTimes(2));
    resolveStale({ finalOutput: 'stale findings must not land' });
    expect(await stale).toBe('stopped');

    resolveRecovery({ finalOutput: 'recovered findings' });
    expect(await recovery).toBe('more');
    expect(sessionRow!.findings).toEqual([{ stepId: 's1', text: 'recovered findings' }]);
  });

  it('serializes artifact generation and keeps the active duplicate retryable', async () => {
    sessionRow = runningSession({
      plan: [{ id: 's1', title: 'Pull comps', status: 'done' }],
      findings: [{ stepId: 's1', text: 'findings' }],
    });
    let resolveArtifact!: (value: unknown) => void;
    llmCreate.mockReturnValueOnce(new Promise((resolve) => { resolveArtifact = resolve; }));
    const first = advanceSession('ws1');
    await vi.waitFor(() => expect(llmCreate).toHaveBeenCalledTimes(1));

    await expect(advanceSession('ws1')).rejects.toThrow(/already leased/);
    expect(llmCreate).toHaveBeenCalledTimes(1);
    expect(uploadObject).not.toHaveBeenCalled();

    resolveArtifact({ choices: [{ message: { content: llmContent } }] });
    expect(await first).toBe('done');
    expect(uploadObject).toHaveBeenCalledTimes(1);
  });

  it('fails closed before tools run when the claim RPC errors', async () => {
    claimError = new Error('claim database unavailable');
    await expect(advanceSession('ws1')).rejects.toThrow('claim database unavailable');
    expect(agentRun).not.toHaveBeenCalled();
  });

  it('keeps a transient workspace context read failure retryable', async () => {
    contextReadError = new Error('workspace context unavailable');
    await expect(advanceSession('ws1')).rejects.toThrow('workspace context unavailable');
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
