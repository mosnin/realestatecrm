import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/ai-tools/tools', () => ({ ALL_TOOLS: [] }));
vi.mock('@/lib/llm', () => ({
  resolveChatModel: () => 'test-model',
  getLLMClient: () => ({ chat: { completions: { create: vi.fn() } } }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const executeToolMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ai-tools/execute', () => ({ executeTool: executeToolMock }));

const enqueueMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queue', () => ({ enqueueWorkerTask: enqueueMock }));

const db = vi.hoisted(() => ({
  claimRows: [] as Array<Record<string, unknown>>,
  recoveryRows: [] as Array<Record<string, unknown>>,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  finishResult: true,
  releaseResult: true,
}));

vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({
        data: table === 'Space'
          ? { id: 'space-1', slug: 'space', name: 'Space', ownerId: 'owner-1' }
          : table === 'User'
            ? { clerkId: 'clerk-owner-1' }
            : null,
        error: null,
      }),
    };
    return chain;
  };
  return {
    supabase: {
      from,
      rpc: async (name: string, args: Record<string, unknown>) => {
        db.rpcCalls.push({ name, args });
        if (name === 'claim_work_session_action_execution') {
          return { data: db.claimRows, error: null };
        }
        if (name === 'finish_claimed_work_session_action_execution') {
          return { data: db.finishResult, error: null };
        }
        if (name === 'release_work_session_action_execution_claim') {
          return { data: db.releaseResult, error: null };
        }
        if (name === 'list_recoverable_work_session_actions') {
          return { data: db.recoveryRows, error: null };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    },
  };
});

import {
  executeApprovedWorkSessionAction,
  reconcileWorkSessionActionExecutions,
} from '@/lib/work-sessions/actions';

const input = { sessionId: 'session-1', actionId: 'action-1', spaceId: 'space-1' };

beforeEach(() => {
  db.claimRows = [];
  db.recoveryRows = [];
  db.rpcCalls.length = 0;
  db.finishResult = true;
  db.releaseResult = true;
  executeToolMock.mockReset();
  enqueueMock.mockReset().mockResolvedValue(true);
});

describe('durable WorkSession action execution', () => {
  it('passes the stable action-scoped provider key and token-fences completion', async () => {
    db.claimRows = [{
      disposition: 'claimed',
      id: 'action-1',
      tool: 'send_email',
      args: { toEmail: 'buyer@example.com', subject: 'Hello', body: 'Body' },
      executionIdempotencyKey: 'work-session-action-0123456789abcdef0123456789abcdef',
      executionAttempts: 1,
    }];
    executeToolMock.mockResolvedValue({
      ok: true,
      name: 'send_email',
      result: { summary: 'sent', display: 'success' },
    });

    await expect(executeApprovedWorkSessionAction(input)).resolves.toEqual({
      status: 'executed',
      attempts: 1,
    });

    expect(executeToolMock).toHaveBeenCalledWith(
      'send_email',
      expect.objectContaining({ toEmail: 'buyer@example.com' }),
      expect.objectContaining({
        userId: 'clerk-owner-1',
        executionIdempotencyKey: 'work-session-action-0123456789abcdef0123456789abcdef',
      }),
    );
    const claim = db.rpcCalls.find((call) => call.name === 'claim_work_session_action_execution');
    const finish = db.rpcCalls.find((call) => call.name === 'finish_claimed_work_session_action_execution');
    expect(claim?.args.p_claim_token).toMatch(/^[0-9a-f-]{36}$/i);
    expect(finish?.args).toMatchObject({
      p_claim_token: claim?.args.p_claim_token,
      p_terminal_status: 'executed',
      p_reconciliation_required: false,
    });
  });

  it('releases a transient provider failure and throws so Cloudflare retries', async () => {
    db.claimRows = [{
      disposition: 'claimed',
      id: 'action-1',
      tool: 'send_email',
      args: { toEmail: 'buyer@example.com', subject: 'Hello', body: 'Body' },
      executionIdempotencyKey: 'work-session-action-11111111111111111111111111111111',
      executionAttempts: 2,
    }];
    executeToolMock.mockResolvedValue({
      ok: false,
      name: 'send_email',
      error: { code: 'handler_error', message: 'Resend temporarily unavailable' },
    });

    await expect(executeApprovedWorkSessionAction(input)).rejects.toThrow(
      /Resend temporarily unavailable/,
    );
    const claim = db.rpcCalls.find((call) => call.name === 'claim_work_session_action_execution');
    expect(db.rpcCalls.find((call) => call.name === 'release_work_session_action_execution_claim')?.args)
      .toMatchObject({ p_claim_token: claim?.args.p_claim_token });
    expect(db.rpcCalls.some((call) => call.name === 'finish_claimed_work_session_action_execution'))
      .toBe(false);
  });

  it('terminally records known provider rejections and reconciles ambiguous retries', async () => {
    db.claimRows = [{
      disposition: 'claimed',
      id: 'action-1',
      tool: 'send_email',
      args: { toEmail: 'buyer@example.com', subject: 'Hello', body: 'Body' },
      executionIdempotencyKey: 'work-session-action-33333333333333333333333333333333',
      executionAttempts: 1,
    }];
    executeToolMock.mockResolvedValue({
      ok: true,
      name: 'send_email',
      result: {
        summary: 'Send failed: invalid address',
        display: 'error',
        durableExecutionDisposition: 'terminal_failure',
      },
    });

    await expect(executeApprovedWorkSessionAction(input)).resolves.toEqual({
      status: 'failed', attempts: 1,
    });
    expect(db.rpcCalls.find((call) => call.name === 'finish_claimed_work_session_action_execution')?.args)
      .toMatchObject({ p_terminal_status: 'failed', p_reconciliation_required: false });
    expect(db.rpcCalls.some((call) => call.name === 'release_work_session_action_execution_claim'))
      .toBe(false);

    db.rpcCalls.length = 0;
    db.claimRows = [{
      disposition: 'claimed',
      id: 'action-1',
      tool: 'send_email',
      args: { toEmail: 'buyer@example.com', subject: 'Hello', body: 'Body' },
      executionIdempotencyKey: 'work-session-action-33333333333333333333333333333333',
      executionAttempts: 2,
    }];
    executeToolMock.mockResolvedValue({
      ok: true,
      name: 'send_email',
      result: {
        summary: 'Send failed: compliance changed',
        display: 'error',
        durableExecutionDisposition: 'terminal_failure',
      },
    });
    await executeApprovedWorkSessionAction(input);
    expect(db.rpcCalls.find((call) => call.name === 'finish_claimed_work_session_action_execution')?.args)
      .toMatchObject({ p_reconciliation_required: true });
  });

  it('never calls a provider for legacy approved rows or unsupported tools', async () => {
    db.claimRows = [{
      disposition: 'reconciliation_required',
      id: 'action-1',
      executionAttempts: 0,
    }];
    await expect(executeApprovedWorkSessionAction(input)).resolves.toEqual({
      status: 'reconciliation_required',
      attempts: 0,
    });
    expect(executeToolMock).not.toHaveBeenCalled();

    db.rpcCalls.length = 0;
    db.claimRows = [{
      disposition: 'claimed',
      id: 'action-1',
      tool: 'add_note',
      args: { contactId: 'contact-1', body: 'Note' },
      executionIdempotencyKey: 'work-session-action-22222222222222222222222222222222',
      executionAttempts: 1,
    }];
    await expect(executeApprovedWorkSessionAction(input)).resolves.toEqual({
      status: 'failed',
      attempts: 1,
    });
    expect(executeToolMock).not.toHaveBeenCalled();
    expect(db.rpcCalls.find((call) => call.name === 'finish_claimed_work_session_action_execution')?.args)
      .toMatchObject({
        p_terminal_status: 'failed',
        p_reconciliation_required: true,
      });
  });

  it('uses recovery rows only as tenant-scoped queue wake-ups', async () => {
    db.recoveryRows = [
      { sessionId: 'session-1', actionId: 'action-1', spaceId: 'space-1' },
      { sessionId: 'session-2', actionId: 'action-2', spaceId: 'space-2' },
    ];

    await expect(reconcileWorkSessionActionExecutions(20)).resolves.toEqual({
      scanned: 2,
      enqueued: 2,
    });
    expect(enqueueMock).toHaveBeenNthCalledWith(1, 'work-session-action-execute', {
      sessionId: 'session-1', actionId: 'action-1', spaceId: 'space-1',
    });
    expect(enqueueMock).toHaveBeenNthCalledWith(2, 'work-session-action-execute', {
      sessionId: 'session-2', actionId: 'action-2', spaceId: 'space-2',
    });
  });
});
