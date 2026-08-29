/**
 * Restore a chat-turn approval prompt from a persisted AgentPausedRun.
 *
 * Live `permission_required` events populate the card while the tab is open.
 * After reload the SSE is gone, but the checkpoint row is still the source
 * of truth — without this mapping the paused turn holds the queue with no
 * visible Approve/Deny control.
 */

export interface RestoredPendingApproval {
  requestId: string;
  callId: string;
  name: string;
  args: Record<string, unknown>;
  summary: string;
  otherPendingCalls?: Array<{
    callId: string;
    name: string;
    args: Record<string, unknown>;
    summary: string;
  }>;
}

interface StoredApproval {
  callId: string;
  toolName: string;
  arguments: unknown;
  summary: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseStoredApproval(value: unknown): StoredApproval | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const callId = typeof row.callId === 'string' ? row.callId : '';
  const toolName = typeof row.toolName === 'string' ? row.toolName : '';
  const summary = typeof row.summary === 'string' ? row.summary : '';
  if (!callId && !toolName) return null;
  return {
    callId,
    toolName,
    arguments: row.arguments,
    summary,
  };
}

function isExpired(expiresAt: unknown, nowMs: number): boolean {
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) return false;
  const expiresMs = Date.parse(expiresAt);
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

export function pendingApprovalFromPausedRun(
  row: {
    id?: unknown;
    status?: unknown;
    expiresAt?: unknown;
    approvals?: unknown;
  },
  nowMs: number = Date.now(),
): RestoredPendingApproval | null {
  if (typeof row.id !== 'string' || !row.id) return null;
  if (row.status !== 'pending') return null;
  if (isExpired(row.expiresAt, nowMs)) return null;

  const approvals = Array.isArray(row.approvals)
    ? row.approvals.map(parseStoredApproval).filter((item): item is StoredApproval => item !== null)
    : [];
  const first = approvals[0];
  if (!first) return null;

  const otherPendingCalls = approvals.slice(1).map((item) => ({
    callId: item.callId,
    name: item.toolName,
    args: asRecord(item.arguments),
    summary: item.summary,
  }));

  return {
    requestId: row.id,
    callId: first.callId,
    name: first.toolName,
    args: asRecord(first.arguments),
    summary: first.summary,
    ...(otherPendingCalls.length > 0 ? { otherPendingCalls } : {}),
  };
}

/** Prefer the checkpoint linked to this turn; otherwise the newest pending row. */
export function pickPausedRunForTurn<T extends { turnId?: unknown; createdAt?: unknown }>(
  rows: readonly T[],
  turnId: string,
): T | null {
  if (rows.length === 0) return null;
  const matched = rows.find((row) => row.turnId === turnId);
  if (matched) return matched;
  return [...rows].sort((a, b) => {
    const aAt = typeof a.createdAt === 'string' ? a.createdAt : '';
    const bAt = typeof b.createdAt === 'string' ? b.createdAt : '';
    return bAt.localeCompare(aAt);
  })[0] ?? null;
}

/**
 * Hydrate a restored approval only when this tab is idle on the same
 * conversation. A live SSE prompt or an in-flight stream owns the card.
 */
export function restorePendingApprovalIfIdle(input: {
  current: RestoredPendingApproval | null;
  restored: RestoredPendingApproval | null;
  streaming: boolean;
  loadedConversationId: string;
  activeConversationId: string | null;
}): RestoredPendingApproval | null {
  if (input.current) return input.current;
  if (input.streaming) return null;
  if (!input.restored) return null;
  if (input.activeConversationId !== input.loadedConversationId) return null;
  return input.restored;
}
