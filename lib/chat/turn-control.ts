import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversationMode } from '@/lib/chat/conversation-mode';

export type ConversationTurnSource = 'typed' | 'voice' | 'steer';
export type ConversationTurnStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ConversationTurnAttachment {
  id: string;
  filename: string;
  mimeType: string;
  isImage?: boolean;
  sizeBytes?: number;
}

export interface ConversationTurnRecord {
  id: string;
  spaceId: string;
  conversationId: string;
  mode: ConversationMode;
  source: ConversationTurnSource;
  clientRequestId: string;
  message: string;
  attachmentIds: string[];
  attachments: ConversationTurnAttachment[];
  priority: number;
  enqueueSeq: number;
  status: ConversationTurnStatus;
  attemptToken: string | null;
  attempts: number;
  leaseExpiresAt: string | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  terminalReason: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TurnTerminalOutcome {
  status: 'paused' | 'completed' | 'failed' | 'cancelled';
  reason: string;
  error?: string;
}

export type ConversationTurnSettler = (
  outcome: TurnTerminalOutcome,
) => Promise<ConversationTurnRecord | void>;

/** Translate the database's cancellation-wins result back to the SSE layer. */
export function settledConversationTurnOutcome(
  record: ConversationTurnRecord | void,
  fallback: TurnTerminalOutcome,
): TurnTerminalOutcome {
  if (!record) return fallback;
  if (!['paused', 'completed', 'failed', 'cancelled'].includes(record.status)) {
    throw new Error(`Conversation turn settlement returned ${record.status}.`);
  }
  return {
    status: record.status as TurnTerminalOutcome['status'],
    reason: record.terminalReason ?? fallback.reason,
    ...(record.status === 'failed'
      ? { error: record.lastError ?? fallback.error ?? 'Turn failed.' }
      : {}),
  };
}

export interface ConversationTurnRecoveryRecord {
  turnId: string;
  spaceId: string;
  conversationId: string;
  previousStatus: 'running' | 'paused';
  terminalStatus: 'cancelled';
  reason: 'execution_lease_expired' | 'approval_lease_expired';
  recoveredAt: string;
}

/** Durable receipt for one assistant transcript committed by one v2 attempt. */
export interface ConversationTurnAssistantCommitRecord {
  turnId: string;
  attemptToken: string;
  messageId: string;
  requestedStatus: TurnTerminalOutcome['status'];
  terminalStatus: TurnTerminalOutcome['status'];
  terminalReason: string;
  createdAt: string;
}

export interface ConversationTurnLeaseGuardian {
  /** Throws once attempt authority can no longer be proven. */
  assertActive(): void;
  /** Testable/manual renewal using the same bounded retry as the timer. */
  renewNow(): Promise<void>;
  /** Stop new renewals and await any renewal already in flight before commit. */
  prepareToCommit(): Promise<void>;
  /** Retire lease proof after the database returns an authoritative commit receipt. */
  commitSucceeded(): void;
  hasLostAuthority(): boolean;
  stop(): void;
}

function firstRow(data: unknown): ConversationTurnRecord {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || typeof (row as { id?: unknown }).id !== 'string') {
    throw new Error('Conversation turn operation returned no row.');
  }
  return row as ConversationTurnRecord;
}

function firstCommitRow(data: unknown): ConversationTurnAssistantCommitRecord {
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row
    || typeof row !== 'object'
    || typeof (row as { messageId?: unknown }).messageId !== 'string'
    || typeof (row as { terminalStatus?: unknown }).terminalStatus !== 'string'
  ) {
    throw new Error('Conversation turn assistant commit returned no receipt.');
  }
  return row as ConversationTurnAssistantCommitRecord;
}

function normalizeAttachmentIds(ids: readonly string[] | undefined): string[] {
  return (ids ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 20);
}

export async function enqueueConversationTurn(
  client: Pick<SupabaseClient, 'rpc'>,
  input: {
    turnId: string;
    spaceId: string;
    conversationId: string;
    mode: ConversationMode;
    source: ConversationTurnSource;
    clientRequestId: string;
    message: string;
    attachmentIds?: readonly string[];
    attachments?: readonly ConversationTurnAttachment[];
    activeTurnId?: string;
  },
): Promise<ConversationTurnRecord> {
  const { data, error } = await client.rpc('enqueue_conversation_turn', {
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_conversation_id: input.conversationId,
    p_mode: input.mode,
    p_source: input.source,
    p_client_request_id: input.clientRequestId,
    p_message: input.message,
    p_attachment_ids: normalizeAttachmentIds(input.attachmentIds),
    p_attachments: (input.attachments ?? []).slice(0, 20),
    p_active_turn_id: input.activeTurnId ?? null,
  });
  if (error) throw error;
  return firstRow(data);
}

export async function claimConversationTurn(
  client: Pick<SupabaseClient, 'rpc'>,
  input: {
    turnId: string;
    spaceId: string;
    conversationId: string;
    clientRequestId: string;
    message: string;
    attachmentIds?: readonly string[];
  },
): Promise<ConversationTurnRecord> {
  const { data, error } = await client.rpc('claim_conversation_turn', {
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_conversation_id: input.conversationId,
    p_client_request_id: input.clientRequestId,
    p_message: input.message,
    p_attachment_ids: normalizeAttachmentIds(input.attachmentIds),
  });
  if (error) throw error;
  return firstRow(data);
}

/** Token-fenced claim for callers that retain attempt authority through settle. */
export async function claimConversationTurnV2(
  client: Pick<SupabaseClient, 'rpc'>,
  input: {
    turnId: string;
    spaceId: string;
    conversationId: string;
    clientRequestId: string;
    message: string;
    attachmentIds?: readonly string[];
    leaseSeconds?: number;
  },
): Promise<ConversationTurnRecord> {
  const attemptToken = crypto.randomUUID();
  const { data, error } = await client.rpc('claim_conversation_turn_v2', {
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_conversation_id: input.conversationId,
    p_client_request_id: input.clientRequestId,
    p_message: input.message,
    p_attachment_ids: normalizeAttachmentIds(input.attachmentIds),
    p_attempt_token: attemptToken,
    p_lease_seconds: input.leaseSeconds ?? 900,
  });
  if (error) throw error;
  const record = firstRow(data);
  if (record.attemptToken !== attemptToken) {
    throw new Error('Conversation turn claim returned the wrong attempt token.');
  }
  return record;
}

export async function renewConversationTurnLease(
  client: Pick<SupabaseClient, 'rpc'>,
  input: {
    turnId: string;
    spaceId: string;
    conversationId: string;
    attemptToken: string;
    leaseSeconds?: number;
  },
): Promise<ConversationTurnRecord> {
  const { data, error } = await client.rpc('renew_conversation_turn_lease_v2', {
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_conversation_id: input.conversationId,
    p_attempt_token: input.attemptToken,
    p_lease_seconds: input.leaseSeconds ?? 900,
  });
  if (error) throw error;
  const record = firstRow(data);
  if (
    record.status !== 'running'
    || record.attemptToken !== input.attemptToken
    || !record.leaseExpiresAt
    || Date.parse(record.leaseExpiresAt) <= Date.now()
  ) {
    throw new Error('Conversation turn lease renewal returned inactive authority.');
  }
  return record;
}

/**
 * Keep one claimed attempt alive while its provider stream is active.
 *
 * Renewal runs at no more than one third of the lease duration. Two identical
 * attempts are safe because renewal is token-fenced and idempotent; after two
 * failures the guardian aborts execution and permanently closes the local
 * publication gate.
 */
export function startConversationTurnLeaseGuardian(
  client: Pick<SupabaseClient, 'rpc'>,
  input: {
    turnId: string;
    spaceId: string;
    conversationId: string;
    attemptToken: string;
    abortController: AbortController;
    leaseSeconds?: number;
    renewEveryMs?: number;
  },
): ConversationTurnLeaseGuardian {
  const leaseSeconds = Math.max(30, Math.min(Math.trunc(input.leaseSeconds ?? 900), 3600));
  const maxRenewEveryMs = Math.max(1_000, Math.floor((leaseSeconds * 1_000) / 3));
  const renewEveryMs = Math.max(
    1_000,
    Math.min(Math.trunc(input.renewEveryMs ?? 60_000), maxRenewEveryMs),
  );
  let stopped = false;
  let preparingToCommit = false;
  let preparedToCommit = false;
  let lostError: Error | null = null;
  let provenThroughMs: number | null = null;
  let renewal: Promise<void> | null = null;

  const loseAuthority = (cause: unknown): Error => {
    if (lostError) return lostError;
    lostError = new Error(
      'Conversation turn attempt authority could not be renewed.',
      { cause },
    );
    stopped = true;
    clearInterval(timer);
    try {
      input.abortController.abort(lostError);
    } catch {
      /* already aborted */
    }
    return lostError;
  };

  const expireLocalProof = (): void => {
    if (!lostError && provenThroughMs !== null && Date.now() >= provenThroughMs) {
      loseAuthority(new Error('Conversation turn lease proof expired locally.'));
    }
  };

  const doRenew = async (): Promise<void> => {
    if (stopped) {
      if (lostError) throw lostError;
      return;
    }
    if (renewal) return renewal;
    renewal = (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const renewed = await renewConversationTurnLease(client, {
            turnId: input.turnId,
            spaceId: input.spaceId,
            conversationId: input.conversationId,
            attemptToken: input.attemptToken,
            leaseSeconds,
          });
          provenThroughMs = Date.parse(renewed.leaseExpiresAt!);
          return;
        } catch (error) {
          // Ordinary shutdown ignores a late renewal failure. Commit
          // preparation must instead prove that an in-flight renewal won.
          if (stopped && !lostError && !preparingToCommit) return;
          lastError = error;
        }
      }
      throw loseAuthority(lastError);
    })().finally(() => {
      renewal = null;
    });
    return renewal;
  };

  const timer = setInterval(() => {
    void doRenew().catch(() => {
      /* loseAuthority already aborted and closed the gate */
    });
  }, renewEveryMs);
  const maybeNodeTimer = timer as ReturnType<typeof setInterval> & { unref?: () => void };
  maybeNodeTimer.unref?.();

  return {
    assertActive() {
      expireLocalProof();
      if (lostError) throw lostError;
      if (stopped && !preparedToCommit) {
        throw new Error('Conversation turn lease guardian is stopped.');
      }
    },
    renewNow: doRenew,
    async prepareToCommit() {
      if (lostError) throw lostError;
      if (preparedToCommit) return;
      if (stopped) throw new Error('Conversation turn lease guardian is stopped.');

      // Flip state synchronously before awaiting so a timer callback cannot
      // start a new renewal behind the token-fenced terminal commit.
      preparingToCommit = true;
      stopped = true;
      clearInterval(timer);
      try {
        const inFlight = renewal;
        if (inFlight) await inFlight;
        if (lostError) throw lostError;
        preparedToCommit = true;
      } finally {
        preparingToCommit = false;
      }
    },
    commitSucceeded() {
      if (lostError) throw lostError;
      if (!preparedToCommit) {
        throw new Error('Conversation turn commit was not prepared.');
      }
      // The atomic receipt is now the authority. The old running-lease
      // deadline must never suppress the terminal browser receipt.
      provenThroughMs = null;
    },
    hasLostAuthority() {
      expireLocalProof();
      return lostError !== null;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}

export async function finishConversationTurn(
  _client: Pick<SupabaseClient, 'rpc'>,
  _input: {
    turnId: string;
    spaceId: string;
    conversationId: string;
    outcome: TurnTerminalOutcome;
  },
): Promise<ConversationTurnRecord> {
  throw new Error('finishConversationTurn requires explicit v2 attempt authority.');
}

export async function finishConversationTurnV2(
  client: Pick<SupabaseClient, 'rpc'>,
  input: {
    turnId: string;
    spaceId: string;
    conversationId: string;
    attemptToken: string;
    outcome: TurnTerminalOutcome;
    pauseLeaseSeconds?: number;
  },
): Promise<ConversationTurnRecord> {
  const { data, error } = await client.rpc('finish_conversation_turn_v2', {
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_conversation_id: input.conversationId,
    p_attempt_token: input.attemptToken,
    p_status: input.outcome.status,
    p_terminal_reason: input.outcome.reason,
    p_error: input.outcome.error ?? null,
    // AgentPausedRun expires after 24 hours. Keep the parent queue lease on
    // the same clock so an expired review card cannot hold later messages for
    // another six days.
    p_pause_lease_seconds: input.pauseLeaseSeconds ?? 86400,
  });
  if (error) throw error;
  return firstRow(data);
}

/**
 * Atomically publish an assistant Message and terminally settle its exact
 * ConversationTurn v2 attempt. The caller supplies a stable messageId so an
 * ambiguous transport failure can retry this RPC without duplicating history.
 */
export async function commitConversationTurnAssistantV2(
  client: Pick<SupabaseClient, 'rpc'>,
  input: {
    turnId: string;
    spaceId: string;
    conversationId: string;
    attemptToken: string;
    messageId: string;
    content: string;
    blocks: readonly Record<string, unknown>[];
    outcome: TurnTerminalOutcome;
    pauseLeaseSeconds?: number;
  },
): Promise<ConversationTurnAssistantCommitRecord> {
  const { data, error } = await client.rpc('commit_conversation_turn_assistant_v2', {
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_conversation_id: input.conversationId,
    p_attempt_token: input.attemptToken,
    p_message_id: input.messageId,
    p_content: input.content,
    p_blocks: input.blocks,
    p_status: input.outcome.status,
    p_terminal_reason: input.outcome.reason,
    p_error: input.outcome.error ?? null,
    p_pause_lease_seconds: input.pauseLeaseSeconds ?? 86400,
  });
  if (error) throw error;
  return firstCommitRow(data);
}

export async function requestConversationTurnCancellation(
  client: Pick<SupabaseClient, 'rpc'>,
  input: { turnId: string; spaceId: string; conversationId: string },
): Promise<ConversationTurnRecord> {
  const { data, error } = await client.rpc('request_conversation_turn_cancel', {
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_conversation_id: input.conversationId,
  });
  if (error) throw error;
  return firstRow(data);
}

export async function requestConversationTurnCancellationV2(
  client: Pick<SupabaseClient, 'rpc'>,
  input: {
    turnId: string;
    spaceId: string;
    conversationId: string;
    attemptToken: string;
  },
): Promise<ConversationTurnRecord> {
  const { data, error } = await client.rpc('request_conversation_turn_cancel_v2', {
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_conversation_id: input.conversationId,
    p_attempt_token: input.attemptToken,
  });
  if (error) throw error;
  return firstRow(data);
}

export async function cancelQueuedConversationTurn(
  client: Pick<SupabaseClient, 'rpc'>,
  input: { turnId: string; spaceId: string; conversationId: string },
): Promise<ConversationTurnRecord> {
  const { data, error } = await client.rpc('cancel_queued_conversation_turn', {
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_conversation_id: input.conversationId,
  });
  if (error) throw error;
  return firstRow(data);
}

export async function resumePausedConversationTurn(
  client: Pick<SupabaseClient, 'rpc'>,
  input: { pausedRunId: string; turnId: string; spaceId: string; userId: string },
): Promise<ConversationTurnRecord> {
  const { data, error } = await client.rpc('resume_paused_conversation_turn', {
    p_paused_run_id: input.pausedRunId,
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_user_id: input.userId,
  });
  if (error) throw error;
  return firstRow(data);
}

export async function resumePausedConversationTurnV2(
  client: Pick<SupabaseClient, 'rpc'>,
  input: {
    pausedRunId: string;
    turnId: string;
    spaceId: string;
    userId: string;
    leaseSeconds?: number;
  },
): Promise<ConversationTurnRecord> {
  const attemptToken = crypto.randomUUID();
  const { data, error } = await client.rpc('resume_paused_conversation_turn_v2', {
    p_paused_run_id: input.pausedRunId,
    p_turn_id: input.turnId,
    p_space_id: input.spaceId,
    p_user_id: input.userId,
    p_attempt_token: attemptToken,
    p_lease_seconds: input.leaseSeconds ?? 900,
  });
  if (error) throw error;
  const record = firstRow(data);
  if (record.attemptToken !== attemptToken) {
    throw new Error('Conversation turn resume returned the wrong attempt token.');
  }
  return record;
}

export async function recoverExpiredConversationTurns(
  client: Pick<SupabaseClient, 'rpc'>,
  limit = 100,
): Promise<ConversationTurnRecoveryRecord[]> {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 500));
  const { data, error } = await client.rpc('recover_expired_conversation_turns', {
    p_limit: boundedLimit,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as ConversationTurnRecoveryRecord[];
}

export function queuedTurnOrder(
  turns: readonly ConversationTurnRecord[],
): ConversationTurnRecord[] {
  return turns
    .filter((turn) => turn.status === 'pending')
    .slice()
    .sort((a, b) => b.priority - a.priority || a.enqueueSeq - b.enqueueSeq);
}

/** Failed and approval-paused turns deliberately stop automatic queue drain. */
export function queueIsHeld(turns: readonly ConversationTurnRecord[]): boolean {
  return turns.some((turn) => turn.status === 'paused' || turn.status === 'failed');
}

export function nextDispatchableTurn(
  turns: readonly ConversationTurnRecord[],
): ConversationTurnRecord | null {
  if (queueIsHeld(turns)) return null;
  if (turns.some((turn) => turn.status === 'running')) return null;
  return queuedTurnOrder(turns)[0] ?? null;
}
