import 'server-only';
import crypto from 'crypto';
/**
 * Legacy Work-session action proposals.
 *
 * This approval/review path is deliberately quarantined. Work mode executes
 * explicit user-requested mutations in the live agent turn. Durable research
 * sessions publish their finished result and never fall into a separate human
 * review queue.
 *
 * Safety model:
 *   - Only registry tools with requiresApproval !== false are proposable, and
 *     only ones on ACTION_ALLOWLIST (a conservative subset — outreach/booking/
 *     tagging, never destructive ops).
 *   - Every proposed arg set is validated against the tool's real Zod schema
 *     before it is returned to the artifact finalizer; an unparseable proposal
 *     is dropped (logged), never shown as an approvable action we couldn't run.
 *   - Execution reuses executeTool(), so rate limits, abort handling, and
 *     structured logging are identical to a chat-initiated action.
 *   - WORK_SESSION_ACTIONS_DISABLED kill-switches proposing entirely.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getLLMClient, resolveChatModel } from '@/lib/llm';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import { executeTool } from '@/lib/ai-tools/execute';
import { enqueueWorkerTask, workerQueueConfigured } from '@/lib/queue';
import type { ToolContext, ToolDefinition, MutatingToolDefinition } from '@/lib/ai-tools/types';
import type { WorkSessionRow } from './types';

/**
 * The conservative subset of mutating tools a background session may propose.
 * Intentionally excludes deletes and bulk/irreversible operations — those stay
 * in interactive chat. Grow this deliberately; a tool NOT listed here can
 * never be proposed by a session even if the model asks for it.
 */
export const ACTION_ALLOWLIST: readonly string[] = [
  'send_email',
  'draft_email',
  'send_message',
  'create_task',
  'schedule_follow_up',
  'book_tour',
  'add_note',
  'tag_contact',
  'update_deal_stage',
];

/**
 * The legacy approval executor cannot safely resume an external side effect
 * after a process dies between provider execution and the terminal DB receipt.
 * Keep it fail-closed until it has a leased execution claim, recovery rail,
 * and provider-level idempotency keyed by the action id.
 */
export function workSessionActionRuntimeReadiness(): {
  enabled: false;
  reason: 'direct_work_mode_execution_only';
} {
  return { enabled: false, reason: 'direct_work_mode_execution_only' };
}

interface ProposableTool {
  name: string;
  description: string;
  summariseCall: (args: unknown) => string;
  parameters: MutatingToolDefinition['parameters'];
}

/** A schema-validated proposal, still private until the artifact finalization
 * transaction inserts it alongside the File metadata and parent transition. */
export interface ProposedWorkSessionAction {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  rationale: string | null;
}

/** Allowlisted, currently-registered mutating tools, in a shape the proposer
 *  and validator can use. */
export function proposableTools(): ProposableTool[] {
  const allow = new Set(ACTION_ALLOWLIST);
  return (ALL_TOOLS as ToolDefinition[])
    .filter((t): t is MutatingToolDefinition => t.requiresApproval !== false && allow.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description,
      summariseCall: t.summariseCall as (a: unknown) => string,
      parameters: t.parameters,
    }));
}

const PROPOSE_PROMPT = `You are proposing concrete follow-up ACTIONS after a real estate assistant finished a research work session. Given the goal, the findings, and the catalog of available actions, propose the specific actions that directly serve the goal — and ONLY those. Prefer 0 actions over a speculative one; every action will be shown to the realtor for approval and reflects on them.

Rules:
- Use ONLY the listed action names. Fill arguments from the findings (real names, ids, addresses, dates — never invented).
- Each action needs a one-line rationale tying it to a finding.
- If no action clearly serves the goal, return an empty list.

Return ONLY JSON: { "actions": [ { "tool": "<name>", "args": { ... }, "rationale": "<one line>" } ] }`;

/**
 * Propose actions for a finished session. Called before artifact publication
 * and returns validated rows without inserting anything. The artifact
 * finalizer inserts these rows and transitions the parent in one transaction.
 *
 * Never throws — a proposer failure must not fail an otherwise-complete
 * session; it just means no actions were proposed.
 */
export async function proposeActions(session: WorkSessionRow): Promise<ProposedWorkSessionAction[]> {
  if (!workSessionActionRuntimeReadiness().enabled) return [];
  if (process.env.WORK_SESSION_ACTIONS_DISABLED) return [];
  const tools = proposableTools();
  if (tools.length === 0) return [];

  const catalog = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  const findingsText = session.findings.map((f, i) => `## Finding ${i + 1}\n${f.text}`).join('\n\n');

  let raw = '';
  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      model: resolveChatModel(),
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: PROPOSE_PROMPT },
        {
          role: 'user',
          content: `Goal: ${session.goal}\n\nAvailable actions:\n${catalog}\n\nFindings:\n${findingsText}`,
        },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? '';
  } catch (err) {
    logger.warn('[work-sessions] action proposal LLM failed', { sessionId: session.id }, err);
    return [];
  }

  let parsed: { actions?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
  const byName = new Map(tools.map((t) => [t.name, t]));

  const rows: ProposedWorkSessionAction[] = [];
  let dropped = 0;
  for (const a of rawActions.slice(0, 10)) {
    const tool = typeof (a as { tool?: unknown })?.tool === 'string' ? byName.get((a as { tool: string }).tool) : undefined;
    if (!tool) {
      dropped++;
      continue;
    }
    // Validate against the tool's REAL schema — only executable proposals are
    // ever stored. A malformed proposal is dropped, not shown.
    const check = tool.parameters.safeParse((a as { args?: unknown }).args ?? {});
    if (!check.success) {
      dropped++;
      continue;
    }
    let summary = `Run ${tool.name}`;
    try {
      summary = tool.summariseCall(check.data);
    } catch {
      /* fall back to the generic label */
    }
    const rationale = typeof (a as { rationale?: unknown }).rationale === 'string'
      ? (a as { rationale: string }).rationale.trim().slice(0, 300)
      : null;
    const cleanSummary = typeof summary === 'string' && summary.trim()
      ? summary.trim().slice(0, 500)
      : `Run ${tool.name}`;
    rows.push({
      tool: tool.name,
      args: check.data as Record<string, unknown>,
      summary: cleanSummary,
      rationale,
    });
  }

  if (dropped > 0) {
    logger.info('[work-sessions] dropped invalid action proposals', { sessionId: session.id, dropped });
  }
  return rows;
}

interface ClaimedWorkSessionActionDecision {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: 'approved' | 'denied';
}

function parseClaimedDecision(
  data: unknown,
  actionId: string,
  expectedStatus: ClaimedWorkSessionActionDecision['status'],
): ClaimedWorkSessionActionDecision | null {
  if (data == null || (Array.isArray(data) && data.length === 0)) return null;
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Malformed WorkSession action claim receipt.');
  }
  const row = data[0] as Record<string, unknown> | null;
  if (!row
    || row.id !== actionId
    || typeof row.tool !== 'string'
    || !ACTION_ALLOWLIST.includes(row.tool)
    || !row.args
    || typeof row.args !== 'object'
    || Array.isArray(row.args)
    || row.status !== expectedStatus
  ) {
    throw new Error('Malformed WorkSession action claim receipt.');
  }
  return row as unknown as ClaimedWorkSessionActionDecision;
}

const EXECUTION_KEY_PATTERN = /^work-session-action-[0-9a-f]{32}$/;
const DURABLE_RETRY_SAFE_TOOLS = new Set(['send_email']);
const ACTION_EXECUTION_LEASE_SECONDS = 120;

interface ClaimedWorkSessionActionExecution {
  disposition: 'claimed';
  id: string;
  tool: string;
  args: Record<string, unknown>;
  executionIdempotencyKey: string;
  executionAttempts: number;
}

interface ReconciliationRequiredActionExecution {
  disposition: 'reconciliation_required';
  id: string;
  executionAttempts: number;
}

type WorkSessionActionExecutionClaim =
  | ClaimedWorkSessionActionExecution
  | ReconciliationRequiredActionExecution;

function parseExecutionClaim(
  data: unknown,
  actionId: string,
): WorkSessionActionExecutionClaim | null {
  if (data == null || (Array.isArray(data) && data.length === 0)) return null;
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Malformed WorkSession action execution claim receipt.');
  }
  const row = data[0] as Record<string, unknown> | null;
  if (!row
    || row.id !== actionId
    || !Number.isInteger(row.executionAttempts)
    || (row.executionAttempts as number) < 0
  ) {
    throw new Error('Malformed WorkSession action execution claim receipt.');
  }
  if (row.disposition === 'reconciliation_required') {
    return row as unknown as ReconciliationRequiredActionExecution;
  }
  if (row.disposition !== 'claimed'
    || typeof row.tool !== 'string'
    || row.tool.length < 1
    || row.tool.length > 100
    || !row.args
    || typeof row.args !== 'object'
    || Array.isArray(row.args)
    || typeof row.executionIdempotencyKey !== 'string'
    || !EXECUTION_KEY_PATTERN.test(row.executionIdempotencyKey)
    || (row.executionAttempts as number) < 1
  ) {
    throw new Error('Malformed WorkSession action execution claim receipt.');
  }
  return row as unknown as ClaimedWorkSessionActionExecution;
}

async function finishClaimedActionExecution(input: {
  sessionId: string;
  actionId: string;
  spaceId: string;
  claimToken: string;
  terminalStatus: 'executed' | 'failed';
  result: unknown;
  error: string | null;
  reconciliationRequired: boolean;
}): Promise<void> {
  const { data, error } = await supabase.rpc('finish_claimed_work_session_action_execution', {
    p_session_id: input.sessionId,
    p_action_id: input.actionId,
    p_space_id: input.spaceId,
    p_claim_token: input.claimToken,
    p_terminal_status: input.terminalStatus,
    p_result: input.terminalStatus === 'executed' ? input.result ?? null : null,
    p_error: input.terminalStatus === 'failed'
      ? (input.error?.trim() || 'Action failed.').slice(0, 1000)
      : null,
    p_reconciliation_required: input.reconciliationRequired,
  });
  if (error) throw error;
  if (data !== true) {
    throw new Error('WorkSession action execution lost its lease or awaiting-actions parent fence.');
  }
}

async function releaseActionExecutionClaim(input: {
  sessionId: string;
  actionId: string;
  spaceId: string;
  claimToken: string;
  error: string;
}): Promise<void> {
  const { data, error } = await supabase.rpc('release_work_session_action_execution_claim', {
    p_session_id: input.sessionId,
    p_action_id: input.actionId,
    p_space_id: input.spaceId,
    p_claim_token: input.claimToken,
    p_error: (input.error.trim() || 'Transient action execution failure.').slice(0, 1000),
  });
  if (error) throw error;
  if (data !== true) {
    throw new Error('WorkSession action retry lost its execution lease.');
  }
}

/**
 * Approve or deny ONE proposed action.
 *
 * The database locks the parent first and requires it to remain
 * `awaiting_actions`, then atomically wins the proposed → decided race.
 * This entry point remains hard-quarantined above. Its dormant implementation
 * records decisions through the v2 authority and queues approval execution;
 * it never performs an external side effect in the request that records the
 * decision. The durable worker below owns execution and recovery.
 *
 * Returns the action's terminal status, or null if it wasn't claimable
 * (already decided, or not found in this space).
 */
export async function decideAction(input: {
  sessionId: string;
  actionId: string;
  decision: 'approve' | 'deny';
  spaceId: string;
  decidedByUserId: string;
}): Promise<'approved' | 'denied' | null> {
  if (!workSessionActionRuntimeReadiness().enabled) return null;
  const { sessionId, actionId, decision, spaceId, decidedByUserId } = input;

  if (decision === 'approve' && !workerQueueConfigured()) {
    throw new Error('Cloudflare action execution queue is not configured.');
  }

  const claimStatus = decision === 'deny' ? 'denied' : 'approved';
  const { data, error: claimError } = await supabase.rpc('claim_work_session_action_decision_v2', {
    p_session_id: sessionId,
    p_action_id: actionId,
    p_space_id: spaceId,
    p_decision: decision,
    p_decided_by_user_id: decidedByUserId,
  });
  if (claimError) throw claimError;
  const action = parseClaimedDecision(data, actionId, claimStatus);
  if (!action) return null;
  if (decision === 'deny') return 'denied';

  const queued = await enqueueWorkerTask('work-session-action-execute', {
    sessionId,
    actionId,
    spaceId,
  });
  if (!queued) {
    // The decision is durable. Throw honestly so the request does not claim
    // execution; the recurring recovery rail will enqueue the approved row.
    throw new Error('Cloudflare queue did not accept WorkSession action execution.');
  }
  return 'approved';
}

export interface WorkSessionActionExecutionResult {
  status: 'executed' | 'failed' | 'reconciliation_required' | 'not_claimed';
  attempts: number;
}

/** Execute one approved action behind an opaque database lease. A queue
 * message is only a wake-up: the tenant-scoped claim is the authority. */
export async function executeApprovedWorkSessionAction(input: {
  sessionId: string;
  actionId: string;
  spaceId: string;
}): Promise<WorkSessionActionExecutionResult> {
  const claimToken = crypto.randomUUID();
  const { data, error } = await supabase.rpc('claim_work_session_action_execution', {
    p_session_id: input.sessionId,
    p_action_id: input.actionId,
    p_space_id: input.spaceId,
    p_claim_token: claimToken,
    p_lease_seconds: ACTION_EXECUTION_LEASE_SECONDS,
  });
  if (error) throw error;
  const claim = parseExecutionClaim(data, input.actionId);
  if (!claim) return { status: 'not_claimed', attempts: 0 };
  if (claim.disposition === 'reconciliation_required') {
    return { status: 'reconciliation_required', attempts: claim.executionAttempts };
  }

  if (!DURABLE_RETRY_SAFE_TOOLS.has(claim.tool)) {
    await finishClaimedActionExecution({
      ...input,
      claimToken,
      terminalStatus: 'failed',
      result: null,
      error: `Durable automatic execution is unavailable for tool "${claim.tool}".`,
      reconciliationRequired: true,
    });
    return { status: 'failed', attempts: claim.executionAttempts };
  }

  const ctx = await ownerContext(input.spaceId, claim.executionIdempotencyKey);
  if (!ctx) {
    await finishClaimedActionExecution({
      ...input,
      claimToken,
      terminalStatus: 'failed',
      result: null,
      error: 'Workspace owner not found.',
      reconciliationRequired: claim.executionAttempts > 1,
    });
    return { status: 'failed', attempts: claim.executionAttempts };
  }

  let exec: Awaited<ReturnType<typeof executeTool>>;
  try {
    exec = await executeTool(claim.tool, claim.args, ctx);
  } catch (executionError) {
    const message = executionError instanceof Error ? executionError.message : 'Action failed.';
    await releaseActionExecutionClaim({ ...input, claimToken, error: message });
    throw executionError;
  }

  if (exec.ok && exec.result && exec.result.display !== 'error') {
    await finishClaimedActionExecution({
      ...input,
      claimToken,
      terminalStatus: 'executed',
      result: exec.result,
      error: null,
      reconciliationRequired: false,
    });
    return { status: 'executed', attempts: claim.executionAttempts };
  }

  const failure = exec.ok
    ? exec.result?.summary ?? 'Action handler returned no successful receipt.'
    : exec.error?.message ?? 'Action execution failed.';
  if (!exec.ok && exec.error?.code === 'handler_error') {
    await releaseActionExecutionClaim({ ...input, claimToken, error: failure });
    throw new Error(failure);
  }

  const reconciliationRequired = claim.executionAttempts > 1
    || (exec.ok && exec.result?.durableExecutionDisposition === 'reconciliation_required');
  await finishClaimedActionExecution({
    ...input,
    claimToken,
    terminalStatus: 'failed',
    result: null,
    error: failure,
    reconciliationRequired,
  });
  return { status: 'failed', attempts: claim.executionAttempts };
}

function parseRecoveryRows(data: unknown): Array<{
  sessionId: string;
  actionId: string;
  spaceId: string;
}> {
  if (!Array.isArray(data)) throw new Error('Malformed WorkSession action recovery receipt.');
  return data.map((value) => {
    const row = value as Record<string, unknown> | null;
    if (!row
      || typeof row.sessionId !== 'string'
      || typeof row.actionId !== 'string'
      || typeof row.spaceId !== 'string'
      || row.sessionId.length < 1 || row.sessionId.length > 200
      || row.actionId.length < 1 || row.actionId.length > 200
      || row.spaceId.length < 1 || row.spaceId.length > 200
    ) {
      throw new Error('Malformed WorkSession action recovery receipt.');
    }
    return { sessionId: row.sessionId, actionId: row.actionId, spaceId: row.spaceId };
  });
}

/** Find approved rows with no live lease and enqueue bounded wake-ups. Claims,
 * not queue delivery, serialize execution, so repeated cron ticks are safe. */
export async function reconcileWorkSessionActionExecutions(
  limit = 50,
): Promise<{ scanned: number; enqueued: number }> {
  if (!Number.isFinite(limit)) {
    throw new Error('Invalid WorkSession action recovery limit.');
  }
  const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const { data, error } = await supabase.rpc('list_recoverable_work_session_actions', {
    p_limit: boundedLimit,
  });
  if (error) throw error;
  const rows = parseRecoveryRows(data);
  let enqueued = 0;
  for (const row of rows) {
    const queued = await enqueueWorkerTask('work-session-action-execute', row);
    if (!queued) {
      throw new Error('Cloudflare queue did not accept WorkSession action recovery.');
    }
    enqueued++;
  }
  return { scanned: rows.length, enqueued };
}

/** Space-owner ToolContext for background action execution — same trust
 * boundary the read-only session steps already use. */
async function ownerContext(
  spaceId: string,
  executionIdempotencyKey: string,
): Promise<ToolContext | null> {
  const { data: space, error: spaceError } = await supabase
    .from('Space')
    .select('id, slug, name, ownerId')
    .eq('id', spaceId)
    .maybeSingle();
  if (spaceError) throw spaceError;
  if (!space) return null;
  const { data: owner, error: ownerError } = await supabase
    .from('User')
    .select('clerkId')
    .eq('id', (space as { ownerId: string }).ownerId)
    .maybeSingle();
  if (ownerError) throw ownerError;
  if (!owner) return null;
  return {
    userId: (owner as { clerkId: string }).clerkId,
    space: space as ToolContext['space'],
    signal: new AbortController().signal,
    executionIdempotencyKey,
  };
}
