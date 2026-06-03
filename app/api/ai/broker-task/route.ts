/**
 * POST /api/ai/broker-task — broker chat surface streaming endpoint.
 *
 * Parallel to `app/api/ai/task/route.ts` (the realtor chat surface) but
 * gated on broker access and dispatched to Modal with `mode: 'broker'`.
 * The shared SSE protocol and message persistence shapes are identical;
 * the routes differ in three places — auth, persistence-space, and the
 * Modal payload's `mode` field.
 *
 * Defense layer 2 of three (per Chippi-for-Brokers Phase 1 spec):
 *
 *   1. ROUTE GUARD   — `app/broker/chippi/page.tsx` server component
 *                      redirects when the caller isn't a broker.
 *   2. API GATE      — THIS ROUTE. `resolveBrokerContext()` is the gate;
 *                      realtor_member + non-broker + signed-out callers
 *                      all 403 here. The check fires BEFORE any DB writes,
 *                      Modal fetch, or rate-limit increment.
 *   3. TOOL-RUNTIME  — `agent/tools/broker/_guards.py:require_broker_role`
 *                      refuses tool execution unless AgentContext carries
 *                      a broker role (Phase 2/3 tools wrap every handler).
 *
 * Phase 1 ships zero broker tools, so this route exists to wire the pipe.
 * Phase 2/3 add tools by appending to `agent/tools/broker.BROKER_TOOLS`;
 * the broker-task route itself does NOT need to change.
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { saveUserMessage, saveAssistantMessage } from '@/lib/ai-tools/persistence';
import { chippiErrorMessage } from '@/lib/ai-tools/chippi-voice';
import { sanitizeUserInput } from '@/lib/agent/prompt-sanitizer';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { auth } from '@clerk/nextjs/server';
import { decideRoute } from '@/lib/chat/router';
import { streamBrokerDirectTurn } from '@/lib/chat/broker-direct';

// A Modal chat turn can run for minutes (multi-tool agentic reasoning). The
// proxy must outlive the Modal function (its timeout is 600s) or Vercel
// kills the stream mid-turn and the assistant message is lost.
export const runtime = 'nodejs';
export const maxDuration = 300;

interface HistoryRow {
  role: 'user' | 'assistant';
  content: string;
}

interface PostBody {
  conversationId?: string | null;
  message: string;
}

/** Cap on history messages fed to the model. Mirrors the realtor route's
 *  HISTORY_LIMIT — Phase 1 PR #155 dropped that from 20 to 8 to stop
 *  paying for 12 stale turns every request; Phase 3 mirrors the same cut
 *  here. The broker chat surface answers about brokerage state, not a
 *  many-turn conversation, so 8 is plenty. */
const HISTORY_LIMIT = 8;

/** Title prefix used to mark broker-Chippi conversations on the broker_owner's
 *  Space — keeps them out of the realtor's own conversation list (the realtor
 *  page filters by NOT LIKE '[BROKER_CHIPPI]%'). Distinct from the team-chat
 *  prefix in `app/api/broker/chat/route.ts` (`[BROKERAGE_CHAT]`). */
const CONV_TITLE_PREFIX = '[BROKER_CHIPPI]';

/**
 * Find or create the persistence space for broker-Chippi conversations.
 *
 * Conversations + Messages are keyed by `spaceId` in the schema, so the
 * broker chat needs a Space row to anchor on. The broker_owner's personal
 * Space is the natural anchor — every brokerage has exactly one. For
 * broker-only accounts (no personal space), Phase 1 returns null and the
 * caller surfaces an error; Phase 2 will pick the brokerage's owner's
 * Space, which is the same row in practice.
 */
async function resolvePersistenceSpaceId(brokerageOwnerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', brokerageOwnerId)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

async function resolveConversation(
  spaceId: string,
  brokerageId: string,
  conversationId: string | null | undefined,
): Promise<string> {
  if (conversationId) {
    const { data } = await supabase
      .from('Conversation')
      .select('id, spaceId, title')
      .eq('id', conversationId)
      .maybeSingle();
    // Title must carry the broker prefix AND name this brokerage — prevents
    // a realtor conversation id from being smuggled into the broker route.
    if (
      data &&
      data.spaceId === spaceId &&
      typeof data.title === 'string' &&
      data.title.startsWith(CONV_TITLE_PREFIX) &&
      data.title.includes(brokerageId)
    ) {
      return conversationId;
    }
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from('Conversation').insert({
    id,
    spaceId,
    title: `${CONV_TITLE_PREFIX} ${brokerageId}`,
  });
  if (error) throw error;
  return id;
}

async function loadHistory(spaceId: string, conversationId: string): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from('Message')
    .select('role, content, createdAt')
    .eq('spaceId', spaceId)
    .eq('conversationId', conversationId)
    .order('createdAt', { ascending: false })
    .limit(HISTORY_LIMIT);

  const rows = ((data ?? []) as Array<{ role: string; content: string }>).reverse();
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
}

// ---------------------------------------------------------------------------
// Modal SSE proxy — translates Modal's chat_turn events into the
// browser-facing protocol the broker chat client already speaks.
// Same event shape as the realtor route.
// ---------------------------------------------------------------------------

interface ProxyModalStreamInput {
  modalBody: ReadableStream<Uint8Array>;
  spaceId: string;
  conversationId: string;
  abortController: AbortController;
}

function proxyModalStream({
  modalBody,
  spaceId,
  conversationId,
  abortController,
}: ProxyModalStreamInput): Response {
  const encoder = new TextEncoder();
  let seq = 0;

  function push(controller: ReadableStreamDefaultController, event: Record<string, unknown>) {
    const line = `data: ${JSON.stringify({ seq: seq++, ts: new Date().toISOString(), ...event })}\n\n`;
    controller.enqueue(encoder.encode(line));
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = modalBody.getReader();
      const decoder = new TextDecoder();
      let lineBuf = '';
      const textChunks: string[] = [];
      const blocks: MessageBlock[] = [];
      let persisted = false;
      // Track whether we've already pushed a terminal frame (turn_complete or
      // error). If Modal's stream closes WITHOUT a done/error event (cold-start
      // drop, OOM, truncated body), the finally block emits a fallback terminal
      // frame so the client's bubble never hangs forever.
      let terminalEmitted = false;
      async function persistOnce(finalText?: string): Promise<void> {
        if (persisted) return;
        persisted = true;
        let toSave: MessageBlock[] = blocks;
        if (toSave.length === 0 && finalText && finalText.trim()) {
          toSave = [{ type: 'text', content: finalText }];
        }
        if (toSave.length === 0) return;
        try {
          await saveAssistantMessage({ spaceId, conversationId, blocks: toSave });
        } catch (err) {
          logger.warn('[ai/broker-task] persist assistant message failed', { spaceId }, err);
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuf += decoder.decode(value, { stream: true });
          const lines = lineBuf.split('\n');
          lineBuf = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            let evt: Record<string, unknown>;
            try {
              evt = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              continue;
            }

            const type = typeof evt.type === 'string' ? evt.type : '';

            if (type === 'token') {
              const delta = String(evt.delta ?? '');
              textChunks.push(delta);
              blocks.push({ type: 'text', content: delta });
              push(controller, { type: 'text_delta', delta });
            } else if (type === 'reasoning_delta') {
              push(controller, { type: 'reasoning_delta', delta: String(evt.delta ?? '') });
            } else if (type === 'tool_call_start') {
              const toolName = String(evt.tool ?? 'tool');
              const toolArgs = (evt.args ?? {}) as Record<string, unknown>;
              const callId =
                typeof evt.call_id === 'string' && evt.call_id
                  ? evt.call_id
                  : crypto.randomUUID();
              blocks.push({
                type: 'tool_call',
                callId,
                name: toolName,
                args: toolArgs,
                status: 'complete',
              });
              push(controller, {
                type: 'tool_call_start',
                name: toolName,
                args: toolArgs,
                callId,
              });
            } else if (type === 'tool_call_result') {
              const toolName = String(evt.tool ?? 'tool');
              const callId = typeof evt.call_id === 'string' ? evt.call_id : '';
              const ok = evt.ok !== false;
              const summary = String(evt.summary ?? '');
              for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.type !== 'tool_call') continue;
                if (callId ? b.callId === callId : !b.result) {
                  b.result = { ok, summary };
                  b.status = ok ? 'complete' : 'error';
                  break;
                }
              }
              push(controller, {
                type: 'tool_call_result',
                name: toolName,
                ok,
                summary,
                callId,
              });
            } else if (type === 'done') {
              const finalText =
                typeof evt.final_text === 'string' && evt.final_text.trim()
                  ? evt.final_text
                  : textChunks.join('');
              await persistOnce(finalText);
              push(controller, { type: 'turn_complete', reason: 'complete' });
              terminalEmitted = true;
            } else if (type === 'error') {
              await persistOnce();
              push(controller, { type: 'error', message: evt.message ?? 'Agent error' });
              terminalEmitted = true;
            }
          }
        }

        // Flush trailing buffer.
        if (lineBuf.startsWith('data: ')) {
          const raw = lineBuf.slice(6).trim();
          if (raw) {
            try {
              const evt = JSON.parse(raw) as Record<string, unknown>;
              if (evt.type === 'done') {
                const finalText =
                  typeof evt.final_text === 'string' && evt.final_text.trim()
                    ? evt.final_text
                    : textChunks.join('');
                await persistOnce(finalText);
                push(controller, { type: 'turn_complete', reason: 'complete' });
                terminalEmitted = true;
              }
            } catch {
              // ignore malformed trailing line
            }
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          logger.error('[ai/broker-task] modal stream read error', { spaceId }, err);
          push(controller, { type: 'error', message: chippiErrorMessage('internal') });
          terminalEmitted = true;
        }
      } finally {
        await persistOnce();
        // Guarantee a terminal frame. If Modal's stream closed cleanly without
        // a done/error event (cold-start drop, OOM, truncated response), no
        // turn_complete/error was pushed — the client would hang forever. Emit
        // a fallback: turn_complete if we received any text (salvage the partial
        // answer), otherwise an error so the bubble resolves. Skip on user abort.
        if (!terminalEmitted && !abortController.signal.aborted) {
          if (textChunks.join('').trim()) {
            push(controller, { type: 'turn_complete', reason: 'complete' });
          } else {
            push(controller, { type: 'error', message: chippiErrorMessage('internal') });
          }
        }
        controller.close();
        reader.releaseLock();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // ── Layer 2: API gate. Re-check broker context here even though the
  //    server-side page guard already redirected — a misconfigured
  //    client (custom fetch) must still 403 at the route boundary. ──
  const brokerCtx = await resolveBrokerContext();
  if (!brokerCtx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    // resolveBrokerContext returned non-null, which means a Clerk session
    // existed at that moment — but we still need the userId for the
    // Modal entity scope. A null between the two checks is a race; refuse.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
  if (!rawMessage) return NextResponse.json({ error: 'message required' }, { status: 400 });
  if (rawMessage.length > 8000) {
    return NextResponse.json({ error: 'message too long (8000 char max)' }, { status: 400 });
  }

  const sanitized = sanitizeUserInput(rawMessage);
  if (!sanitized.safe) {
    return NextResponse.json(
      { error: 'Message blocked by safety filter', violations: sanitized.violations },
      { status: 400 },
    );
  }
  const message = sanitized.sanitized;

  // Per-user / per-IP rate limits. Same shape as the realtor route.
  const userLimit = await checkRateLimit(`ai:broker-task:${clerkUserId}`, 30, 3600);
  if (!userLimit.allowed) {
    return NextResponse.json({ error: chippiErrorMessage('rate_limited') }, { status: 429 });
  }
  const ip = getClientIp(req);
  const ipLimit = await checkRateLimit(`chat:ip:${ip}`, 30, 600);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: chippiErrorMessage('rate_limited') },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }

  // Persistence space: the brokerage_owner's personal Space. Solo-broker-
  // owner with no personal Space (broker_only) → return a clear error in
  // Phase 1; Phase 2 will resolve this once broker_only accounts get a
  // canonical anchor space.
  const persistenceSpaceId = await resolvePersistenceSpaceId(brokerCtx.brokerage.ownerId);
  if (!persistenceSpaceId) {
    logger.warn('[ai/broker-task] no persistence space for brokerage', {
      brokerageId: brokerCtx.brokerage.id,
    });
    return NextResponse.json(
      { error: 'Broker chat is not available for this brokerage yet.' },
      { status: 503 },
    );
  }

  const abortController = new AbortController();

  let conversationId: string;
  try {
    conversationId = await resolveConversation(
      persistenceSpaceId,
      brokerCtx.brokerage.id,
      body.conversationId ?? null,
    );
  } catch (err) {
    logger.error(
      '[ai/broker-task] conversation resolve failed',
      { brokerageId: brokerCtx.brokerage.id },
      err,
    );
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }

  try {
    await saveUserMessage({ spaceId: persistenceSpaceId, conversationId, content: message });
  } catch (err) {
    logger.error(
      '[ai/broker-task] save user message failed',
      { brokerageId: brokerCtx.brokerage.id },
      err,
    );
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }

  let history: HistoryRow[];
  try {
    history = await loadHistory(persistenceSpaceId, conversationId);
  } catch (err) {
    logger.warn(
      '[ai/broker-task] history load failed — continuing without it',
      { brokerageId: brokerCtx.brokerage.id },
      err,
    );
    history = [];
  }

  if (history.length > 0) {
    const last = history[history.length - 1];
    if (last.role === 'user' && last.content === message) history.pop();
  }

  // ── Router: Q&A in-process, actions to Modal ─────────────────────────────
  // Most broker turns are read-only questions about the team ("how's the
  // pipeline?", "how many leads are waiting?"). Answer those in-process from a
  // live brokerage snapshot — instant, no Modal cold start, the same fast lane
  // the realtor chat uses. Action verbs (reassign, route, send) fall through to
  // Modal, where the BROKER_TOOLS catalog lives. Errors → Modal (safe default).
  if (decideRoute(message) === 'direct') {
    logger.info('[ai/broker-task] router → direct (in-process)', { brokerageId: brokerCtx.brokerage.id });
    return streamBrokerDirectTurn({
      brokerage: brokerCtx.brokerage,
      persistenceSpaceId,
      userId: clerkUserId,
      conversationId,
      userMessage: message,
      history: history.map((h) => ({ role: h.role, content: h.content })),
      abortController,
    });
  }

  // Modal dispatch. `mode: 'broker'` + brokerage_id + broker_role tell
  // chat_turn to build the broker-variant agent (BROKER_TOOLS, broker
  // system prompt) and refuse the request if those fields are missing.
  const modalChatUrl = process.env.MODAL_CHAT_URL;
  if (!modalChatUrl) {
    logger.error('[ai/broker-task] MODAL_CHAT_URL not set');
    return NextResponse.json(
      { error: 'Agent backend not configured. Set MODAL_CHAT_URL.' },
      { status: 503 },
    );
  }

  const payload = {
    secret: process.env.AGENT_INTERNAL_SECRET ?? '',
    space_id: persistenceSpaceId,
    user_id: clerkUserId,
    message,
    history: history.map((h) => ({ role: h.role, content: h.content })),
    conversation_id: conversationId,
    // ── Broker-mode fields — Modal's chat_turn reads these to dispatch
    //    to make_broker_agent() and to populate AgentContext for the
    //    per-tool require_broker_role() guard (defense layer 3). ──
    mode: 'broker' as const,
    brokerage_id: brokerCtx.brokerage.id,
    broker_role: brokerCtx.brokerRole,
  };

  // Bound the Modal cold start. The abort signal alone only fires on user
  // cancel — a hung cold start would otherwise hold the connection until
  // Vercel's 300s maxDuration. AbortSignal.any lets either the user abort OR
  // a 75s timeout tear down the fetch; we keep a ref to the timeout signal so
  // the catch can tell a timeout ("took too long") apart from a user cancel.
  const MODAL_FETCH_TIMEOUT_MS = 75_000;
  const fetchTimeoutSignal = AbortSignal.timeout(MODAL_FETCH_TIMEOUT_MS);

  let modalRes: Response;
  try {
    modalRes = await fetch(modalChatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.any([abortController.signal, fetchTimeoutSignal]),
    });
  } catch (err) {
    // Timeout: the cold start never produced headers within the bound. Surface
    // a clean, distinct message. (User cancel is silent — no client to tell.)
    if (fetchTimeoutSignal.aborted && !abortController.signal.aborted) {
      logger.warn('[ai/broker-task] Modal fetch timed out', {
        brokerageId: brokerCtx.brokerage.id,
        timeoutMs: MODAL_FETCH_TIMEOUT_MS,
      });
      return NextResponse.json(
        { error: 'Chippi took too long, try again.' },
        { status: 504 },
      );
    }
    logger.error(
      '[ai/broker-task] Modal fetch failed',
      { brokerageId: brokerCtx.brokerage.id },
      err,
    );
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 502 });
  }

  if (!modalRes.ok || !modalRes.body) {
    const status = modalRes.status;
    logger.error('[ai/broker-task] Modal returned error', {
      status,
      brokerageId: brokerCtx.brokerage.id,
    });
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 502 });
  }

  return proxyModalStream({
    modalBody: modalRes.body,
    spaceId: persistenceSpaceId,
    conversationId,
    abortController,
  });
}
