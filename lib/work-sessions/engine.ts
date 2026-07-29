import 'server-only';
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
import { logger } from '@/lib/logger';
import { getLLMClient } from '@/lib/llm';
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

const MAX_STEPS = 6;
const STEP_MAX_TURNS = 12;
const FINDING_CAP = 6000;

// ── Row helpers ──────────────────────────────────────────────────────────────

export async function getSession(id: string): Promise<WorkSessionRow | null> {
  const { data } = await supabase.from('WorkSession').select('*').eq('id', id).maybeSingle();
  return (data as WorkSessionRow | null) ?? null;
}

async function patchSession(id: string, patch: Record<string, unknown>): Promise<void> {
  await supabase
    .from('WorkSession')
    .update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('id', id);
}

/**
 * Build a ToolContext for a background run — no request, no Clerk session.
 * The session row was created by an authenticated owner (the POST route
 * gates on requireSpaceOwner), so acting as the space owner here is the
 * same trust boundary the workflow engine uses.
 */
async function contextForSpace(spaceId: string): Promise<ToolContext | null> {
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

/** The explicit pure-read tool subset a background run may use. */
function readOnlyTools(): ToolDefinition[] {
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
export async function planSession(sessionId: string): Promise<WorkSessionRow['status'] | null> {
  const session = await getSession(sessionId);
  if (!session || session.status !== 'planning') return session?.status ?? null;

  // Workspace Runs use an honest fixed packet plan; unlike research, the VM
  // will execute exactly these four visible deliverable steps.
  if (session.kind === 'workspace') {
    const { data: properties } = await supabase.from('Property').select('*').eq('spaceId', session.spaceId).order('updatedAt', { ascending: false }).limit(50);
    const target = selectWorkspaceTarget(`${session.goal}\n${session.answer ?? ''}`, (properties ?? []) as WorkspaceProperty[]);
    if (!target && session.allowQuestions && !session.answer) {
      await patchSession(sessionId, { status: 'awaiting_input', question: 'Which property should I use? Please provide the address or MLS number.' });
      return 'awaiting_input';
    }
    const steps: PlanStep[] = [
      { id: 's1', title: target ? `Confirm target property: ${target.address}` : 'Identify or flag the target property', status: 'pending' },
      { id: 's2', title: 'Prepare the listing intelligence brief', status: 'pending' },
      { id: 's3', title: 'Build comparable and launch-checklist files', status: 'pending' },
      { id: 's4', title: 'Package the handoff files in the workspace', status: 'pending' },
    ];
    const next = session.autonomy === 'plan_first' ? 'awaiting_approval' : 'running';
    await patchSession(sessionId, { plan: steps, status: next, question: null });
    return next;
  }

  let raw = '';
  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      model: 'qwen/qwen3.7-plus',
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
    await patchSession(sessionId, { status: 'failed', error: 'Planning failed — try again.' });
    return 'failed';
  }

  let parsed: { steps?: { title?: unknown }[]; question?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    await patchSession(sessionId, { status: 'failed', error: 'Planning returned an unreadable plan.' });
    return 'failed';
  }

  // One clarifying question, only when allowed and only BEFORE any work —
  // an answered question re-enters planning (answer travels in the prompt).
  const question =
    typeof parsed.question === 'string' && parsed.question.trim() && parsed.question.trim().toLowerCase() !== 'null'
      ? parsed.question.trim().slice(0, 300)
      : null;
  if (question && session.allowQuestions && !session.answer) {
    await patchSession(sessionId, { status: 'awaiting_input', question });
    return 'awaiting_input';
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
    await patchSession(sessionId, { status: 'failed', error: "Couldn't build a plan from that goal." });
    return 'failed';
  }

  const next = session.autonomy === 'plan_first' ? 'awaiting_approval' : 'running';
  await patchSession(sessionId, { plan: steps, status: next, question: null });
  return next;
}

// ── Phase 2: execute ─────────────────────────────────────────────────────────

/**
 * Execute every pending step, updating the row after each so the client's
 * realtime subscription renders live progress. Idempotent: re-entry skips
 * steps already done (Inngest retries land here safely).
 */
export async function executeSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session || session.status !== 'running') return;

  // A Workspace Run is a separate VM substrate, not a broader permission set
  // for the background research agent. Planning remains deliberately shared.
  if (session.kind === 'workspace') {
    if (!session.workspaceRunId) {
      await patchSession(sessionId, { status: 'failed', error: 'Workspace Run is missing its durable link.' });
      return;
    }
    await dispatchWorkspaceRun({ runId: session.workspaceRunId, spaceId: session.spaceId, workSessionId: session.id, goal: session.goal, answer: session.answer });
    return;
  }

  const ctx = await contextForSpace(session.spaceId);
  if (!ctx) {
    await patchSession(sessionId, { status: 'failed', error: 'Workspace not found.' });
    return;
  }

  const tools = readOnlyTools().map((t) => toSdkTool(t, ctx));
  // Default chat model via the shared resolver (prompt-cache-wrapped).
  const model = getAgentModel();

  let plan = [...session.plan];
  const findings = [...session.findings];

  for (let i = 0; i < plan.length; i++) {
    if (plan[i].status === 'done' || plan[i].status === 'skipped') continue;

    // Cancelled mid-run? Stop cleanly between steps.
    const fresh = await getSession(sessionId);
    if (!fresh || fresh.status === 'cancelled') return;

    plan = plan.map((s, j) => (j === i ? { ...s, status: 'running' } : s));
    await patchSession(sessionId, { plan });

    try {
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
      const result = await run(agent, `Step: ${plan[i].title}${prior}`, {
        maxTurns: STEP_MAX_TURNS,
      });
      const text = (result.finalOutput ?? '').toString().trim().slice(0, FINDING_CAP);
      findings.push({ stepId: plan[i].id, text: text || '(no findings)' });
      plan = plan.map((s, j) => (j === i ? { ...s, status: 'done' } : s));
      await patchSession(sessionId, { plan, findings });
    } catch (err) {
      logger.warn('[work-sessions] step failed', { sessionId, step: plan[i].title }, err);
      plan = plan.map((s, j) => (j === i ? { ...s, status: 'skipped', note: 'Step failed — continued without it.' } : s));
      await patchSession(sessionId, { plan });
    }
  }

  await assembleArtifact(sessionId, findings);
}

// ── Phase 3: deliverable ─────────────────────────────────────────────────────

const ARTIFACT_PROMPT = `You are writing the FINISHED DELIVERABLE for a completed work session — a polished markdown document a real estate professional will read and share. Structure: a # title, a short executive summary, sections per theme (not per step), specific names/numbers/dates from the findings, and a final "Recommended next actions" section with concrete proposed actions (the assistant could not take actions itself). No preamble about being an AI. Also return a 1-2 sentence summary.

Return ONLY JSON: { "title": "<max 70 chars>", "markdown": "<the document>", "summary": "<1-2 sentences>" }`;

async function assembleArtifact(
  sessionId: string,
  findings: { stepId: string; text: string }[],
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session || session.status === 'cancelled') return;

  let title = 'Work session report';
  let markdown = '';
  let summary = '';
  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      model: 'qwen/qwen3.7-plus',
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

  // Save to Files (private; served via the Files page / signed download).
  const ctx = await contextForSpace(session.spaceId);
  let artifactFileId: string | null = null;
  const fileName = `${title.replace(/[^\w\s-]+/g, '').trim().slice(0, 60) || 'work-session'}.md`;
  try {
    const body = Buffer.from(markdown, 'utf-8');
    const key = buildKey('files', session.spaceId, `${sessionId.slice(0, 8)}-${fileName}`);
    await uploadObject({ key, body, contentType: 'text/markdown', isPublic: false });
    const { data: fileRow } = await supabase
      .from('File')
      .insert({
        spaceId: session.spaceId,
        userId: ctx?.userId ?? 'work-session',
        storageKey: key,
        name: fileName,
        mimeType: 'text/markdown',
        category: 'document',
        sizeBytes: body.byteLength,
        isPublic: false,
      })
      .select('id')
      .single();
    artifactFileId = (fileRow as { id: string } | null)?.id ?? null;
  } catch (err) {
    logger.warn('[work-sessions] artifact save failed — summary still lands', { sessionId }, err);
  }

  await patchSession(sessionId, {
    status: 'completed',
    summary,
    artifactFileId,
    artifactName: fileName,
    completedAt: new Date().toISOString(),
  });

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
}
