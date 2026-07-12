import 'server-only';
/**
 * Work Session engine — Chippi's long-running, goal-driven background runs.
 *
 * A session is: plan (LLM → 3–6 steps) → optional approval gate → execute
 * (one non-interactive agent run per step) → deliverable (markdown artifact
 * assembled from findings, saved to Files, and reported back into the chat
 * conversation it started from) → summary + push. Every transition is an
 * UPDATE on the WorkSession row, which the client watches over Supabase
 * Realtime — the row IS the progress feed. While running, `currentAction`
 * carries one live narration line ("Searching contacts…") updated as tools
 * fire, so the card reads like a colleague working, not a batch job.
 *
 * Safety posture: session runs execute with the read-only tool subset
 * (requiresApproval === false) plus exactly ONE write — stage_message_draft,
 * which creates PENDING AgentDraft rows. The drafts inbox IS the approval:
 * nothing sends, nothing mutates records. Everything else the session wants
 * done is proposed in the deliverable instead of taken.
 *
 * Mid-run replanning: a step agent that discovers work the plan missed ends
 * its answer with `NEW_STEP: <title>` lines; the engine appends them as
 * pending steps (bounded at MAX_TOTAL_STEPS) so a session can follow a lead
 * without a human re-prompting it.
 *
 * Runs inside Inngest functions (durable, retried) with an inline after()
 * fallback when Inngest isn't configured (previews) — same contract either
 * way because every entry point is just "advance this session id".
 */

import crypto from 'crypto';
import { run, Agent } from '@openai/agents';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getLLMClient } from '@/lib/llm';
import { getAgentModel } from '@/lib/ai-tools/agent-model';
import { toSdkTool } from '@/lib/ai-tools/sdk-bridge';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import type { ToolContext, ToolDefinition } from '@/lib/ai-tools/types';
import { uploadObject, buildKey } from '@/lib/storage';
import { sendPushToSpace } from '@/lib/push';
import { inngest } from '@/lib/inngest/client';
import { humanizeToolCall, parseNewSteps } from './narration';
import { makeStageDraftTool } from './draft-tool';

// ── Types ────────────────────────────────────────────────────────────────────
// Shared with the client strip via lib/work-sessions/types.ts (types-only
// module — the strip must never import this server-only file).

import type { PlanStep, WorkSessionRow } from './types';
export type { PlanStep, WorkSessionRow } from './types';

const MAX_STEPS = 6;
/** Hard ceiling including steps added mid-run — replanning can't run away. */
const MAX_TOTAL_STEPS = 8;
const STEP_MAX_TURNS = 12;
const FINDING_CAP = 6000;
/** How much of each prior finding travels into the next step's prompt. */
const PRIOR_FINDING_CHARS = 1200;

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

/** The read-only tool subset a background run may use. */
function readOnlyTools(): ToolDefinition[] {
  return ALL_TOOLS.filter((t) => t.requiresApproval === false);
}

/**
 * Wrap a tool so starting it narrates onto the session row. Fire-and-forget:
 * narration must never slow down or fail the actual tool call, and a lost
 * update just means the strip shows the previous line a beat longer.
 */
function withNarration(def: ToolDefinition, sessionId: string): ToolDefinition {
  const line = humanizeToolCall(def.name);
  return {
    ...def,
    handler: async (args: never, ctx: ToolContext) => {
      void patchSession(sessionId, { currentAction: line });
      return def.handler(args, ctx);
    },
  } as ToolDefinition;
}

/**
 * Everything a session step may call: the read-only registry plus the one
 * sanctioned write (stage_message_draft → PENDING AgentDraft rows), all
 * narration-wrapped so the strip's live line tracks the run.
 */
function sessionTools(sessionId: string, goal: string): ToolDefinition[] {
  return [...readOnlyTools(), makeStageDraftTool(sessionId, goal)].map((t) =>
    withNarration(t, sessionId),
  );
}

// ── Recurrence ───────────────────────────────────────────────────────────────

/**
 * Clone a completed recurring session into a fresh run. Called by the Inngest
 * recur function after its sleep. Returns the new session id, or null when
 * the chain should skip this occurrence:
 *   - recurrence was turned off while sleeping (the stop_recurrence action)
 *   - the space already has 2 sessions in flight (same cap as the POST route)
 *
 * Clones run just_go with questions off — the realtor already approved the
 * shape of this work by making it recurring; a 6am run stuck on "waiting for
 * your approval" defeats the point.
 */
export async function cloneRecurringSession(sessionId: string): Promise<string | null> {
  const session = await getSession(sessionId);
  if (!session || session.recurrence === 'none') return null;

  const { count: active } = await supabase
    .from('WorkSession')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', session.spaceId)
    .in('status', ['planning', 'awaiting_approval', 'awaiting_input', 'running']);
  if ((active ?? 0) >= 2) {
    logger.warn('[work-sessions] recurrence skipped — space busy', { sessionId });
    return null;
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from('WorkSession').insert({
    id,
    spaceId: session.spaceId,
    conversationId: session.conversationId,
    goal: session.goal,
    autonomy: 'just_go',
    allowQuestions: false,
    recurrence: session.recurrence,
  });
  if (error) {
    logger.error('[work-sessions] recurrence clone failed', { sessionId }, error);
    return null;
  }
  return id;
}

// ── Phase 1: plan ────────────────────────────────────────────────────────────

const PLAN_PROMPT = `You are planning a background work session for a real estate professional's AI assistant. Break the goal into 3-${MAX_STEPS} concrete steps. The session can READ the CRM (contacts, deals, tours, properties), research areas and comparables, STAGE message drafts into the drafts inbox (they wait for the realtor's approval — nothing is ever sent automatically), and produce a written deliverable. It cannot send messages or modify records, so no step may be "send X" or "create Y" — but "draft follow-up messages to X" IS a valid step when the goal calls for outreach.

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

  const ctx = await contextForSpace(session.spaceId);
  if (!ctx) {
    await patchSession(sessionId, { status: 'failed', error: 'Workspace not found.' });
    return;
  }

  const tools = sessionTools(sessionId, session.goal).map((t) => toSdkTool(t, ctx));
  // Default chat model via the shared resolver (prompt-cache-wrapped).
  const model = getAgentModel();

  let plan = [...session.plan];
  const findings = [...session.findings];

  // Plain `for` over a growing array on purpose: replanning appends pending
  // steps while we iterate, and the loop picks them up naturally.
  for (let i = 0; i < plan.length; i++) {
    if (plan[i].status === 'done' || plan[i].status === 'skipped') continue;

    // Cancelled mid-run? Stop cleanly between steps.
    const fresh = await getSession(sessionId);
    if (!fresh || fresh.status === 'cancelled') {
      await patchSession(sessionId, { currentAction: null });
      return;
    }

    plan = plan.map((s, j) => (j === i ? { ...s, status: 'running' } : s));
    await patchSession(sessionId, { plan, currentAction: plan[i].title });

    try {
      const agent = new Agent({
        name: 'work_session_step',
        model,
        instructions:
          `You are executing ONE step of a background work session for a real estate professional. ` +
          `Use the tools to gather what the step needs, then answer with your findings — ` +
          `specific names, numbers, and dates, written so they can be dropped into a report. ` +
          `You may stage message drafts with stage_message_draft when the step calls for outreach — ` +
          `drafts wait in the drafts inbox for the realtor's approval; NEVER claim a message was sent. ` +
          `You cannot send or modify anything else; note other actions as recommendations. ` +
          `If you discover important work the plan missed, end your answer with one line per new step, ` +
          `formatted exactly: NEW_STEP: <imperative title>. At most 2, and only for genuinely necessary work.\n\n` +
          `Session goal: ${session.goal}` +
          (session.answer ? `\nRealtor clarification: ${session.answer}` : ''),
        tools,
      });
      const prior = findings.length
        ? `\n\nFindings so far:\n${findings.map((f) => `- ${f.text.slice(0, PRIOR_FINDING_CHARS)}`).join('\n')}`
        : '';
      const result = await run(agent, `Step: ${plan[i].title}${prior}`, {
        maxTurns: STEP_MAX_TURNS,
      });
      const raw = (result.finalOutput ?? '').toString().trim();
      const { text, newSteps } = parseNewSteps(raw);
      findings.push({ stepId: plan[i].id, text: text.slice(0, FINDING_CAP) || '(no findings)' });
      plan = plan.map((s, j) => (j === i ? { ...s, status: 'done' } : s));
      // Mid-run replanning: append discovered steps, bounded so a chatty
      // agent can't turn a 4-step session into an afternoon.
      for (const title of newSteps) {
        if (plan.length >= MAX_TOTAL_STEPS) break;
        const duplicate = plan.some((s) => s.title.toLowerCase() === title.toLowerCase());
        if (duplicate) continue;
        plan = [...plan, { id: `s${plan.length + 1}`, title, status: 'pending', note: 'Added mid-run' }];
      }
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

const ARTIFACT_PROMPT = `You are writing the FINISHED DELIVERABLE for a completed work session — a polished markdown document a real estate professional will read and share. Structure: a # title, a short executive summary, sections per theme (not per step), specific names/numbers/dates from the findings, and a final "Recommended next actions" section with concrete proposed actions. If the session staged message drafts, say so and point the reader to the drafts inbox to review them — drafts were staged, never sent. No preamble about being an AI. Also return a 1-2 sentence summary.

Return ONLY JSON: { "title": "<max 70 chars>", "markdown": "<the document>", "summary": "<1-2 sentences>" }`;

async function assembleArtifact(
  sessionId: string,
  findings: { stepId: string; text: string }[],
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session || session.status === 'cancelled') return;

  await patchSession(sessionId, { currentAction: 'Writing the report…' });

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
          content:
            `Goal: ${session.goal}\n\n` +
            (session.draftCount > 0
              ? `Message drafts staged into the drafts inbox during this session: ${session.draftCount}\n\n`
              : '') +
            `Findings:\n${findings.map((f, i) => `## Step ${i + 1}\n${f.text}`).join('\n\n')}`,
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
    currentAction: null,
    completedAt: new Date().toISOString(),
  });

  // Report back into the conversation the session was started from, so the
  // result lives where the realtor already is — the chat — not only behind
  // a Files download. Best-effort: the session row carries everything too.
  if (session.conversationId) {
    try {
      const note =
        `**Work session finished:** ${title}\n\n${summary}` +
        (session.draftCount > 0
          ? `\n\n${session.draftCount} message draft${session.draftCount === 1 ? ' is' : 's are'} waiting in your drafts inbox.`
          : '') +
        (artifactFileId ? `\n\n_The full report is in your Files as "${fileName}"._` : '');
      await supabase.from('Message').insert({
        id: crypto.randomUUID(),
        spaceId: session.spaceId,
        conversationId: session.conversationId,
        role: 'assistant',
        content: note,
        blocks: [{ type: 'text', content: note }],
      });
    } catch (err) {
      logger.warn('[work-sessions] chat report failed', { sessionId }, err);
    }
  }

  // Recurring sessions re-queue themselves. Inngest-only: the recur function
  // sleeps until the next occurrence, which the inline after() fallback
  // can't survive — without Inngest the recurrence setting is inert.
  if (session.recurrence !== 'none' && process.env.INNGEST_EVENT_KEY) {
    try {
      await inngest.send({ name: 'work-session/recur', data: { sessionId } });
    } catch (err) {
      logger.warn('[work-sessions] recur event failed', { sessionId }, err);
    }
  }

  // Best-effort completion ping — the whole point of a background run is
  // that you left; this is how you learn it's done.
  void sendPushToSpace(session.spaceId, {
    title: 'Chippi finished a work session',
    body: title,
    url: '/',
  }).catch(() => {});
}
