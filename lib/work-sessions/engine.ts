import 'server-only';
import { randomUUID } from 'node:crypto';
/**
 * Work Session engine — Chippi's long-running, goal-driven background runs.
 *
 * A session is: plan (LLM → 3–6 steps) → optional approval gate → execute
 * (one non-interactive agent run per step, READ-ONLY tools) → deliverable
 * (markdown artifact assembled from findings, saved to Files) → summary +
 * push. Every transition is an UPDATE on the WorkSession row, which the
 * client watches over Supabase Realtime — the row IS the progress feed.
 *
 * Safety posture: session runs execute with an explicit audited pure-read
 * allowlist. A background run can research, analyze, and
 * produce documents; it can never send, create, or delete — actions stay in
 * chat where the approval UI lives. The session's deliverable proposes next
 * actions instead of taking them.
 *
 * Runs inside Inngest functions (durable, retried) with an inline after()
 * fallback when Inngest isn't configured (previews) — same contract either
 * way because every entry point is just "advance this session id".
 */

import { run, Agent } from '@openai/agents';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { getLLMClient, resolveChatModel } from '@/lib/llm';
import { getAgentModel } from '@/lib/ai-tools/agent-model';
import { toSdkTool } from '@/lib/ai-tools/sdk-bridge';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import type { ToolContext, ToolDefinition } from '@/lib/ai-tools/types';
import { unattendedReadTools } from '@/lib/agent/unattended-tool-policy';
import { uploadObject, buildKey } from '@/lib/storage';
import { sendPushToSpace } from '@/lib/push';
import { createAppNotification } from '@/lib/notifications';
import { dispatchWorkspaceRun } from '@/lib/workspace-runs/server';
import { selectWorkspaceTarget, type WorkspaceProperty } from '@/lib/workspace-runs/packet';

// ── Types ────────────────────────────────────────────────────────────────────
// Shared with the client strip via lib/work-sessions/types.ts (types-only
// module — the strip must never import this server-only file).

import type { PlanStep, WorkSessionRow } from './types';
export type { PlanStep, WorkSessionRow } from './types';
import { proposeActions } from './actions';
import { unscoped } from '@/lib/supabase-guard';


const MAX_STEPS = 6;
const STEP_MAX_TURNS = 12;
const FINDING_CAP = 6000;
// Longer than both worker and Inngest route ceilings (300s), while still
// expiring within the Cloudflare queue's bounded retry horizon. A delivery
// that collides with this live lease throws, so it is retried rather than
// acknowledged and lost if the original invocation was killed.
const PHASE_LEASE_SECONDS = 7 * 60;

type WorkSessionPhase = 'plan' | 'step' | 'artifact';

// ── Row helpers ──────────────────────────────────────────────────────────────

export async function getSession(id: string): Promise<WorkSessionRow | null> {
  const { data, error } = await unscoped(supabase.from('WorkSession'), 'post-fetch: caller verified parent scope before this id query').select('*').eq('id', id).maybeSingle();
  // A queue handler must distinguish "missing" from "the database could not
  // answer". Treating both as null acknowledges the Cloudflare message and
  // can strand a live session with no later delivery.
  if (error) throw error;
  return (data as WorkSessionRow | null) ?? null;
}

async function patchSession(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await unscoped(supabase
    .from('WorkSession'), 'post-fetch: caller verified parent scope before this id query')
    .update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Claim one provider-executing phase using a database row lock. A false result
 * is an expected concurrency outcome (another live delivery owns the phase);
 * an RPC error is infrastructure failure and must retry rather than fail open.
 */
async function claimSessionPhase(
  sessionId: string,
  phase: WorkSessionPhase,
  phaseKey: string,
): Promise<string | null> {
  const token = randomUUID();
  const { data, error } = await supabase.rpc('claim_work_session_phase', {
    p_session_id: sessionId,
    p_phase: phase,
    p_phase_key: phaseKey,
    p_token: token,
    p_lease_seconds: PHASE_LEASE_SECONDS,
  });
  if (error) {
    logger.error('[work-sessions] phase claim failed', { sessionId, phase, phaseKey }, error);
    throw error;
  }
  return data === true ? token : null;
}

/**
 * Apply a phase-owned patch only while this token still owns an unexpired
 * lease and the session remains in its expected live status. Releasing clears
 * the claim; a non-releasing patch renews it for the next bounded provider
 * call. False means cancellation, expiry, or a newer recovery attempt won.
 */
async function patchClaimedSession(
  sessionId: string,
  phase: WorkSessionPhase,
  phaseKey: string,
  token: string,
  patch: Record<string, unknown>,
  release = true,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('patch_work_session_phase', {
    p_session_id: sessionId,
    p_phase: phase,
    p_phase_key: phaseKey,
    p_token: token,
    p_patch: patch,
    p_release: release,
    p_lease_seconds: PHASE_LEASE_SECONDS,
  });
  if (error) {
    logger.error('[work-sessions] fenced phase patch failed', { sessionId, phase, phaseKey }, error);
    throw error;
  }
  return data === true;
}

/**
 * End a research session honestly when every bounded step failed and therefore
 * produced no findings. The database revalidates the artifact claim, live
 * lease, terminal plan, and empty findings under one row lock so a stale queue
 * delivery cannot overwrite a recovered attempt.
 */
async function failEmptyClaimedSession(sessionId: string, token: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('fail_empty_work_session_artifact', {
    p_session_id: sessionId,
    p_token: token,
  });
  if (error) {
    logger.error('[work-sessions] empty artifact failure transition failed', { sessionId }, error);
    throw error;
  }
  return data === true;
}

async function statusAfterLostClaim(sessionId: string): Promise<WorkSessionRow['status'] | null> {
  return (await getSession(sessionId))?.status ?? null;
}

/**
 * Build a ToolContext for a background run — no request, no Clerk session.
 * The session row was created by an authenticated owner (the POST route
 * gates on requireSpaceOwner), so acting as the space owner here is the
 * same trust boundary the workflow engine uses.
 */
async function contextForSpace(spaceId: string): Promise<ToolContext | null> {
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
  };
}

/** The explicit pure-read tool subset a background run may use. */
function readOnlyTools(): ToolDefinition[] {
  // An empty registry is a valid no-capability harness (and leaves the agent
  // unable to perform side effects); a populated registry must pass the
  // audited policy, which fails closed on drift or missing entries.
  if (ALL_TOOLS.length === 0) return [];
  return unattendedReadTools(ALL_TOOLS);
}

// ── Phase 1: plan ────────────────────────────────────────────────────────────

const PLAN_PROMPT = `You are planning a background work session for a real estate professional's AI assistant. Break the goal into 3-${MAX_STEPS} concrete research/analysis steps. The session can READ the CRM (contacts, deals, tours, properties), research areas and comparables, and produce a written deliverable — it cannot send messages or modify records, so no step may be "send X" or "create Y" (propose those in the deliverable instead).

Return ONLY JSON:
{
  "steps": [ { "title": "<imperative, specific, max 80 chars>" } ],
  "question": "<ONE clarifying question if the goal is genuinely ambiguous, else null>"
}`;

/**
 * Plan the session. Transitions:
 *   allowQuestions && genuinely ambiguous → awaiting_input (question set)
 *   autonomy plan_first                   → awaiting_approval
 *   autonomy just_go                      → running (caller then executes)
 * Returns the status the session landed in so the caller knows whether to
 * proceed straight to execution.
 */
export async function planSession(
  sessionId: string,
  expectedWorkspaceRunId?: string,
): Promise<WorkSessionRow['status'] | null> {
  let session = await getSession(sessionId);
  if (!session || session.status !== 'planning') return session?.status ?? null;
  if (
    expectedWorkspaceRunId
    && (session.kind !== 'workspace' || session.workspaceRunId !== expectedWorkspaceRunId)
  ) return null;

  const claimToken = await claimSessionPhase(sessionId, 'plan', 'plan');
  if (!claimToken) {
    const current = await getSession(sessionId);
    if (current?.status === 'planning') {
      throw new Error('WorkSession planning is already leased; retry this delivery.');
    }
    return current?.status ?? null;
  }
  // Re-read after the atomic claim so cancellation or an authorized edit that
  // committed immediately after the first read is observed before a provider
  // call. The final RPC validates status and token again.
  session = await getSession(sessionId);
  if (!session || session.status !== 'planning') return session?.status ?? null;
  if (
    expectedWorkspaceRunId
    && (session.kind !== 'workspace' || session.workspaceRunId !== expectedWorkspaceRunId)
  ) return null;

  // Workspace Runs use an honest fixed packet plan; unlike research, the VM
  // will execute exactly these four visible deliverable steps.
  if (session.kind === 'workspace') {
    const { data: properties, error: propertiesError } = await tenantTable(supabase, 'Property', { spaceId: session.spaceId }).select('*').order('updatedAt', { ascending: false }).limit(50);
    if (propertiesError) throw propertiesError;
    const target = selectWorkspaceTarget(`${session.goal}\n${session.answer ?? ''}`, (properties ?? []) as WorkspaceProperty[]);
    if (!target && session.allowQuestions && !session.answer) {
      const applied = await patchClaimedSession(sessionId, 'plan', 'plan', claimToken, {
        status: 'awaiting_input',
        question: 'Which property should I use? Please provide the address or MLS number.',
      });
      return applied ? 'awaiting_input' : statusAfterLostClaim(sessionId);
    }
    const steps: PlanStep[] = [
      { id: 's1', title: target ? `Confirm target property: ${target.address}` : 'Identify or flag the target property', status: 'pending' },
      { id: 's2', title: 'Prepare the listing intelligence brief', status: 'pending' },
      { id: 's3', title: 'Build comparable and launch-checklist files', status: 'pending' },
      { id: 's4', title: 'Package the handoff files in the workspace', status: 'pending' },
    ];
    const next = session.autonomy === 'plan_first' ? 'awaiting_approval' : 'running';
    const applied = await patchClaimedSession(sessionId, 'plan', 'plan', claimToken, {
      plan: steps,
      status: next,
      question: null,
      error: null,
    });
    return applied ? next : statusAfterLostClaim(sessionId);
  }

  let raw = '';
  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      model: resolveChatModel(),
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: 'system', content: PLAN_PROMPT },
        {
          role: 'user',
          content: session.answer
            ? `Goal: ${session.goal}\n\nThe realtor clarified: ${session.answer}`
            : `Goal: ${session.goal}`,
        },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? '';
  } catch (err) {
    logger.error('[work-sessions] plan LLM failed', { sessionId }, err);
    const applied = await patchClaimedSession(sessionId, 'plan', 'plan', claimToken, {
      status: 'failed',
      error: 'Planning failed — try again.',
    });
    return applied ? 'failed' : statusAfterLostClaim(sessionId);
  }

  let parsed: { steps?: { title?: unknown }[]; question?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    const applied = await patchClaimedSession(sessionId, 'plan', 'plan', claimToken, {
      status: 'failed',
      error: 'Planning returned an unreadable plan.',
    });
    return applied ? 'failed' : statusAfterLostClaim(sessionId);
  }

  // One clarifying question, only when allowed and only BEFORE any work —
  // an answered question re-enters planning (answer travels in the prompt).
  const question =
    typeof parsed.question === 'string' && parsed.question.trim() && parsed.question.trim().toLowerCase() !== 'null'
      ? parsed.question.trim().slice(0, 300)
      : null;
  if (question && session.allowQuestions && !session.answer) {
    const applied = await patchClaimedSession(sessionId, 'plan', 'plan', claimToken, {
      status: 'awaiting_input',
      question,
    });
    return applied ? 'awaiting_input' : statusAfterLostClaim(sessionId);
  }

  const steps: PlanStep[] = (Array.isArray(parsed.steps) ? parsed.steps : [])
    .map((s, i) => ({
      id: `s${i + 1}`,
      title: typeof s.title === 'string' ? s.title.trim().slice(0, 120) : '',
      status: 'pending' as const,
    }))
    .filter((s) => s.title.length > 0)
    .slice(0, MAX_STEPS);

  if (steps.length === 0) {
    const applied = await patchClaimedSession(sessionId, 'plan', 'plan', claimToken, {
      status: 'failed',
      error: "Couldn't build a plan from that goal.",
    });
    return applied ? 'failed' : statusAfterLostClaim(sessionId);
  }

  const next = session.autonomy === 'plan_first' ? 'awaiting_approval' : 'running';
  const applied = await patchClaimedSession(sessionId, 'plan', 'plan', claimToken, {
    plan: steps,
    status: next,
    question: null,
    error: null,
  });
  return applied ? next : statusAfterLostClaim(sessionId);
}

// ── Phase 2: execute ─────────────────────────────────────────────────────────

/**
 * Advance the session by EXACTLY ONE step — the unit of durable execution.
 *
 * The queue path (lib/jobs/tasks.ts) runs one advance per Cloudflare Queues
 * job and re-enqueues while 'more' remains, so every step gets its own
 * invocation, its own retry budget, and the session survives any crash or
 * timeout between steps. Each advance re-reads the row, so cancellation and
 * external edits take effect between steps.
 *
 * Returns:
 *   'more'    — a step was attempted (done or skipped); pending steps remain
 *               (or the artifact still needs assembling on the next advance).
 *   'done'    — no pending research work remains; for a Workspace Run this
 *               means dispatch was accepted and its callback owns terminal
 *               lifecycle state.
 *   'stopped' — session missing / not running (cancelled, failed, awaiting).
 *
 * Concurrency-safe: re-entry skips steps already done/skipped, and a leased
 * database claim prevents two at-least-once deliveries from executing the
 * same provider/tool step. An expired claim on a 'running' step is reclaimable
 * after a crash; the old token can no longer publish results.
 */
export async function advanceSession(
  sessionId: string,
  expectedWorkspaceRunId?: string,
): Promise<'more' | 'done' | 'stopped'> {
  let session = await getSession(sessionId);
  if (!session || session.status !== 'running') return 'stopped';
  if (
    expectedWorkspaceRunId
    && (session.kind !== 'workspace' || session.workspaceRunId !== expectedWorkspaceRunId)
  ) return 'stopped';

  // Workspace Runs are an isolated compute substrate. Dispatch exactly once
  // through its durable launch fence, then let the callback/terminal RPC own
  // the WorkSession lifecycle state. The engine must not assemble a research
  // artifact or infer completion from Modal's acceptance response.
  if (session.kind === 'workspace') {
    if (!session.workspaceRunId) {
      await patchSession(sessionId, { status: 'failed', error: 'Workspace Run is missing its durable link.' });
      return 'stopped';
    }
    await dispatchWorkspaceRun({
      runId: session.workspaceRunId,
      spaceId: session.spaceId,
      workSessionId: session.id,
      goal: session.goal,
      answer: session.answer,
    });
    return 'done';
  }

  let idx = session.plan.findIndex((s) => s.status !== 'done' && s.status !== 'skipped');
  if (idx === -1) {
    const claimToken = await claimSessionPhase(sessionId, 'artifact', 'artifact');
    if (!claimToken) {
      const current = await getSession(sessionId);
      if (current?.status === 'running') {
        throw new Error('WorkSession artifact generation is already leased; retry this delivery.');
      }
      return 'stopped';
    }
    session = await getSession(sessionId);
    if (!session || session.status !== 'running') return 'stopped';
    if (session.findings.length === 0) {
      const failed = await failEmptyClaimedSession(sessionId, claimToken);
      if (!failed && (await statusAfterLostClaim(sessionId)) === 'running') {
        throw new Error('WorkSession empty artifact transition lost its claim; retry this delivery.');
      }
      return 'stopped';
    }
    const assembled = await assembleArtifact(sessionId, [...session.findings], claimToken);
    return assembled ? 'done' : 'stopped';
  }

  const stepKey = session.plan[idx].id;
  const claimToken = await claimSessionPhase(sessionId, 'step', stepKey);
  if (!claimToken) {
    const current = await getSession(sessionId);
    if (current?.status === 'running') {
      throw new Error('WorkSession step execution is already leased; retry this delivery.');
    }
    return 'stopped';
  }
  session = await getSession(sessionId);
  if (!session || session.status !== 'running') return 'stopped';
  idx = session.plan.findIndex((s) => s.status !== 'done' && s.status !== 'skipped');
  if (idx === -1 || session.plan[idx].id !== stepKey) return 'stopped';

  const ctx = await contextForSpace(session.spaceId);
  if (!ctx) {
    await patchClaimedSession(sessionId, 'step', stepKey, claimToken, {
      status: 'failed',
      error: 'Workspace not found.',
    });
    return 'stopped';
  }

  let plan = session.plan.map((s, j) => (j === idx ? { ...s, status: 'running' as const } : s));
  const markedRunning = await patchClaimedSession(
    sessionId,
    'step',
    stepKey,
    claimToken,
    { plan },
    false,
  );
  if (!markedRunning) return 'stopped';
  const findings = [...session.findings];

  let findingText = '';
  try {
    const tools = readOnlyTools().map((t) => toSdkTool(t, ctx));
    // Default chat model via the shared resolver (prompt-cache-wrapped).
    const model = getAgentModel();
    const agent = new Agent({
      name: 'work_session_step',
      model,
      instructions:
        `You are executing ONE step of a background work session for a real estate professional. ` +
        `Use the read-only tools to gather what the step needs, then answer with your findings — ` +
        `specific names, numbers, and dates, written so they can be dropped into a report. ` +
        `You cannot send or modify anything; if an action would help, note it as a recommendation.\n\n` +
        `Session goal: ${session.goal}` +
        (session.answer ? `\nRealtor clarification: ${session.answer}` : ''),
      tools,
    });
    const prior = findings.length
      ? `\n\nFindings so far:\n${findings.map((f) => `- ${f.text.slice(0, 400)}`).join('\n')}`
      : '';
    const result = await run(agent, `Step: ${plan[idx].title}${prior}`, {
      maxTurns: STEP_MAX_TURNS,
    });
    findingText = (result.finalOutput ?? '').toString().trim().slice(0, FINDING_CAP);
  } catch (err) {
    logger.warn('[work-sessions] step failed', { sessionId, step: plan[idx].title }, err);
    plan = plan.map((s, j) =>
      j === idx ? { ...s, status: 'skipped' as const, note: 'Step failed — continued without it.' } : s,
    );
    const applied = await patchClaimedSession(sessionId, 'step', stepKey, claimToken, { plan });
    return applied ? 'more' : 'stopped';
  }

  findings.push({ stepId: plan[idx].id, text: findingText || '(no findings)' });
  plan = plan.map((s, j) => (j === idx ? { ...s, status: 'done' as const } : s));
  const applied = await patchClaimedSession(sessionId, 'step', stepKey, claimToken, {
    plan,
    findings,
  });
  return applied ? 'more' : 'stopped';
}

/**
 * Execute every remaining step in this invocation — the INLINE path (previews
 * / no queue configured). Same state machine as the queue path: it just calls
 * advanceSession until the session stops moving.
 */
export async function executeSession(
  sessionId: string,
  expectedWorkspaceRunId?: string,
): Promise<void> {
  // MAX_STEPS attempts + one final advance to assemble the artifact; the
  // guard only backstops a state-machine bug, it never truncates real work.
  for (let guard = 0; guard <= MAX_STEPS + 1; guard++) {
    const progress = await advanceSession(sessionId, expectedWorkspaceRunId);
    if (progress !== 'more') return;
  }
  logger.error('[work-sessions] executeSession exceeded the advance guard', { sessionId });
}

// ── Phase 3: deliverable ─────────────────────────────────────────────────────

const ARTIFACT_PROMPT = `You are writing the FINISHED DELIVERABLE for a completed work session — a polished markdown document a real estate professional will read and share. Structure: a # title, a short executive summary, sections per theme (not per step), specific names/numbers/dates from the findings, and a final "Recommended next actions" section with concrete proposed actions (the assistant could not take actions itself). No preamble about being an AI. Also return a 1-2 sentence summary.

Return ONLY JSON: { "title": "<max 70 chars>", "markdown": "<the document>", "summary": "<1-2 sentences>" }`;

interface ArtifactFinalizationReceipt {
  finalStatus: 'completed' | 'awaiting_actions';
  artifactFileId: string;
  proposedCount: number;
}

function parseArtifactFinalizationReceipt(
  data: unknown,
  expectedProposalCount: number,
): ArtifactFinalizationReceipt | null {
  if (data == null || (Array.isArray(data) && data.length === 0)) return null;
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Malformed WorkSession artifact finalization receipt.');
  }
  const row = data[0] as Record<string, unknown> | null;
  if (!row) throw new Error('Malformed WorkSession artifact finalization receipt.');
  const { finalStatus, artifactFileId, proposedCount } = row;
  if (finalStatus !== 'completed' && finalStatus !== 'awaiting_actions') {
    throw new Error('Malformed WorkSession artifact finalization receipt.');
  }
  if (typeof artifactFileId !== 'string'
    || !/^work-session-artifact-[a-f0-9]{32}$/.test(artifactFileId)
    || !Number.isInteger(proposedCount)
    || proposedCount !== expectedProposalCount
    || (proposedCount === 0 && finalStatus !== 'completed')
    || (proposedCount > 0 && finalStatus !== 'awaiting_actions')
  ) {
    throw new Error('Malformed WorkSession artifact finalization receipt.');
  }
  return { finalStatus, artifactFileId, proposedCount } as ArtifactFinalizationReceipt;
}

async function assembleArtifact(
  sessionId: string,
  findings: { stepId: string; text: string }[],
  claimToken: string,
): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session || session.status !== 'running') return false;

  let title = 'Work session report';
  let markdown = '';
  let summary = '';
  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      model: resolveChatModel(),
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: ARTIFACT_PROMPT },
        {
          role: 'user',
          content: `Goal: ${session.goal}\n\nFindings:\n${findings
            .map((f, i) => `## Step ${i + 1}\n${f.text}`)
            .join('\n\n')}`,
        },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as {
      title?: string;
      markdown?: string;
      summary?: string;
    };
    if (parsed.title) title = parsed.title.slice(0, 70);
    if (parsed.markdown) markdown = parsed.markdown;
    if (parsed.summary) summary = parsed.summary.slice(0, 500);
  } catch (err) {
    logger.warn('[work-sessions] artifact LLM failed — falling back to raw findings', { sessionId }, err);
  }
  if (!markdown) {
    // Degraded but honest: the findings themselves, structured.
    markdown = `# ${title}\n\n**Goal:** ${session.goal}\n\n${findings
      .map((f, i) => `## ${session.plan[i]?.title ?? `Step ${i + 1}`}\n\n${f.text}`)
      .join('\n\n')}`;
    summary = summary || 'Session finished — the full findings are in the report.';
  }

  // Provider generation can take most of an invocation. Revalidate and renew
  // with the database clock before any persistent storage/action side effect.
  // A cancelled, expired, or superseded attempt stops here.
  const renewed = await patchClaimedSession(
    sessionId,
    'artifact',
    'artifact',
    claimToken,
    {},
    false,
  );
  if (!renewed) return false;

  // Proposals remain process-local until the final transaction. Provider
  // failure is intentionally non-fatal: a useful report can complete with no
  // proposed mutations, but it can never expose half a proposal set.
  const proposals = await proposeActions(session).catch((err) => {
    logger.warn('[work-sessions] action proposal generation failed', { sessionId }, err);
    return [];
  });

  // Proposal generation is another remote call. Renew and revalidate before
  // uploading; a cancellation, expired lease, or recovered token stops before
  // even the private object side effect.
  const renewedForUpload = await patchClaimedSession(
    sessionId,
    'artifact',
    'artifact',
    claimToken,
    {},
    false,
  );
  if (!renewedForUpload) return false;

  // Upload the private object first. A crash or lost claim can orphan this
  // claim-specific object, but no File metadata becomes visible until the
  // fenced database transaction below commits every artifact surface at once.
  const fileName = `${title.replace(/[^\w\s-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'work-session'}.md`;
  const body = Buffer.from(markdown, 'utf-8');
  const key = buildKey(
    'files',
    session.spaceId,
    `${sessionId.slice(0, 8)}-${claimToken.slice(0, 8)}-${fileName}`,
  );
  try {
    await uploadObject({ key, body, contentType: 'text/markdown', isPublic: false });
  } catch (err) {
    logger.warn('[work-sessions] private artifact upload failed', { sessionId }, err);
    throw err;
  }

  const { data: finalized, error: finalizationError } = await supabase.rpc('finalize_work_session_artifact', {
    p_session_id: sessionId,
    p_space_id: session.spaceId,
    p_token: claimToken,
    p_summary: summary,
    p_file: {
      storageKey: key,
      name: fileName,
      mimeType: 'text/markdown',
      sizeBytes: body.byteLength,
    },
    p_actions: proposals,
  });
  if (finalizationError) {
    logger.error('[work-sessions] atomic artifact finalization failed', { sessionId }, finalizationError);
    throw finalizationError;
  }
  const receipt = parseArtifactFinalizationReceipt(finalized, proposals.length);
  if (!receipt) return false;

  // Best-effort completion ping — the whole point of a background run is
  // that you left; this is how you learn it's done. The durable in-app
  // record (dashboard bell, deep-linked to the Chippi workspace where the
  // sessions strip lives) outlives the ephemeral push.
  void createAppNotification({
    spaceId: session.spaceId,
    type: 'work_session',
    title: 'Chippi finished a work session',
    body: title,
    spacePath: '/chippi',
  }).catch(() => {});
  void sendPushToSpace(session.spaceId, {
    title: 'Chippi finished a work session',
    body: title,
    url: '/',
  }).catch(() => {});
  return true;
}
