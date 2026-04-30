/**
 * POST /api/ai/task — on-demand agent streaming endpoint.
 *
 * Thin SSE proxy in front of the Modal `chat_turn` web endpoint. The Modal
 * function spawns a fresh per-conversation Sandbox, runs the OpenAI Agents
 * SDK inside it, and streams JSONL events back over text/event-stream. We:
 *
 *   1. Auth the caller + resolve a ToolContext
 *   2. Rate-limit
 *   3. Resolve/create the conversation
 *   4. Save the user message
 *   5. Load recent history
 *   6. Hydrate any referenced attachments (best-effort — the table lands in
 *      a separate commit, so missing-table errors are swallowed for now)
 *   7. POST to MODAL_CHAT_URL with `{secret, space_id, conversation_id,
 *      message, history, attachments}` and stream events back to the client
 *   8. Translate sandbox events (token/tool_call_start/tool_call_result/
 *      handoff/done/error) into the typed AgentEvent shape the client
 *      already understands (text_delta / tool_call_start / tool_call_result
 *      / turn_complete / error). seq+ts framing is stamped here.
 *   9. After the stream closes, persist the assistant's final text as a
 *      Message row so the transcript survives a refresh.
 *
 * The in-process tool loop in lib/ai-tools/loop.ts is no longer invoked
 * from here. Tool execution lives inside the sandbox via the openai-agents
 * SDK; lib/ai-tools/* still backs the legacy approve/deny endpoints until
 * they migrate.
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import type { AgentEvent, PushableEvent } from '@/lib/ai-tools/events';
import { createSeqCounter, encodeEvent } from '@/lib/ai-tools/events';
import { saveAssistantMessage, saveUserMessage } from '@/lib/ai-tools/persistence';
import { resolveToolContext } from '@/lib/ai-tools/context';
import type { ToolContext } from '@/lib/ai-tools/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import {
  chippiErrorMessage,
  classifyError,
  computeConversationTitle,
  fallbackHeuristic,
} from '@/lib/ai-tools/chippi-voice';

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

/** Cap on history messages fed to the model. Matches the existing chat route. */
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
 * request path — the LLM call is ~200ms but should never delay the
 * assistant's first token. Logged on failure; the conversation just keeps
 * its prior title.
 *
 * The title call is rate-limited per-space at 60/hour. Past that we fall
 * back to the local heuristic so a busy realtor still gets a title — just a
 * cruder one — instead of an OpenAI bill spike.
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
  // Insert with a placeholder so the row exists immediately, then auto-title
  // out of band — same fire-and-forget treatment as the existing-row path.
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
 * shape sandbox_runner.py expects. spaceId-scoped — the table is the trust
 * boundary, the same way every other agent tool treats spaceId. Wrapped in
 * try/catch so a transient Supabase blip never crashes the chat turn; the
 * sandbox is happy with an empty list.
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
    if (error) throw error;
    if (!data) return [];
    const rows = data as Array<{
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
    logger.warn('[ai/task] attachment hydration failed', { spaceId }, err);
    return [];
  }
}

// ── sandbox event → client AgentEvent translation ────────────────────────────
//
// The sandbox runner emits raw JSONL with lower-level event types and no
// per-call ids. We synthesize callIds in FIFO so a tool_call_start pairs with
// the matching tool_call_result; the runner only emits one tool flight at a
// time per agent step so FIFO is correct for the current SDK behavior.

interface SandboxToken { type: 'token'; delta: string }
interface SandboxToolStart { type: 'tool_call_start'; tool: string; args: Record<string, unknown> }
interface SandboxToolResult { type: 'tool_call_result'; tool: string; ok: boolean; summary: string }
interface SandboxHandoff { type: 'handoff'; to: string }
interface SandboxDone { type: 'done'; final_text: string }
interface SandboxError { type: 'error'; message: string }
type SandboxEvent =
  | SandboxToken
  | SandboxToolStart
  | SandboxToolResult
  | SandboxHandoff
  | SandboxDone
  | SandboxError;

interface TranslateState {
  pendingCallIds: string[];
  finalText: string;
  textBuffer: string;
  sawDone: boolean;
}

function newTranslateState(): TranslateState {
  return { pendingCallIds: [], finalText: '', textBuffer: '', sawDone: false };
}

/**
 * Translate one sandbox event into zero-or-more PushableEvents the client
 * expects. Side-effects on `state` capture the running final_text so the
 * route can persist the assistant message after the stream closes.
 */
function translate(event: SandboxEvent, state: TranslateState): PushableEvent[] {
  switch (event.type) {
    case 'token': {
      if (!event.delta) return [];
      state.textBuffer += event.delta;
      return [{ type: 'text_delta', delta: event.delta }];
    }
    case 'tool_call_start': {
      const callId = crypto.randomUUID();
      state.pendingCallIds.push(callId);
      return [{
        type: 'tool_call_start',
        callId,
        name: event.tool,
        args: event.args ?? {},
      }];
    }
    case 'tool_call_result': {
      // FIFO match against the most recent pending start. If we somehow have
      // a result without a start (shouldn't happen), synthesize one so the
      // client still renders something sensible.
      const callId = state.pendingCallIds.shift() ?? crypto.randomUUID();
      return [{
        type: 'tool_call_result',
        callId,
        ok: event.ok,
        summary: event.summary ?? '',
      }];
    }
    case 'handoff': {
      // Client's AgentEvent union has no handoff type; surface it as an
      // italicized text_delta so the user sees the agent switch. Cheap,
      // visible, doesn't require a client change.
      const note = `\n\n_Handoff to ${event.to}_\n\n`;
      state.textBuffer += note;
      return [{ type: 'text_delta', delta: note }];
    }
    case 'done': {
      state.sawDone = true;
      state.finalText = event.final_text || state.textBuffer;
      return [{ type: 'turn_complete', reason: 'complete' }];
    }
    case 'error': {
      // Sandbox errors come from inside the agent loop — could be a tool
      // crash, a model timeout, a budget hit. Classify the raw message and
      // hand the user a first-person Chippi line.
      const code = classifyError(event.message);
      return [{ type: 'error', message: chippiErrorMessage(code), code }];
    }
    default:
      return [];
  }
}

/**
 * Pull `data:` payloads off a Modal SSE stream and yield the parsed JSON
 * objects. The Modal endpoint emits each sandbox JSONL line as a single
 * `data: <json>\n\n` frame (no `event:` line) so we only need to scan for
 * `data:` prefixes and the blank-line separator.
 */
async function* parseModalSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<SandboxEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      // Flush a trailing frame if any.
      if (buffer.trim()) {
        const obj = tryParseFrame(buffer);
        if (obj) yield obj;
      }
      return;
    }
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const lf = buffer.indexOf('\n\n');
      const crlf = buffer.indexOf('\r\n\r\n');
      let idx = -1;
      let gap = 0;
      if (lf !== -1 && (crlf === -1 || lf < crlf)) {
        idx = lf; gap = 2;
      } else if (crlf !== -1) {
        idx = crlf; gap = 4;
      }
      if (idx === -1) break;
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + gap);
      const obj = tryParseFrame(frame);
      if (obj) yield obj;
    }
  }
}

function tryParseFrame(frame: string): SandboxEvent | null {
  // Concatenate every `data:` line in the frame per SSE spec.
  let data = '';
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(':')) continue; // comment
    if (line.startsWith('data:')) {
      data += line.slice(line.charAt(5) === ' ' ? 6 : 5);
    }
  }
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as { type?: unknown };
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      return parsed as SandboxEvent;
    }
  } catch {
    /* skip bad frame */
  }
  return null;
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

  // Modal Sandbox cold-starts cost real money — cap chat traffic per-IP and
  // per-space before we hand the turn off to the sandbox. Starting guardrails
  // (30/10min IP, 60/10min space); tune after we have real-usage telemetry.
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

  const attachments = await hydrateAttachments(ctx.space.id, body.attachmentIds);

  const modalUrl = process.env.MODAL_CHAT_URL;
  const sharedSecret = process.env.AGENT_INTERNAL_SECRET;
  if (!modalUrl || !sharedSecret) {
    logger.error('[ai/task] missing MODAL_CHAT_URL or AGENT_INTERNAL_SECRET', { spaceSlug });
    return NextResponse.json(
      { error: chippiErrorMessage('internal') },
      { status: 503 },
    );
  }

  const modalPayload = {
    secret: sharedSecret,
    space_id: ctx.space.id,
    conversation_id: conversationId,
    message: rawMessage,
    history,
    attachments,
  };

  // ── SSE stream ─────────────────────────────────────────────────────────
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const nextSeq = createSeqCounter();
      const state = newTranslateState();

      const pushEvent = (event: PushableEvent) => {
        const full = { ...event, seq: nextSeq(), ts: new Date().toISOString() } as AgentEvent;
        try {
          controller.enqueue(encodeEvent(full));
        } catch {
          /* controller closed */
        }
      };

      // Cold-start fallback — Modal Sandboxes can take 5-15s on a cold spin
      // up, during which the user sees nothing. Drop a Chippi-voiced status
      // line as a text_delta if the sandbox hasn't started talking by 8s.
      // Cleared the moment any real event lands. The line goes via text_delta
      // (not error) on purpose: the turn isn't broken, it's just slow.
      let coldStartFired = false;
      const coldStartTimer = setTimeout(() => {
        if (state.textBuffer || state.sawDone) return;
        coldStartFired = true;
        const line = chippiErrorMessage('cold_start') + '\n\n';
        state.textBuffer += line;
        pushEvent({ type: 'text_delta', delta: line });
      }, 8000);

      let modalRes: Response;
      try {
        modalRes = await fetch(modalUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modalPayload),
          signal: abortController.signal,
        });
      } catch (err) {
        clearTimeout(coldStartTimer);
        logger.error('[ai/task] modal fetch failed', { spaceSlug }, err);
        pushEvent({
          type: 'error',
          message: chippiErrorMessage('network'),
          code: 'network',
        });
        controller.close();
        return;
      }

      if (!modalRes.ok || !modalRes.body) {
        clearTimeout(coldStartTimer);
        let detail = `status ${modalRes.status}`;
        try {
          const text = await modalRes.text();
          if (text) detail += `: ${text.slice(0, 400)}`;
        } catch {
          /* ignore */
        }
        logger.error('[ai/task] modal returned non-OK', { spaceSlug, detail });
        pushEvent({
          type: 'error',
          message: chippiErrorMessage('internal'),
          code: 'internal',
        });
        controller.close();
        return;
      }

      const reader = modalRes.body.getReader();
      let firstSandboxEventSeen = false;

      try {
        for await (const sandboxEvent of parseModalSSE(reader)) {
          if (!firstSandboxEventSeen) {
            firstSandboxEventSeen = true;
            clearTimeout(coldStartTimer);
            // If we already shipped the cold-start line, strip it from the
            // saved transcript so it doesn't get persisted as part of the
            // assistant's actual reply.
            if (coldStartFired) {
              const prefix = chippiErrorMessage('cold_start') + '\n\n';
              if (state.textBuffer.startsWith(prefix)) {
                state.textBuffer = state.textBuffer.slice(prefix.length);
              }
            }
          }
          for (const out of translate(sandboxEvent, state)) {
            pushEvent(out);
          }
        }
        clearTimeout(coldStartTimer);
        // If the stream closed without a `done`, synthesize a turn_complete
        // so the client doesn't sit waiting forever.
        if (!state.sawDone) {
          pushEvent({ type: 'turn_complete', reason: 'complete' });
        }
      } catch (err) {
        clearTimeout(coldStartTimer);
        const aborted = (err as { name?: string })?.name === 'AbortError';
        if (!aborted) {
          const raw = err instanceof Error ? err.message : String(err);
          const code = classifyError(raw);
          logger.error('[ai/task] stream pump crashed', { spaceSlug }, err);
          pushEvent({ type: 'error', message: chippiErrorMessage(code), code });
        }
      } finally {
        // Persist the assistant message if anything came back. The legacy
        // schema requires non-null content; saveAssistantMessage handles the
        // empty-text case with a placeholder.
        const finalText = state.finalText || state.textBuffer;
        if (finalText.trim()) {
          try {
            const blocks: MessageBlock[] = [{ type: 'text', content: finalText }];
            await saveAssistantMessage({
              spaceId: ctx.space.id,
              conversationId,
              blocks,
            });
          } catch (err) {
            logger.error('[ai/task] save assistant message failed', { spaceSlug }, err);
          }
        }
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
