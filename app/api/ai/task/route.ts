/**
 * POST /api/ai/task — on-demand agent streaming endpoint.
 *
 * Post-cutover: every chat turn runs through the in-process TS runtime in
 * `lib/ai-tools/sdk-chat-stream.ts` (built on `@openai/agents`). The Modal
 * Python sandbox proxy that previously handled turns has been deleted —
 * its tools are mirrored on the TS side via `lib/ai-tools/tools/*` and the
 * SDK `Agent` runs them in-process.
 *
 * Pipeline:
 *   1. Auth the caller + resolve a ToolContext.
 *   2. Rate-limit (per-user, per-IP, per-space).
 *   3. Resolve/create the conversation; save the user message.
 *   4. Load recent history (capped at HISTORY_LIMIT).
 *   5. Hydrate any referenced Attachment rows for the SDK runtime to
 *      surface as context.
 *   6. Stream events through `streamTsChatTurn` — text deltas, tool
 *      calls, approval interrupts, completion.
 *   7. The stream pump persists the assistant's final text + handles
 *      AgentPausedRun creation for any approval interrupts.
 *
 * `runtime-flag.ts` retains a `'modal'` opt-out for one stability cycle in
 * case we need to revert; the modal proxy itself is gone, so setting
 * `CHIPPI_CHAT_RUNTIME=modal` will fail closed (501). The flag value
 * exists to make a future re-introduction (or full deletion) explicit.
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { saveUserMessage } from '@/lib/ai-tools/persistence';
import { resolveToolContext } from '@/lib/ai-tools/context';
import type { ToolContext } from '@/lib/ai-tools/types';
import {
  chippiErrorMessage,
  computeConversationTitle,
  fallbackHeuristic,
} from '@/lib/ai-tools/chippi-voice';
import {
  emit as emitTelemetry,
  hasEmitted as hasEmittedTelemetry,
  getFirstEmittedAt,
  secondsBetween,
} from '@/lib/telemetry';
import { chatRuntime } from '@/lib/ai-tools/runtime-flag';
import { streamTsChatTurn } from '@/lib/ai-tools/sdk-chat-stream';

interface HistoryRow {
  role: 'user' | 'assistant';
  content: string;
}

interface AttachmentPayload {
  id: string;
  filename: string;
  mime_type: string;
  extracted_text: string | null;
  public_url: string;
}

/** Cap on history messages fed to the model. */
const HISTORY_LIMIT = 20;

interface PostBody {
  spaceSlug: string;
  conversationId?: string | null;
  message: string;
  attachmentIds?: string[];
}

/**
 * Fire-and-forget: derive a 3-6 word title from the user's first message via
 * a one-shot LLM call and patch the row. We do NOT await this from the
 * request path. The title call is rate-limited per-space at 60/hour; past
 * that we fall back to a local heuristic.
 */
function autoTitleConversation(spaceId: string, conversationId: string, userMessage: string): void {
  void (async () => {
    try {
      const { allowed } = await checkRateLimit(`chat:title:${spaceId}`, 60, 3600);
      const title = allowed
        ? await computeConversationTitle(userMessage)
        : fallbackHeuristic(userMessage);
      if (!title || title === 'New conversation') return;
      const { error } = await supabase
        .from('Conversation')
        .update({ title, updatedAt: new Date().toISOString() })
        .eq('id', conversationId);
      if (error) {
        logger.warn('[ai/task] auto-title patch failed', { conversationId }, error);
      }
    } catch (err) {
      logger.warn('[ai/task] auto-title pipeline crashed', { conversationId }, err);
    }
  })();
}

async function resolveConversation(
  spaceId: string,
  conversationId: string | null | undefined,
  userMessage: string,
): Promise<string> {
  if (conversationId) {
    const { data } = await supabase
      .from('Conversation')
      .select('id, spaceId, title')
      .eq('id', conversationId)
      .maybeSingle();
    if (data && data.spaceId === spaceId) {
      if (!data.title || data.title === 'New conversation') {
        autoTitleConversation(spaceId, conversationId, userMessage);
      }
      return conversationId;
    }
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from('Conversation').insert({
    id,
    spaceId,
    title: 'New conversation',
  });
  if (error) throw error;
  autoTitleConversation(spaceId, id, userMessage);
  return id;
}

async function loadHistory(spaceId: string, conversationId: string): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from('Message')
    .select('role, content, createdAt')
    .eq('spaceId', spaceId)
    .eq('conversationId', conversationId)
    .order('createdAt', { ascending: true })
    .limit(HISTORY_LIMIT);

  const rows = (data ?? []) as Array<{ role: string; content: string }>;
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
}

/**
 * Hydrate the Attachment rows the realtor referenced in this turn into the
 * shape the SDK runtime expects. spaceId-scoped — the table is the trust
 * boundary, the same way every other agent tool treats spaceId. Wrapped in
 * try/catch so a transient Supabase blip never crashes the chat turn.
 */
async function hydrateAttachments(
  spaceId: string,
  ids: string[] | undefined,
): Promise<AttachmentPayload[]> {
  if (!ids || ids.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('Attachment')
      .select('id, filename, "mimeType", "extractedText", "publicUrl", "extractionStatus"')
      .in('id', ids)
      .eq('spaceId', spaceId);
    if (error) {
      logger.warn('[ai/task] attachment hydrate failed — continuing empty', { spaceId }, error);
      return [];
    }
    const rows = (data ?? []) as Array<{
      id: string;
      filename: string;
      mimeType: string;
      extractedText: string | null;
      publicUrl: string;
      extractionStatus: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      mime_type: r.mimeType,
      extracted_text: r.extractedText,
      public_url: r.publicUrl,
    }));
  } catch (err) {
    logger.warn('[ai/task] attachment hydrate threw — continuing empty', { spaceId }, err);
    return [];
  }
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const spaceSlug = typeof body.spaceSlug === 'string' ? body.spaceSlug.trim() : '';
  const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
  if (!spaceSlug) return NextResponse.json({ error: 'spaceSlug required' }, { status: 400 });
  if (!rawMessage) return NextResponse.json({ error: 'message required' }, { status: 400 });
  if (rawMessage.length > 8000) {
    return NextResponse.json({ error: 'message too long (8000 char max)' }, { status: 400 });
  }

  // Modal opt-out is failed closed post-cutover. The modal proxy code is
  // gone; the value exists only as an escape hatch we'd need to put code
  // back behind in an emergency. Surface a clear error rather than a
  // mysterious 500 if anyone sets it.
  if (chatRuntime() === 'modal') {
    return NextResponse.json(
      { error: 'Modal chat runtime has been retired. Unset CHIPPI_CHAT_RUNTIME or set it to "ts".' },
      { status: 501 },
    );
  }

  const abortController = new AbortController();

  const ctxOrResponse = await resolveToolContext(spaceSlug, abortController.signal);
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx: ToolContext = ctxOrResponse;

  const { allowed } = await checkRateLimit(`ai:task:${ctx.userId}`, 30, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: chippiErrorMessage('rate_limited') },
      { status: 429 },
    );
  }

  // Cap chat traffic per-IP and per-space. The SDK runtime is in-process so
  // cold-starts no longer cost Modal money, but the model API itself still
  // costs real tokens — keep the guardrails tight.
  const ip = getClientIp(req);
  const ipLimit = await checkRateLimit(`chat:ip:${ip}`, 30, 600);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: chippiErrorMessage('rate_limited') },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }
  const spaceLimit = await checkRateLimit(`chat:space:${ctx.space.id}`, 60, 600);
  if (!spaceLimit.allowed) {
    return NextResponse.json(
      { error: chippiErrorMessage('rate_limited') },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }

  let conversationId: string;
  try {
    conversationId = await resolveConversation(ctx.space.id, body.conversationId ?? null, rawMessage);
  } catch (err) {
    logger.error('[ai/task] conversation resolve failed', { spaceSlug }, err);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }

  try {
    await saveUserMessage({ spaceId: ctx.space.id, conversationId, content: rawMessage });
  } catch (err) {
    logger.error('[ai/task] save user message failed', { spaceSlug }, err);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }

  // Phase 2 telemetry: chippi_first_message — fire exactly once per space.
  void (async () => {
    try {
      if (await hasEmittedTelemetry(ctx.space.id, 'chippi_first_message')) return;
      const signupAt = await getFirstEmittedAt(ctx.space.id, 'signup_completed');
      await emitTelemetry({
        event: 'chippi_first_message',
        spaceId: ctx.space.id,
        userId: ctx.userId,
        payload: {
          conversationId,
          messagePreview: rawMessage.slice(0, 50),
          secondsFromSignup: secondsBetween(signupAt, new Date()),
        },
      });
    } catch (err) {
      logger.warn('[ai/task] first-message telemetry failed', { spaceSlug }, err);
    }
  })();

  let history: HistoryRow[];
  try {
    history = await loadHistory(ctx.space.id, conversationId);
  } catch (err) {
    logger.warn('[ai/task] history load failed — continuing without it', { spaceSlug }, err);
    history = [];
  }

  // Drop the just-persisted user message from history if it's the trailing
  // row — the runner expects history to be PRIOR turns + a separate `message`.
  if (history.length > 0) {
    const last = history[history.length - 1];
    if (last.role === 'user' && last.content === rawMessage) history.pop();
  }

  // Attachments resolved + passed through; the SDK runtime's system prompt
  // surfaces them when present.
  await hydrateAttachments(ctx.space.id, body.attachmentIds);

  return streamTsChatTurn({
    ctx,
    conversationId,
    userMessage: rawMessage,
    history,
    abortController,
  });
}
