import 'server-only';
/**
 * Work-session ACTIONS — the approval-gated "the agent does things" layer.
 *
 * Sessions research with read-only tools, then (this module) PROPOSE concrete
 * mutating actions the realtor approves one by one. Nothing executes without
 * an explicit per-action approval, and every proposal + decision + result is
 * written to WorkSessionAction as an immutable audit trail.
 *
 * Safety model:
 *   - Only registry tools with requiresApproval !== false are proposable, and
 *     only ones on ACTION_ALLOWLIST (a conservative subset — outreach/booking/
 *     tagging, never destructive ops).
 *   - Every proposed arg set is validated against the tool's real Zod schema
 *     BEFORE it is stored; an unparseable proposal is dropped (logged), never
 *     shown as an approvable action we couldn't actually run.
 *   - Execution reuses executeTool(), so rate limits, abort handling, and
 *     structured logging are identical to a chat-initiated action.
 *   - WORK_SESSION_ACTIONS_DISABLED kill-switches proposing entirely.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getLLMClient } from '@/lib/llm';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import { executeTool } from '@/lib/ai-tools/execute';
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

interface ProposableTool {
  name: string;
  description: string;
  summariseCall: (args: unknown) => string;
  parameters: MutatingToolDefinition['parameters'];
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
 * Propose actions for a finished session. Called at the tail of artifact
 * assembly. Returns the number of VALID actions stored (0 → the session
 * stays 'completed'; ≥1 → caller flips it to 'awaiting_actions').
 *
 * Never throws — a proposer failure must not fail an otherwise-complete
 * session; it just means no actions were proposed.
 */
export async function proposeActions(session: WorkSessionRow): Promise<number> {
  if (process.env.WORK_SESSION_ACTIONS_DISABLED) return 0;
  const tools = proposableTools();
  if (tools.length === 0) return 0;

  const catalog = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  const findingsText = session.findings.map((f, i) => `## Finding ${i + 1}\n${f.text}`).join('\n\n');

  let raw = '';
  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      model: 'qwen/qwen3.7-plus',
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
    return 0;
  }

  let parsed: { actions?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
  const byName = new Map(tools.map((t) => [t.name, t]));

  const rows: Record<string, unknown>[] = [];
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
    rows.push({
      sessionId: session.id,
      spaceId: session.spaceId,
      tool: tool.name,
      args: check.data,
      summary: summary.slice(0, 500),
      rationale,
      status: 'proposed',
    });
  }

  if (dropped > 0) {
    logger.info('[work-sessions] dropped invalid action proposals', { sessionId: session.id, dropped });
  }
  if (rows.length === 0) return 0;

  const { error } = await supabase.from('WorkSessionAction').insert(rows);
  if (error) {
    logger.warn('[work-sessions] failed to store proposed actions', { sessionId: session.id }, error);
    return 0;
  }
  return rows.length;
}

/**
 * Approve or deny ONE proposed action.
 *
 * Guarded on current status 'proposed' (the `.eq('status','proposed')` in the
 * claim update is the concurrency lock — a double-click can't execute twice).
 * On approve: execute via executeTool with the space-owner ToolContext, then
 * record executed/failed + result. On deny: record denied. Either way, if no
 * proposed actions remain, the session transitions to 'completed'.
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
}): Promise<'executed' | 'failed' | 'denied' | null> {
  const { sessionId, actionId, decision, spaceId, decidedByUserId } = input;

  // Claim the action (atomic: only one caller wins the proposed → decided race).
  const decidedAt = new Date().toISOString();
  const claimStatus = decision === 'deny' ? 'denied' : 'approved';
  const { data: claimed } = await supabase
    .from('WorkSessionAction')
    .update({ status: claimStatus, decidedByUserId, decidedAt })
    .eq('id', actionId)
    .eq('sessionId', sessionId)
    .eq('spaceId', spaceId)
    .eq('status', 'proposed')
    .select('id, tool, args')
    .maybeSingle();

  if (!claimed) return null; // not found / already decided / wrong tenant

  let terminal: 'executed' | 'failed' | 'denied' = 'denied';

  if (decision === 'approve') {
    const action = claimed as { id: string; tool: string; args: unknown };
    const ctx = await ownerContext(spaceId);
    if (!ctx) {
      await supabase
        .from('WorkSessionAction')
        .update({ status: 'failed', error: 'Workspace owner not found.', executedAt: new Date().toISOString() })
        .eq('id', actionId);
      terminal = 'failed';
    } else {
      const exec = await executeTool(action.tool, action.args, ctx);
      terminal = exec.ok ? 'executed' : 'failed';
      await supabase
        .from('WorkSessionAction')
        .update({
          status: terminal,
          result: exec.ok ? (exec.result as unknown as Record<string, unknown>) ?? null : null,
          error: exec.ok ? null : exec.error?.message ?? 'Action failed.',
          executedAt: new Date().toISOString(),
        })
        .eq('id', actionId);
    }
  }

  await completeIfSettled(sessionId, spaceId);
  return terminal;
}

/** Flip the session to 'completed' once no proposed actions remain. */
async function completeIfSettled(sessionId: string, spaceId: string): Promise<void> {
  const { count } = await supabase
    .from('WorkSessionAction')
    .select('id', { count: 'exact', head: true })
    .eq('sessionId', sessionId)
    .eq('status', 'proposed');
  if ((count ?? 0) > 0) return;
  const now = new Date().toISOString();
  await supabase
    .from('WorkSession')
    .update({ status: 'completed', completedAt: now, updatedAt: now })
    .eq('id', sessionId)
    .eq('spaceId', spaceId)
    .eq('status', 'awaiting_actions');
}

/** Space-owner ToolContext for background action execution — same trust
 *  boundary the read-only session steps already use. */
async function ownerContext(spaceId: string): Promise<ToolContext | null> {
  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name, ownerId')
    .eq('id', spaceId)
    .maybeSingle();
  if (!space) return null;
  const { data: owner } = await supabase
    .from('User')
    .select('clerkId')
    .eq('id', (space as { ownerId: string }).ownerId)
    .maybeSingle();
  if (!owner) return null;
  return {
    userId: (owner as { clerkId: string }).clerkId,
    space: space as ToolContext['space'],
    signal: new AbortController().signal,
  };
}
