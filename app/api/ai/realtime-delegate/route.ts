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

const bodySchema = z.discriminatedUnion('action', [startBodySchema, continueBodySchema, specialistStatusBodySchema, specialistCancelBodySchema]);
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
}): Promise<{ id: string; created: boolean }> {
  if (args.requestedId) {
    const { data, error } = await supabase
      .from('Conversation')
      .select('id, spaceId, title')
      .eq('id', args.requestedId)
      .eq('spaceId', args.spaceId)
      .maybeSingle();
    if (error) throw error;
    if (!isRealtorConversation(data, args.spaceId)) {
      throw new Error('conversation_not_found');
    }
    return { id: args.requestedId, created: false };
  }

  // A retried Realtime function call without an open conversation must land
  // in the same newly-created thread.
  const id = stableVoiceId(args.spaceId, 'new-conversation', args.callId, 'session');
  const now = new Date().toISOString();
  const insert = await supabase.from('Conversation').insert({
    id,
    spaceId: args.spaceId,
    title: fallbackHeuristic(args.goal),
    createdAt: now,
    updatedAt: now,
  });
  if (!insert.error) return { id, created: true };

  const { data: existing, error: existingError } = await supabase
    .from('Conversation')
    .select('id')
    .eq('id', id)
    .eq('spaceId', args.spaceId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw insert.error;
  return { id, created: false };
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
  const { data: existing } = await supabase
    .from('WorkSession')
    .select('*')
    .eq('id', sessionId)
    .eq('spaceId', auth.space.id)
    .maybeSingle();
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
    const { count: active } = await supabase
      .from('WorkSession')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', auth.space.id)
      .in('status', ['planning', 'awaiting_approval', 'awaiting_input', 'running']);
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
