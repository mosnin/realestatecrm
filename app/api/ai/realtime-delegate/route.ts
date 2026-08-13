import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { isRealtorConversation } from '@/lib/chat/conversation-access';
import { fallbackHeuristic } from '@/lib/ai-tools/chippi-voice';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { realtimeVoiceGatewayReady } from '@/lib/realtime/voice-feature';
import { stableVoiceId } from '@/lib/realtime/voice-delegation';
import { startWorkSession } from '@/lib/work-sessions/start';
import type { WorkSessionRow } from '@/lib/work-sessions/types';
import { continueWorkspaceForConversation } from '@/lib/workspace-runs/conversation-continuation';
import { isRealtimeVoiceFloorManagerEnabled } from '@/lib/realtime/floor-manager-flag';
import { createAndEnqueueSwarmRun } from '@/lib/swarm-launch';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';
import type { WorkExecutionMode } from '@/lib/chat/work-execution-mode';
import { resolveVoiceWorkExecutionMode } from '@/lib/realtime/voice-delegation';
import { userOwnsSpace } from '@/lib/space';

export const runtime = 'nodejs';

const startBodySchema = z.object({
  action: z.literal('start_work_session'),
  slug: z.string().trim().min(1).max(200),
  conversationId: z.string().trim().min(1).max(200).nullish(),
  callId: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(10).max(1000),
  autonomy: z.enum(['plan_first', 'just_go']).default('plan_first'),
  allowQuestions: z.boolean().default(true),
}).strict();

const continueBodySchema = z.object({
  action: z.literal('continue_workspace_run'),
  slug: z.string().trim().min(1).max(200),
  conversationId: z.string().trim().min(1).max(200),
  callId: z.string().trim().min(1).max(200),
  instruction: z.string().trim().min(3).max(1000),
}).strict();

const specialistStatusBodySchema = z.object({
  action: z.literal('get_specialist_status'),
  slug: z.string().trim().min(1).max(200),
  conversationId: z.string().trim().min(1).max(200),
  callId: z.string().trim().min(1).max(200),
}).strict();
const specialistCancelBodySchema = specialistStatusBodySchema.extend({
  action: z.literal('cancel_specialist_task'),
}).strict();
const specialistSpawnBodySchema = z.object({
  action: z.literal('spawn_specialist_team'),
  slug: z.string().trim().min(1).max(200),
  conversationId: z.string().trim().min(1).max(200).nullish(),
  callId: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(10).max(2000),
}).strict();

const bodySchema = z.discriminatedUnion('action', [
  startBodySchema,
  continueBodySchema,
  specialistSpawnBodySchema,
  specialistStatusBodySchema,
  specialistCancelBodySchema,
]);
const ACTIVE_SWARM_STATUSES = new Set(['queued', 'planning', 'running', 'auditing']);

function memberCounts(rows: Array<{ status?: unknown }> | null): {
  total: number; queued: number; running: number; completed: number; failed: number;
} {
  const counts = { total: 0, queued: 0, running: 0, completed: 0, failed: 0 };
  for (const row of rows ?? []) {
    if (!['queued', 'running', 'completed', 'failed'].includes(String(row.status))) continue;
    counts.total += 1;
    counts[row.status as 'queued' | 'running' | 'completed' | 'failed'] += 1;
  }
  return counts;
}

async function ensureConversation(args: {
  spaceId: string;
  requestedId: string | null;
  callId: string;
  goal: string;
  requireWorkMode?: boolean;
}): Promise<{
  id: string;
  created: boolean;
  mode: 'chat' | 'work' | null;
  executionMode: WorkExecutionMode;
}> {
  if (args.requestedId) {
    const { data, error } = await supabase
      .from('Conversation')
      .select('id, spaceId, title, mode, executionMode')
      .eq('id', args.requestedId)
      .eq('spaceId', args.spaceId)
      .maybeSingle();
    if (error) throw error;
    if (!isRealtorConversation(data, args.spaceId)) {
      throw new Error('conversation_not_found');
    }
    if (args.requireWorkMode && data.mode !== 'work') {
      throw new Error('conversation_not_work');
    }
    return {
      id: args.requestedId,
      created: false,
      mode: data.mode === 'chat' || data.mode === 'work' ? data.mode : null,
      executionMode: resolveVoiceWorkExecutionMode(data.executionMode),
    };
  }

  // A retried Realtime function call without an open conversation must land
  // in the same newly-created thread.
  const id = stableVoiceId(args.spaceId, 'new-conversation', args.callId, 'session');
  const now = new Date().toISOString();
  const insert = await supabase.from('Conversation').insert({
    id,
    spaceId: args.spaceId,
    title: fallbackHeuristic(args.goal),
    // A voice-created thread exists to hold background work, so its immutable
    // conversation type is Work from the first persisted turn.
    mode: 'work',
    executionMode: 'review',
    createdAt: now,
    updatedAt: now,
  });
  if (!insert.error) {
    return { id, created: true, mode: 'work', executionMode: 'review' };
  }

  const { data: existing, error: existingError } = await supabase
    .from('Conversation')
    .select('id, mode, executionMode')
    .eq('id', id)
    .eq('spaceId', args.spaceId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw insert.error;
  if (args.requireWorkMode && existing.mode !== 'work') {
    throw new Error('conversation_not_work');
  }
  return {
    id,
    created: false,
    mode: existing.mode === 'chat' || existing.mode === 'work' ? existing.mode : null,
    executionMode: resolveVoiceWorkExecutionMode(existing.executionMode),
  };
}

async function persistVoiceTurn(args: {
  spaceId: string;
  conversationId: string;
  callId: string;
  goal: string;
  sessionId: string;
}): Promise<void> {
  const userMessageId = stableVoiceId(
    args.spaceId,
    args.conversationId,
    args.callId,
    'user-message',
  );
  const assistantMessageId = stableVoiceId(
    args.spaceId,
    args.conversationId,
    args.callId,
    'assistant-message',
  );
  const userContent = `Start a work session: ${args.goal}`;
  const blocks: MessageBlock[] = [
    { type: 'text', content: 'I started this as a background work session.' },
    {
      type: 'work_session',
      sessionId: args.sessionId,
      goal: args.goal,
      source: 'voice',
    },
  ];
  const now = new Date().toISOString();

  const { error: userError } = await supabase.from('Message').upsert(
    {
      id: userMessageId,
      spaceId: args.spaceId,
      conversationId: args.conversationId,
      role: 'user',
      content: userContent,
      blocks: [{ type: 'text', content: userContent }],
      createdAt: now,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (userError) throw userError;

  const { error: assistantError } = await supabase.from('Message').upsert(
    {
      id: assistantMessageId,
      spaceId: args.spaceId,
      conversationId: args.conversationId,
      role: 'assistant',
      content: 'I started this as a background work session.',
      blocks: blocks as unknown as Record<string, unknown>[],
      createdAt: new Date(Date.now() + 1).toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (assistantError) throw assistantError;

  const { error: touchError } = await supabase
    .from('Conversation')
    .update({ updatedAt: new Date().toISOString() })
    .eq('id', args.conversationId)
    .eq('spaceId', args.spaceId);
  if (touchError) throw touchError;
}

/** Persist the voice-launched specialist card so it survives voice teardown. */
async function persistSpecialistTurn(args: {
  spaceId: string;
  conversationId: string;
  callId: string;
  goal: string;
  runId: string;
  delivery:
    | 'queued'
    | 'unconfirmed_recovery_armed'
    | 'already_accepted'
    | 'already_completed';
  status: string;
}): Promise<void> {
  const userMessageId = stableVoiceId(
    args.spaceId,
    args.conversationId,
    args.callId,
    'user-message',
  );
  const assistantMessageId = stableVoiceId(
    args.spaceId,
    args.conversationId,
    args.callId,
    'assistant-message',
  );
  const userContent = `Start a specialist team: ${args.goal}`;
  const assistantContent = args.delivery === 'queued'
    ? 'The specialist request is durably queued. This does not mean a specialist has started yet.'
    : args.delivery === 'unconfirmed_recovery_armed'
      ? 'I saved the specialist request and armed durable recovery, but delivery is not confirmed yet.'
      : args.delivery === 'already_completed'
        ? 'This matching specialist request was already completed. I did not start another team.'
        : `This matching specialist request already existed with status ${args.status}. I did not start another team.`;
  const blocks: MessageBlock[] = [
    { type: 'text', content: assistantContent },
    {
      type: 'subagent_task',
      callId: args.callId,
      runId: args.runId,
      goal: args.goal,
    },
  ];
  const now = new Date().toISOString();

  const { error: userError } = await supabase.from('Message').upsert(
    {
      id: userMessageId,
      spaceId: args.spaceId,
      conversationId: args.conversationId,
      role: 'user',
      content: userContent,
      blocks: [{ type: 'text', content: userContent }],
      createdAt: now,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (userError) throw userError;

  const { error: assistantError } = await supabase.from('Message').upsert(
    {
      id: assistantMessageId,
      spaceId: args.spaceId,
      conversationId: args.conversationId,
      role: 'assistant',
      content: assistantContent,
      blocks: blocks as unknown as Record<string, unknown>[],
      createdAt: new Date(Date.now() + 1).toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (assistantError) throw assistantError;

  const { error: touchError } = await supabase
    .from('Conversation')
    .update({ updatedAt: new Date().toISOString() })
    .eq('id', args.conversationId)
    .eq('spaceId', args.spaceId);
  if (touchError) throw touchError;
}

/** Persist the voice continuation itself so a reload retains its run/task binding. */
async function persistWorkspaceContinuationTurn(args: {
  spaceId: string;
  conversationId: string;
  callId: string;
  instruction: string;
  runId: string;
  taskId: string;
  status: string;
}): Promise<void> {
  const userMessageId = stableVoiceId(args.spaceId, args.conversationId, args.callId, 'user-message');
  const assistantMessageId = stableVoiceId(args.spaceId, args.conversationId, args.callId, 'assistant-message');
  const userContent = `Continue the workspace: ${args.instruction}`;
  const assistantContent = 'I started a private workspace continuation.';
  const blocks: MessageBlock[] = [
    { type: 'text', content: assistantContent },
    {
      type: 'tool_call',
      callId: args.callId,
      name: 'continue_workspace_run',
      args: { instruction: args.instruction },
      result: {
        ok: true,
        summary: assistantContent,
        data: { runId: args.runId, taskId: args.taskId, status: args.status, openWorkspacePanel: true },
      },
      status: 'complete',
      display: 'success',
    },
  ];
  const now = new Date().toISOString();
  const { error: userError } = await supabase.from('Message').upsert({
    id: userMessageId,
    spaceId: args.spaceId,
    conversationId: args.conversationId,
    role: 'user',
    content: userContent,
    blocks: [{ type: 'text', content: userContent }],
    createdAt: now,
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (userError) throw userError;
  const { error: assistantError } = await supabase.from('Message').upsert({
    id: assistantMessageId,
    spaceId: args.spaceId,
    conversationId: args.conversationId,
    role: 'assistant',
    content: assistantContent,
    blocks: blocks as unknown as Record<string, unknown>[],
    createdAt: new Date(Date.now() + 1).toISOString(),
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (assistantError) throw assistantError;
  const { error: touchError } = await supabase
    .from('Conversation')
    .update({ updatedAt: new Date().toISOString() })
    .eq('id', args.conversationId)
    .eq('spaceId', args.spaceId);
  if (touchError) throw touchError;
}

export async function POST(req: Request) {
  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const rawBody = read.data && typeof read.data === 'object' && !Array.isArray(read.data)
    ? { ...(read.data as Record<string, unknown>), action: (read.data as Record<string, unknown>).action ?? 'start_work_session' }
    : read.data;
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid voice delegation request.' }, { status: 400 });
  }
  const body = parsed.data;
  const specialistControl = body.action === 'get_specialist_status' || body.action === 'cancel_specialist_task';
  if (specialistControl && !isRealtimeVoiceFloorManagerEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!realtimeVoiceGatewayReady()) {
    return NextResponse.json({ error: 'Voice delegation is unavailable.' }, { status: 503 });
  }

  const auth = await requireSpaceOwner(body.slug);
  if (auth instanceof NextResponse) return auth;

  // The general space guard intentionally permits broker owners/admins to
  // manage member spaces. Voice delegation is a realtor personal-space
  // capability, so broker authority must not cross this principal boundary.
  try {
    if (!(await userOwnsSpace(auth.space.id, auth.userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Could not verify voice access.' }, { status: 503 });
  }

  if (body.action === 'spawn_specialist_team') {
    let conversation: Awaited<ReturnType<typeof ensureConversation>>;
    try {
      conversation = await ensureConversation({
        spaceId: auth.space.id,
        requestedId: body.conversationId ?? null,
        callId: body.callId,
        goal: body.goal,
        requireWorkMode: true,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'conversation_not_found') {
        return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
      }
      if (error instanceof Error && error.message === 'conversation_not_work') {
        return NextResponse.json(
          { error: 'Specialist teams can only be started from a Work conversation.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: 'Could not prepare the Work conversation.' }, { status: 500 });
    }

    // The model supplies only the goal. Tenant, conversation, policy, run id,
    // and launch token are all derived from authenticated server context.
    const runId = stableVoiceId(
      auth.space.id,
      conversation.id,
      body.callId,
      'specialist-run',
    );
    const launchToken = stableVoiceId(
      auth.space.id,
      conversation.id,
      body.callId,
      'specialist-launch',
    );
    const { data: existingRun, error: existingRunError } = await supabase
      .from('SwarmRun')
      .select('id,spaceId,conversationId,goal,customAgentIds,launchToken,status,modalAcceptedAt')
      .eq('id', runId)
      .eq('spaceId', auth.space.id)
      .maybeSingle();
    if (existingRunError) {
      return NextResponse.json({ error: 'Could not verify the specialist request.' }, { status: 500 });
    }
    if (
      existingRun &&
      (existingRun.conversationId !== conversation.id ||
        existingRun.goal !== body.goal ||
        existingRun.launchToken !== launchToken ||
        !Array.isArray(existingRun.customAgentIds) ||
        existingRun.customAgentIds.length !== 0)
    ) {
      return NextResponse.json({ error: 'Conflicting voice function retry.' }, { status: 409 });
    }

    if (existingRun && ['failed', 'cancelled'].includes(String(existingRun.status))) {
      return NextResponse.json(
        { error: `The previous specialist request is ${existingRun.status}. Start a new voice request.` },
        { status: 409 },
      );
    }
    const alreadyAccepted = Boolean(
      existingRun &&
        (existingRun.modalAcceptedAt || ['planning', 'running', 'auditing', 'completed'].includes(String(existingRun.status))),
    );
    if (!existingRun) {
      const rl = await checkRateLimit(`realtime:spawn-specialist:${auth.space.id}`, 6, 3600);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Too many specialist teams started from voice this hour.' },
          { status: 429, headers: { 'Retry-After': '3600' } },
        );
      }
    }

    if (!alreadyAccepted) {
      try {
        await assertSpaceEnabled(auth.space.id);
      } catch {
        return NextResponse.json({ error: 'This workspace is paused.' }, { status: 403 });
      }
    }

    const launch = alreadyAccepted
      ? {
          state: 'already_exists' as const,
          runId,
          launchToken,
          spaceId: auth.space.id,
          status: String(existingRun?.status ?? 'queued'),
          reused: true as const,
        }
      : await createAndEnqueueSwarmRun({
          spaceId: auth.space.id,
          conversationId: conversation.id,
          goal: body.goal,
          customAgentIds: [],
          idempotencyIdentity: { runId, launchToken },
        });

    if (launch.state === 'concurrent') {
      return NextResponse.json({ error: launch.error }, { status: 409 });
    }
    if (launch.state === 'unavailable') {
      return NextResponse.json({ error: launch.error }, { status: 503 });
    }
    if (launch.state === 'failed') {
      return NextResponse.json({ error: launch.error }, { status: 500 });
    }
    if (
      launch.state === 'already_exists' &&
      ['failed', 'cancelled'].includes(String(launch.status))
    ) {
      return NextResponse.json(
        { error: `The previous specialist request is ${launch.status}. Start a new voice request.` },
        { status: 409 },
      );
    }

    const reused = launch.state === 'already_exists' || launch.reused === true;
    const status = launch.state === 'already_exists' ? launch.status : 'queued';
    const delivery = launch.state === 'delivery_unknown'
      ? 'unconfirmed_recovery_armed'
      : launch.state === 'already_exists'
        ? status === 'completed'
          ? 'already_completed'
          : 'already_accepted'
        : 'queued';
    const accepted = launch.state !== 'delivery_unknown';
    let conversationRecorded = true;
    try {
      await persistSpecialistTurn({
        spaceId: auth.space.id,
        conversationId: conversation.id,
        callId: body.callId,
        goal: body.goal,
        runId: launch.runId,
        delivery,
        status,
      });
    } catch {
      // The server-side request identity and recovery state are already
      // durable. A call-id retry repairs the conversation card without
      // launching a second specialist team.
      conversationRecorded = false;
    }

    return NextResponse.json(
      {
        ok: true,
        action: body.action,
        accepted,
        requestSaved: true,
        recoveryArmed: launch.state === 'delivery_unknown',
        newlyQueued: launch.state === 'queued',
        conversationId: conversation.id,
        conversationCreated: conversation.created,
        conversationRecorded,
        executionMode: conversation.executionMode,
        runId: launch.runId,
        status,
        delivery,
        reused,
      },
      { status: launch.state === 'delivery_unknown' ? 202 : reused ? 200 : 201 },
    );
  }

  if (specialistControl) {
    try {
      await ensureConversation({
        spaceId: auth.space.id,
        requestedId: body.conversationId,
        callId: body.callId,
        goal: body.action,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'conversation_not_found') {
        return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Could not verify the conversation.' }, { status: 500 });
    }

    // A repeated cancellation call must reach the durable receipt even when
    // the caller has since exhausted the quota. Otherwise a provider retry
    // could be rejected after the first call already changed state.
    let existingCancelReceipt = false;
    if (body.action === 'cancel_specialist_task') {
      const { data: receipt, error: receiptError } = await supabase
        .from('RealtimeSwarmControlReceipt')
        .select('id')
        .eq('spaceId', auth.space.id)
        .eq('conversationId', body.conversationId)
        .eq('callId', body.callId)
        .eq('action', 'cancel_specialist_task')
        .maybeSingle();
      if (receiptError) {
        return NextResponse.json({ error: 'Could not verify the specialist control request.' }, { status: 500 });
      }
      existingCancelReceipt = Boolean(receipt);
    }
    if (!existingCancelReceipt) {
      const rl = await checkRateLimit(`realtime:floor-manager:${auth.space.id}`, 30, 60);
      if (!rl.allowed) {
        return NextResponse.json({ error: 'Too many voice control requests. Try again shortly.' }, { status: 429 });
      }
    }

    if (body.action === 'get_specialist_status') {
      const { data: run, error: runError } = await supabase
        .from('SwarmRun')
        .select('id,status')
        .eq('spaceId', auth.space.id)
        .eq('conversationId', body.conversationId)
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (runError) return NextResponse.json({ error: 'Could not read specialist status.' }, { status: 500 });
      if (!run) {
        return NextResponse.json({
          ok: true,
          action: body.action,
          found: false,
          status: 'none',
          active: false,
          terminal: false,
          failed: false,
          members: memberCounts(null),
          resultAvailable: false,
        });
      }
      const { data: members, error: membersError } = await supabase
        .from('SwarmMember')
        .select('status')
        .eq('swarmRunId', run.id)
        .limit(50);
      if (membersError) return NextResponse.json({ error: 'Could not read specialist status.' }, { status: 500 });
      let resultAvailable = false;
      if (run.status === 'completed') {
        const { count, error: resultError } = await supabase
          .from('SwarmRun')
          .select('id', { count: 'exact', head: true })
          .eq('id', run.id)
          .eq('spaceId', auth.space.id)
          .not('result', 'is', null);
        if (resultError) return NextResponse.json({ error: 'Could not read specialist status.' }, { status: 500 });
        resultAvailable = (count ?? 0) > 0;
      }
      const active = ACTIVE_SWARM_STATUSES.has(run.status);
      return NextResponse.json({
        ok: true,
        action: body.action,
        found: true,
        // Browser-only hydration handle; function_call_output omits it.
        runId: run.id,
        status: run.status,
        active,
        terminal: !active,
        failed: run.status === 'failed',
        members: memberCounts(members),
        resultAvailable,
      });
    }

    const { data: cancelled, error: cancelError } = await supabase.rpc('cancel_conversation_swarm_run', {
      p_space_id: auth.space.id,
      p_conversation_id: body.conversationId,
      p_call_id: body.callId,
    });
    if (cancelError) return NextResponse.json({ error: 'Could not stop the specialist task.' }, { status: 500 });
    const row = Array.isArray(cancelled) ? cancelled[0] : cancelled;
    if (!row) return NextResponse.json({ error: 'Could not stop the specialist task.' }, { status: 500 });
    return NextResponse.json({
      ok: true,
      action: body.action,
      found: Boolean(row.run_id),
      // Browser-only hydration handle; function_call_output omits it.
      runId: row.run_id ?? null,
      status: row.status ?? 'none',
      outcome: row.outcome,
      reused: row.reused === true,
    });
  }

  if (body.action === 'continue_workspace_run') {
    try {
      await ensureConversation({
        spaceId: auth.space.id,
        requestedId: body.conversationId,
        callId: body.callId,
        goal: body.instruction,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'conversation_not_found') {
        return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Could not verify the conversation.' }, { status: 500 });
    }
    const result = await continueWorkspaceForConversation({
      spaceId: auth.space.id,
      conversationId: body.conversationId,
      instruction: body.instruction,
      idempotencySeed: `voice:${body.callId}`,
    });
    if (!result.ok) {
      const status = result.code === 'planning_unavailable' ? 503 : ['active', 'conflict', 'not_completed'].includes(result.code) ? 409 : result.code === 'disabled' || result.code === 'not_found' ? 404 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }
    let conversationRecorded = true;
    try {
      await persistWorkspaceContinuationTurn({
        spaceId: auth.space.id,
        conversationId: body.conversationId,
        callId: body.callId,
        instruction: body.instruction,
        runId: result.runId,
        taskId: result.taskId,
        status: result.status,
      });
    } catch {
      // The queue acceptance is already durable; never report that it failed.
      // A provider retry with this call id will idempotently repair the record.
      conversationRecorded = false;
    }
    return NextResponse.json({
      ok: true,
      conversationId: body.conversationId,
      workspaceRunId: result.runId,
      taskId: result.taskId,
      status: result.status,
      reused: result.reused,
      conversationRecorded,
    }, { status: result.reused ? 200 : 201 });
  }
  if (body.action !== 'start_work_session') {
    return NextResponse.json({ error: 'Invalid voice delegation request.' }, { status: 400 });
  }

  const anticipatedConversationId =
    body.conversationId ??
    stableVoiceId(auth.space.id, 'new-conversation', body.callId, 'session');
  const sessionId = stableVoiceId(
    auth.space.id,
    anticipatedConversationId,
    body.callId,
    'session',
  );

  // Idempotency is checked before quota: a provider retry receives the first
  // accepted result instead of being rejected or consuming another slot.
  const { data: existing, error: existingError } = await supabase
    .from('WorkSession')
    .select('*')
    .eq('id', sessionId)
    .eq('spaceId', auth.space.id)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: 'Could not verify the voice work session.' }, { status: 500 });
  }
  if (
    existing &&
    ((existing as WorkSessionRow).goal !== body.goal ||
      (existing as WorkSessionRow).conversationId !== anticipatedConversationId)
  ) {
    return NextResponse.json({ error: 'Conflicting voice function retry.' }, { status: 409 });
  }

  if (!existing) {
    const rl = await checkRateLimit(`realtime:delegate:${auth.space.id}`, 10, 3600);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many voice work sessions this hour.' }, { status: 429 });
    }
    const { count: active, error: activeError } = await supabase
      .from('WorkSession')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', auth.space.id)
      .in('status', ['planning', 'awaiting_approval', 'awaiting_input', 'running']);
    if (activeError) {
      return NextResponse.json({ error: 'Could not verify active work sessions.' }, { status: 500 });
    }
    if ((active ?? 0) >= 2) {
      return NextResponse.json(
        { error: 'Two work sessions are already in flight.' },
        { status: 409 },
      );
    }
  }

  let conversation: { id: string; created: boolean };
  try {
    conversation = await ensureConversation({
      spaceId: auth.space.id,
      requestedId: body.conversationId ?? null,
      callId: body.callId,
      goal: body.goal,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'conversation_not_found') {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Could not prepare the conversation.' }, { status: 500 });
  }

  let session: WorkSessionRow;
  try {
    ({ session } = await startWorkSession({
      id: sessionId,
      spaceId: auth.space.id,
      conversationId: conversation.id,
      goal: body.goal,
      autonomy: body.autonomy,
      allowQuestions: body.allowQuestions,
    }));
    await persistVoiceTurn({
      spaceId: auth.space.id,
      conversationId: conversation.id,
      callId: body.callId,
      goal: body.goal,
      sessionId,
    });
  } catch {
    return NextResponse.json(
      {
        error: 'The work session was not durably accepted. Please try again.',
        conversationId: conversation.id,
        sessionId,
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      conversationId: conversation.id,
      conversationCreated: conversation.created,
      session: {
        id: session.id,
        goal: session.goal,
        status: session.status,
        autonomy: session.autonomy,
      },
    },
    { status: existing ? 200 : 201 },
  );
}
