import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  claimConversationTurnV2,
  finishConversationTurnV2,
  recoverExpiredConversationTurns,
  renewConversationTurnLease,
  requestConversationTurnCancellationV2,
  resumePausedConversationTurnV2,
  startConversationTurnLeaseGuardian,
} from '@/lib/chat/turn-control';

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
const client = {
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === 'recover_expired_conversation_turns') {
      return {
        data: [{
          turnId: 'turn-1', spaceId: 'space-1', conversationId: 'conversation-1',
          previousStatus: 'running', terminalStatus: 'cancelled',
          reason: 'execution_lease_expired', recoveredAt: new Date().toISOString(),
        }],
        error: null,
      };
    }
    const token = args.p_attempt_token as string | undefined;
    return {
      data: [{
        id: 'turn-1',
        attemptToken: token ?? 'existing-token',
        attempts: 1,
        status: 'running',
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }],
      error: null,
    };
  }),
};

beforeEach(() => {
  calls.length = 0;
  client.rpc.mockClear();
});

describe('ConversationTurn attempt leases', () => {
  it('carries an opaque attempt token through fenced claim, renew, and finish', async () => {
    const claim = await claimConversationTurnV2(client as never, {
      turnId: 'turn-1',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      clientRequestId: 'request-1',
      message: 'Do the work',
      attachmentIds: ['attachment-1'],
    });
    expect(claim.attemptToken).toMatch(/^[0-9a-f-]{36}$/i);

    await renewConversationTurnLease(client as never, {
      turnId: 'turn-1',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      attemptToken: claim.attemptToken!,
    });
    await requestConversationTurnCancellationV2(client as never, {
      turnId: 'turn-1',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      attemptToken: claim.attemptToken!,
    });
    await finishConversationTurnV2(client as never, {
      turnId: 'turn-1',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      attemptToken: claim.attemptToken!,
      outcome: { status: 'completed', reason: 'done' },
    });

    expect(calls.map((call) => call.name)).toEqual([
      'claim_conversation_turn_v2',
      'renew_conversation_turn_lease_v2',
      'request_conversation_turn_cancel_v2',
      'finish_conversation_turn_v2',
    ]);
    expect(calls[1]?.args.p_attempt_token).toBe(claim.attemptToken);
    expect(calls[2]?.args.p_attempt_token).toBe(claim.attemptToken);
    expect(calls[3]?.args).toMatchObject({
      p_attempt_token: claim.attemptToken,
      p_status: 'completed',
      p_pause_lease_seconds: 86400,
    });
  });

  it('rotates authority for approval resume and bounds recovery scans', async () => {
    const resumed = await resumePausedConversationTurnV2(client as never, {
      pausedRunId: 'pause-1',
      turnId: 'turn-1',
      spaceId: 'space-1',
      userId: 'user-1',
    });
    expect(resumed.attemptToken).toMatch(/^[0-9a-f-]{36}$/i);

    await expect(recoverExpiredConversationTurns(client as never, 9999)).resolves.toMatchObject([
      { turnId: 'turn-1', previousStatus: 'running', terminalStatus: 'cancelled' },
    ]);
    expect(calls.at(-1)?.args).toEqual({ p_limit: 500 });
  });

  it('keeps recovery terminal and token-fenced in the additive SQL authority', () => {
    const sql = readFileSync(
      'supabase/migrations/20260915000027_conversation_turn_lease_recovery.sql',
      'utf8',
    );
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.finish_conversation_turn_v2');
    expect(sql).toContain('"attemptToken" IS DISTINCT FROM p_attempt_token');
    expect(sql).toContain("SET status = 'cancelled'");
    expect(sql).not.toContain("SET status = 'pending'");
    expect(sql).toContain('pg_try_advisory_xact_lock');
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain('WHERE paused_run."turnId" = v_turn.id AND paused_run.status = \'pending\'');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.recover_expired_conversation_turns(integer) FROM PUBLIC');
  });

  it('aborts execution and closes publication authority after renewal cannot be proven', async () => {
    const abortController = new AbortController();
    const failingClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: new Error('lease is no longer active'),
      }),
    };
    const guardian = startConversationTurnLeaseGuardian(failingClient as never, {
      turnId: 'turn-1',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      attemptToken: 'attempt-1',
      abortController,
      renewEveryMs: 60_000,
    });

    await expect(guardian.renewNow()).rejects.toThrow(/authority could not be renewed/i);
    expect(failingClient.rpc).toHaveBeenCalledTimes(2);
    expect(abortController.signal.aborted).toBe(true);
    expect(guardian.hasLostAuthority()).toBe(true);
    expect(() => guardian.assertActive()).toThrow(/authority could not be renewed/i);
  });

  it('quiesces an in-flight renewal before allowing terminal commit', async () => {
    let resolveRenewal!: (value: {
      data: Array<Record<string, unknown>>;
      error: null;
    }) => void;
    const renewalResult = new Promise<{
      data: Array<Record<string, unknown>>;
      error: null;
    }>((resolve) => {
      resolveRenewal = resolve;
    });
    const overlappingClient = {
      rpc: vi.fn(() => renewalResult),
    };
    const abortController = new AbortController();
    const guardian = startConversationTurnLeaseGuardian(overlappingClient as never, {
      turnId: 'turn-1',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      attemptToken: 'attempt-1',
      abortController,
      renewEveryMs: 60_000,
    });

    const renewal = guardian.renewNow();
    await vi.waitFor(() => expect(overlappingClient.rpc).toHaveBeenCalledTimes(1));
    let commitBarrierOpened = false;
    const prepare = guardian.prepareToCommit().then(() => {
      commitBarrierOpened = true;
    });
    await Promise.resolve();
    expect(commitBarrierOpened).toBe(false);

    resolveRenewal({
      data: [{
        id: 'turn-1',
        status: 'running',
        attemptToken: 'attempt-1',
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }],
      error: null,
    });
    await Promise.all([renewal, prepare]);

    expect(commitBarrierOpened).toBe(true);
    expect(abortController.signal.aborted).toBe(false);
    expect(() => guardian.assertActive()).not.toThrow();
    await guardian.renewNow();
    expect(overlappingClient.rpc).toHaveBeenCalledTimes(1);
  });

  it('closes publication locally when a paused process outlives its proven lease', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'));
      const abortController = new AbortController();
      const expiringClient = {
        rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => ({
          data: [{
            id: 'turn-1',
            status: 'running',
            attemptToken: args.p_attempt_token,
            leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          }],
          error: null,
        })),
      };
      const guardian = startConversationTurnLeaseGuardian(expiringClient as never, {
        turnId: 'turn-1',
        spaceId: 'space-1',
        conversationId: 'conversation-1',
        attemptToken: 'attempt-1',
        abortController,
        renewEveryMs: 300_000,
      });

      await guardian.renewNow();
      expect(guardian.hasLostAuthority()).toBe(false);
      vi.setSystemTime(new Date('2026-08-13T12:01:00.001Z'));

      expect(guardian.hasLostAuthority()).toBe(true);
      expect(abortController.signal.aborted).toBe(true);
      expect(() => guardian.assertActive()).toThrow(/authority could not be renewed/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retires the old lease deadline after an authoritative commit receipt', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'));
      const abortController = new AbortController();
      const committedClient = {
        rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => ({
          data: [{
            id: 'turn-1',
            status: 'running',
            attemptToken: args.p_attempt_token,
            leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          }],
          error: null,
        })),
      };
      const guardian = startConversationTurnLeaseGuardian(committedClient as never, {
        turnId: 'turn-1',
        spaceId: 'space-1',
        conversationId: 'conversation-1',
        attemptToken: 'attempt-1',
        abortController,
        renewEveryMs: 300_000,
      });

      await guardian.renewNow();
      await guardian.prepareToCommit();
      // This transition represents the atomic RPC's durable receipt.
      guardian.commitSucceeded();
      guardian.stop();
      vi.setSystemTime(new Date('2026-08-13T12:01:00.001Z'));

      expect(guardian.hasLostAuthority()).toBe(false);
      expect(abortController.signal.aborted).toBe(false);
      expect(() => guardian.assertActive()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('defines an atomic transcript receipt and strict terminal retry contract', () => {
    const sql = readFileSync(
      'supabase/migrations/20260915000028_conversation_turn_atomic_transcript.sql',
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public."ConversationTurnAssistantCommit"');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.commit_conversation_turn_assistant_v2');
    expect(sql).toContain('conversation turn assistant idempotency conflict');
    expect(sql).toContain('conversation turn terminal result conflict');
    expect(sql).toContain('INSERT INTO public."Message"');
    expect(sql.indexOf('INSERT INTO public."Message"')).toBeLessThan(
      sql.indexOf('INSERT INTO public."ConversationTurnAssistantCommit"'),
    );
  });
});
