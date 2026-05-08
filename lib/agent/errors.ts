/**
 * Normalised error taxonomy for the agent tool-use loop.
 *
 * Every error that escapes a tool handler should be wrapped in AgentError
 * before it reaches the orchestrator. This gives the orchestrator a
 * machine-readable `code`, a human-readable `message`, and a `retryable`
 * flag so it can make intelligent retry decisions instead of treating all
 * failures the same way.
 *
 * Zero external dependencies — this file must be importable anywhere in the
 * stack without pulling in Supabase, Zod, or any other library.
 */

// ── Error code taxonomy ───────────────────────────────────────────────────

export type ErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'DB_ERROR'
  | 'SPACE_DISABLED'
  | 'BUDGET_EXCEEDED'
  | 'TIMEOUT'
  | 'UNKNOWN';

// ── AgentError class ──────────────────────────────────────────────────────

export class AgentError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly context?: unknown,
  ) {
    super(message);
    this.name = 'AgentError';
    // Maintain proper prototype chain for instanceof checks in transpiled code.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): { code: ErrorCode; message: string; retryable: boolean; context?: unknown } {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      context: this.context,
    };
  }
}

// ── Supabase PostgreSQL error code → ErrorCode mapping ───────────────────

/**
 * Maps a Supabase/PostgREST error object to an AgentError.
 *
 * Supabase errors carry a `code` (PostgreSQL SQLSTATE or PostgREST code),
 * an optional `status` (HTTP status), and a `message`.
 *
 * Reference:
 *   - PostgreSQL SQLSTATE codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
 *   - PostgREST error codes: https://postgrest.org/en/stable/references/errors.html
 */
export function fromSupabaseError(err: {
  code?: string;
  message?: string;
  status?: number;
}): AgentError {
  const raw = err.code ?? '';
  const status = err.status ?? 0;
  const message = err.message ?? 'Unknown Supabase error';

  // PostgREST / HTTP-layer errors surfaced through the Supabase client.
  if (status === 429) {
    return new AgentError('RATE_LIMITED', message, true, err);
  }
  if (status === 403 || status === 401) {
    return new AgentError('PERMISSION_DENIED', message, false, err);
  }

  // PostgreSQL SQLSTATE class checks (first two characters).
  const sqlClass = raw.slice(0, 2);

  // Class 08 — Connection Exception (transient, always retry)
  if (sqlClass === '08') {
    return new AgentError('NETWORK_ERROR', message, true, err);
  }

  // Class 22 — Data Exception / Class 23 — Integrity Constraint Violation
  if (sqlClass === '22' || sqlClass === '23') {
    return new AgentError('VALIDATION_ERROR', message, false, err);
  }

  // Class 28 — Invalid Authorization Specification
  if (sqlClass === '28') {
    return new AgentError('PERMISSION_DENIED', message, false, err);
  }

  // Class 40 — Transaction Rollback (deadlocks, serialization failures — retry)
  if (sqlClass === '40') {
    return new AgentError('DB_ERROR', message, true, err);
  }

  // Class 53 — Insufficient Resources (e.g. too_many_connections — retry)
  if (sqlClass === '53') {
    return new AgentError('DB_ERROR', message, true, err);
  }

  // Class 57 — Operator Intervention / Class 58 — System Error
  if (sqlClass === '57' || sqlClass === '58') {
    return new AgentError('DB_ERROR', message, true, err);
  }

  // Generic DB / server error via HTTP status
  if (status >= 500) {
    return new AgentError('DB_ERROR', message, true, err);
  }

  // PGRST* PostgREST-specific codes
  if (raw.startsWith('PGRST')) {
    return new AgentError('DB_ERROR', message, false, err);
  }

  return new AgentError('UNKNOWN', message, false, err);
}

// ── HTTP status → ErrorCode mapping ──────────────────────────────────────

/**
 * Maps an HTTP status code (from any external HTTP call, not just Supabase)
 * to an AgentError.
 */
export function fromHttpError(status: number, body?: unknown): AgentError {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const preview = bodyStr.slice(0, 200);

  if (status === 429) {
    return new AgentError('RATE_LIMITED', `Rate limited (HTTP 429): ${preview}`, true, body);
  }
  if (status === 401 || status === 403) {
    return new AgentError(
      'PERMISSION_DENIED',
      `Permission denied (HTTP ${status}): ${preview}`,
      false,
      body,
    );
  }
  if (status === 404) {
    return new AgentError(
      'TOOL_NOT_FOUND',
      `Resource not found (HTTP 404): ${preview}`,
      false,
      body,
    );
  }
  if (status === 408 || status === 504) {
    return new AgentError(
      'TIMEOUT',
      `Request timed out (HTTP ${status}): ${preview}`,
      true,
      body,
    );
  }
  if (status === 422 || status === 400) {
    return new AgentError(
      'VALIDATION_ERROR',
      `Validation error (HTTP ${status}): ${preview}`,
      false,
      body,
    );
  }
  if (status >= 500) {
    return new AgentError(
      'DB_ERROR',
      `Server error (HTTP ${status}): ${preview}`,
      true,
      body,
    );
  }
  return new AgentError(
    'UNKNOWN',
    `Unexpected HTTP ${status}: ${preview}`,
    false,
    body,
  );
}

// ── Generic exception → AgentError ───────────────────────────────────────

/**
 * Wraps any thrown value in an AgentError.
 *
 * - If it is already an AgentError, returns it as-is.
 * - Otherwise, inspects the message for known patterns and maps to the
 *   nearest ErrorCode.
 * - Falls back to UNKNOWN when no pattern matches.
 */
export function fromException(err: unknown): AgentError {
  if (err instanceof AgentError) {
    return err;
  }

  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : JSON.stringify(err);

  const lower = message.toLowerCase();

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('etimedout') ||
    lower.includes('deadline exceeded')
  ) {
    return new AgentError('TIMEOUT', message, true, err);
  }

  if (
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('fetch failed') ||
    lower.includes('socket hang up')
  ) {
    return new AgentError('NETWORK_ERROR', message, true, err);
  }

  if (
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('too many requests')
  ) {
    return new AgentError('RATE_LIMITED', message, true, err);
  }

  if (
    lower.includes('permission') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('not allowed') ||
    lower.includes('access denied')
  ) {
    return new AgentError('PERMISSION_DENIED', message, false, err);
  }

  if (
    lower.includes('not found') ||
    lower.includes('no such tool') ||
    lower.includes('unknown tool')
  ) {
    return new AgentError('TOOL_NOT_FOUND', message, false, err);
  }

  if (
    lower.includes('validation') ||
    lower.includes('invalid') ||
    lower.includes('schema') ||
    lower.includes('parse error')
  ) {
    return new AgentError('VALIDATION_ERROR', message, false, err);
  }

  if (lower.includes('budget') || lower.includes('quota exceeded') || lower.includes('credit')) {
    return new AgentError('BUDGET_EXCEEDED', message, false, err);
  }

  if (lower.includes('space disabled') || lower.includes('space is disabled')) {
    return new AgentError('SPACE_DISABLED', message, false, err);
  }

  if (
    lower.includes('database') ||
    lower.includes('db error') ||
    lower.includes('sql') ||
    lower.includes('supabase')
  ) {
    return new AgentError('DB_ERROR', message, true, err);
  }

  return new AgentError('UNKNOWN', message, false, err);
}

// ── Utility ───────────────────────────────────────────────────────────────

/**
 * Returns true when the orchestrator should schedule a retry for this error.
 * Accepts any thrown value — normalises to AgentError internally.
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof AgentError) {
    return err.retryable;
  }
  return fromException(err).retryable;
}
