/**
 * POST /api/ai/task — on-demand agent streaming endpoint.
 *
 * Responds with SSE events (see lib/ai-tools/events.ts for the protocol).
 * The client posts `{ spaceSlug, conversationId?, message }`; we:
 *
 *   1. Auth the caller + resolve a ToolContext
 *   2. Rate-limit
 *   3. Resolve/create the conversation
 *   4. Save the user message
 *   5. Load recent history
 *   6. Run the tool-use loop, streaming events as they arrive
 *   7. Save the assistant's blocks as a Message row
 *   8. Emit `turn_complete` and close the stream
 *
 * The loop itself lives in lib/ai-tools/loop.ts; this route is thin glue.
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type OpenAI from 'openai';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import type { AgentEvent } from '@/lib/ai-tools/events';
import { createSeqCounter, encodeEvent } from '@/lib/ai-tools/events';
import { runTurn } from '@/lib/ai-tools/loop';
import { getOpenAIClient, MissingOpenAIKeyError } from '@/lib/ai-tools/openai-client';
import { saveAssistantMessage, saveUserMessage } from '@/lib/ai-tools/persistence';
import { resolveToolContext } from '@/lib/ai-tools/context';
import { buildSystemPrompt } from '@/lib/ai-tools/system-prompt';
import type { ToolContext } from '@/lib/ai-tools/types';

type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Cap on history messages fed to the model. Matches the existing chat route. */
const HISTORY_LIMIT = 20;

interface PostBody {
  spaceSlug: string;
  conversationId?: string | null;
  message: string;
}

function sanitizeTitle(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveConversation(
  spaceId: string,
  conversationId: string | null | undefined,
  userMessage: string,
): Promise<string> {
  if (conversationId) {
    // Verify it belongs to this space; otherwise create a new one so the
    // user message doesn't get orphaned on a conversation they don't own.
    const { data } = await supabase
      .from('Conversation')
      .select('id, spaceId, title')
      .eq('id', conversationId)
      .maybeSingle();
    if (data && data.spaceId === spaceId) {
      // Auto-title on first message, same rule as /api/ai/chat.
      if (data.title === 'New conversation' || !data.title) {
        const autoTitle = sanitizeTitle(userMessage).slice(0, 60) || 'Task';
        await supabase
          .from('Conversation')
          .update({ title: autoTitle, updatedAt: new Date().toISOString() })
          .eq('id', conversationId);
      }
      return conversationId;
    }
  }

  const id = crypto.randomUUID();
  const autoTitle = sanitizeTitle(userMessage).slice(0, 60) || 'Task';
  const { error } = await supabase.from('Conversation').insert({
    id,
    spaceId,
    title: autoTitle,
  });
  if (error) throw error;
  return id;
}

async function loadHistory(spaceId: string, conversationId: string): Promise<ChatMsg[]> {
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

export async function POST(req: NextRequest) {
  // Body parse + shape check
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

  // One AbortController per request — the SSE stream cancels it on client
  // disconnect, which the loop surfaces to every tool handler.
  const abortController = new AbortController();

  const ctxOrResponse = await resolveToolContext(spaceSlug, abortController.signal);
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx: ToolContext = ctxOrResponse;

  // Rate limit after auth so 401s don't burn quota.
  const { allowed } = await checkRateLimit(`ai:task:${ctx.userId}`, 30, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded (30 tasks/hour). Please wait.' },
      { status: 429 },
    );
  }

  // Resolve or create the conversation before saving anything so a single
  // DB row carries both the user message and the assistant response.
  let conversationId: string;
  try {
    conversationId = await resolveConversation(ctx.space.id, body.conversationId ?? null, rawMessage);
  } catch (err) {
    logger.error('[ai/task] conversation resolve failed', { spaceSlug }, err);
    return NextResponse.json({ error: 'Could not start conversation' }, { status: 500 });
  }

  // Persist the user message before streaming — if the stream dies mid-turn
  // we still have the user's side in the transcript.
  try {
    await saveUserMessage({ spaceId: ctx.space.id, conversationId, content: rawMessage });
  } catch (err) {
    logger.error('[ai/task] save user message failed', { spaceSlug }, err);
    return NextResponse.json({ error: 'Could not save message' }, { status: 500 });
  }

  // Build the messages array: system + history + new turn.
  let history: ChatMsg[];
  try {
    history = await loadHistory(ctx.space.id, conversationId);
  } catch (err) {
    logger.warn('[ai/task] history load failed — continuing without it', { spaceSlug }, err);
    history = [];
  }

  // OpenAI client — fail fast if the key is missing rather than after the
  // user sees a stream open.
  let openai: OpenAI;
  try {
    openai = getOpenAIClient().client;
  } catch (err) {
    if (err instanceof MissingOpenAIKeyError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  const systemPrompt = buildSystemPrompt(ctx);
  const messages: ChatMsg[] = [
    { role: 'system', content: systemPrompt },
    // Don't re-include the last message if it matches the new one — happens
    // when the UI pre-wrote the user message optimistically and the same
    // message also lives in DB history.
    ...history.filter((m, i) => !(i === history.length - 1 && m.role === 'user' && m.content === rawMessage)),
    { role: 'user', content: rawMessage },
  ];

  // ── SSE stream ─────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  void encoder; // eslint no-unused — we use encodeEvent which creates its own TextEncoder internally

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const nextSeq = createSeqCounter();

      const pushEvent = async (event: Omit<AgentEvent, 'seq' | 'ts'>) => {
        const full = { ...event, seq: nextSeq(), ts: new Date().toISOString() } as AgentEvent;
        try {
          controller.enqueue(encodeEvent(full));
        } catch {
          // Controller may be closed if the client disconnected; swallow.
        }
      };

      try {
        const result = await runTurn({ openai, ctx, messages, pushEvent });

        // Persist the assistant's blocks (even partial turns get saved —
        // the transcript history reflects reality).
        try {
          await saveAssistantMessage({
            spaceId: ctx.space.id,
            conversationId,
            blocks: result.blocks,
          });
        } catch (err) {
          logger.error('[ai/task] save assistant message failed', { spaceSlug }, err);
        }

        await pushEvent({ type: 'turn_complete', reason: result.reason });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[ai/task] loop crashed', { spaceSlug }, err);
        await pushEvent({ type: 'error', message, code: 'internal' });
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Client disconnected; propagate to tool handlers via ctx.signal.
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable nginx buffering — some deploys front Vercel with a proxy
      // that otherwise chunks SSE events.
      'X-Accel-Buffering': 'no',
    },
  });
}
