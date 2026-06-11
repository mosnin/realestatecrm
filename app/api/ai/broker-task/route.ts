/**
 * POST /api/ai/broker-task — broker chat surface streaming endpoint.
 *
 * Parallel to `app/api/ai/task/route.ts` (the realtor chat surface) but
 * gated on broker access and dispatched to Modal with `mode: 'broker'`.
 * The shared SSE protocol is identical; the routes differ in auth and in
 * WHERE they persist.
 *
 * STORAGE IS STRUCTURALLY SEPARATE. Broker conversations + messages live in
 * their OWN tables — "BrokerConversation" / "BrokerMessage" — keyed by
 * `brokerageId`, NOT in the realtor "Conversation"/"Message" tables. A realtor
 * surface cannot read a broker row because the rows are not in the same table.
 *
 * RUNTIME SPACE vs. STORAGE. The Modal runtime still needs a `space_id` for
 * AgentSettings/usage/the agent run — that stays the broker owner's personal
 * Space (resolveRuntimeSpaceId). But it is RUNTIME-ONLY; no conversation or
 * message is ever written keyed by that space. If the runtime space can't be
 * resolved, the turn still persists to the broker tables.
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
import { saveBrokerUserMessage, saveBrokerAssistantMessage } from '@/lib/agent/broker-persistence';
import { chippiErrorMessage } from '@/lib/ai-tools/chippi-voice';
import { sanitizeUserInput } from '@/lib/agent/prompt-sanitizer';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { auth } from '@clerk/nextjs/server';
import { decideRoute } from '@/lib/chat/router';
import { streamBrokerDirectTurn } from '@/lib/chat/broker-direct';
import { getTodayTokenUsage } from '@/lib/usage/today-token-usage';

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
  /** Composer Chat/Agent switch. 'chat' → in-process direct turn, 'agent' →
   *  Modal tool surface. Absent → decideRoute heuristic. Mirrors the realtor
   *  route's body.mode so the broker toggle controls real behavior. */
  mode?: 'chat' | 'agent' | string;
}

/** Cap on history messages fed to the model. Mirrors the realtor route's
 *  HISTORY_LIMIT — Phase 1 PR #155 dropped that from 20 to 8 to stop
 *  paying for 12 stale turns every request; Phase 3 mirrors the same cut
 *  here. The broker chat surface answers about brokerage state, not a
 *  many-turn conversation, so 8 is plenty. */
const HISTORY_LIMIT = 8;

/**
 * Resolve the broker owner's personal Space id — RUNTIME USE ONLY.
 *
 * The Modal runtime still needs a `space_id` for AgentSettings/usage/the agent
 * run. The broker owner's personal Space is the anchor. This is NOT where
 * conversations or messages are stored — those live in the broker tables keyed
 * by brokerageId. Returns null if the broker owner has no personal Space; the
 * caller treats that as a non-fatal "no runtime space" and still persists the
 * turn to the broker tables.
 */
async function resolveRuntimeSpaceId(brokerageOwnerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', brokerageOwnerId)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

/**
 * Find or create the BrokerConversation for this turn.
 *
 * If a conversationId is given, accept it ONLY when the BrokerConversation's
 * brokerageId matches this broker's brokerage — a foreign id (another
 * brokerage's, or a realtor's, which won't even exist in this table) is
 * rejected and a fresh conversation is created instead. No spaceId, no title
 * prefix: the brokerageId column is the boundary.
 */
async function resolveConversation(
  brokerageId: string,
  conversationId: string | null | undefined,
): Promise<string> {
  if (conversationId) {
    const { data } = await supabase
      .from('BrokerConversation')
      .select('id, brokerageId')
      .eq('id', conversationId)
      .maybeSingle();
    if (data && data.brokerageId === brokerageId) {
      return conversationId;
    }
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from('BrokerConversation').insert({
    id,
    brokerageId,
    title: 'New conversation',
  });
  if (error) throw error;
  return id;
}

async function loadHistory(conversationId: string): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from('BrokerMessage')
    .select('role, content, createdAt')
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
  brokerageId: string;
  conversationId: string;
  abortController: AbortController;
}

function proxyModalStream({
  modalBody,
  brokerageId,
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
      // Track whether a terminal browser frame (turn_complete | error) ever
      // hit the wire. Modal can be killed mid-stream (600s container timeout,
      // dropped socket) and end the SSE with NO done/error frame — without
      // this guarantee the broker's EventSource hangs open forever. Ported
      // from the realtor proxy, which fixed the same failure class.
      let sentTerminal = false;
      async function persistOnce(finalText?: string): Promise<void> {
        if (persisted) return;
        persisted = true;
        let toSave: MessageBlock[] = blocks;
        if (toSave.length === 0 && finalText && finalText.trim()) {
          toSave = [{ type: 'text', content: finalText }];
        }
        if (toSave.length === 0) return;
        try {
          await saveBrokerAssistantMessage({ brokerageId, conversationId, blocks: toSave });
        } catch (err) {
          logger.warn('[ai/broker-task] persist assistant message failed', { brokerageId }, err);
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
              sentTerminal = true;
            } else if (type === 'error') {
              await persistOnce();
              push(controller, { type: 'error', message: chippiErrorMessage('internal') });
              sentTerminal = true;
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
                sentTerminal = true;
              }
            } catch {
              // ignore malformed trailing line
            }
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          logger.error('[ai/broker-task] modal stream read error', { brokerageId }, err);
          push(controller, { type: 'error', message: chippiErrorMessage('internal') });
          sentTerminal = true;
        }
      } finally {
        // Safety net — the stream ended with no done/error frame. Persist
        // whatever streamed (idempotent) AND guarantee exactly one terminal
        // frame so the browser unlocks instead of hanging open forever.
        await persistOnce();
        if (!sentTerminal && !abortController.signal.aborted) {
          logger.warn('[ai/broker-task] modal stream ended with no terminal event', { brokerageId });
          push(controller, { type: 'error', message: chippiErrorMessage('internal') });
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

  const brokerageId = brokerCtx.brokerage.id;

  // Runtime space — the broker owner's personal Space, needed ONLY for the
  // Modal agent run (AgentSettings/usage). It is NOT where the conversation or
  // messages are stored. A broker owner with no personal Space still gets a
  // working chat: the turn persists to the broker tables; only the Modal
  // settings/usage want a space, and the direct (in-process) path needs none.
  const runtimeSpaceId = await resolveRuntimeSpaceId(brokerCtx.brokerage.ownerId);

  // Daily token budget — the realtor route (app/api/ai/task) enforces this, but
  // the broker route never did, so a broker could chat past the per-space cap
  // unchecked. Gate against the runtime (funding) space when there is one.
  // Fails open so a transient DB error can't block a legitimate broker turn.
  if (runtimeSpaceId) {
    try {
      const { data: settingsRow } = await supabase
        .from('AgentSettings')
        .select('dailyTokenBudget')
        .eq('spaceId', runtimeSpaceId)
        .maybeSingle();
      const dailyTokenBudget = (settingsRow?.dailyTokenBudget as number | null | undefined) ?? 50_000;
      const { total: todayTokens } = await getTodayTokenUsage(runtimeSpaceId);
      if (todayTokens >= dailyTokenBudget) {
        logger.warn('[ai/broker-task] daily token budget exceeded', {
          runtimeSpaceId,
          todayTokens,
          dailyTokenBudget,
        });
        return NextResponse.json({ error: 'Daily token budget exceeded' }, { status: 429 });
      }
    } catch (err) {
      logger.warn('[ai/broker-task] token budget check failed — continuing', { brokerageId }, err);
    }
  }

  const abortController = new AbortController();

  let conversationId: string;
  try {
    conversationId = await resolveConversation(brokerageId, body.conversationId ?? null);
  } catch (err) {
    logger.error('[ai/broker-task] conversation resolve failed', { brokerageId }, err);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }

  try {
    await saveBrokerUserMessage({ brokerageId, conversationId, content: message });
  } catch (err) {
    logger.error('[ai/broker-task] save user message failed', { brokerageId }, err);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }

  let history: HistoryRow[];
  try {
    history = await loadHistory(conversationId);
  } catch (err) {
    logger.warn(
      '[ai/broker-task] history load failed — continuing without it',
      { brokerageId },
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
  // Modal, where the BROKER_TOOLS catalog lives.
  //
  // The composer's Chat/Agent switch: 'agent' forces the full tool surface on
  // Modal; 'chat' is a PREFERENCE for the in-process direct path, not an
  // override. Action turns (reassign, route, send) reach Modal even in Chat
  // mode — the direct path has no tools and its prompt can only deflect.
  // An absent mode (older client) falls back to decideRoute so nothing
  // breaks. Mirrors the realtor route (app/api/ai/task) exactly.
  const explicitMode: 'chat' | 'agent' | null =
    body.mode === 'agent' ? 'agent' : body.mode === 'chat' ? 'chat' : null;
  const route = explicitMode === 'agent' ? 'agent' : decideRoute(message);
  if (route === 'direct') {
    logger.info('[ai/broker-task] router → direct (in-process)', { brokerageId });
    return streamBrokerDirectTurn({
      brokerage: brokerCtx.brokerage,
      // Runtime space is for usage recording only; null is fine (usage just
      // skips). The conversation/message persist goes to the broker tables.
      runtimeSpaceId,
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

  // The Modal agent run needs a runtime space_id for AgentSettings/usage. If
  // the broker owner has no personal Space, the agentic (tool) path can't run —
  // but the user message is already saved to the broker tables, so we surface a
  // clear, non-destructive error rather than dropping the turn.
  if (!runtimeSpaceId) {
    logger.warn('[ai/broker-task] no runtime space for agentic turn', { brokerageId });
    return NextResponse.json(
      { error: 'Broker actions are not available for this brokerage yet.' },
      { status: 503 },
    );
  }

  const payload = {
    secret: process.env.AGENT_INTERNAL_SECRET ?? '',
    space_id: runtimeSpaceId,
    user_id: clerkUserId,
    message,
    history: history.map((h) => ({ role: h.role, content: h.content })),
    conversation_id: conversationId,
    // ── Broker-mode fields — Modal's chat_turn reads these to dispatch
    //    to make_broker_agent() and to populate AgentContext for the
    //    per-tool require_broker_role() guard (defense layer 3). ──
    mode: 'broker' as const,
    brokerage_id: brokerageId,
    broker_role: brokerCtx.brokerRole,
  };

  let modalRes: Response;
  try {
    modalRes = await fetch(modalChatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });
  } catch (err) {
    logger.error('[ai/broker-task] Modal fetch failed', { brokerageId }, err);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 502 });
  }

  if (!modalRes.ok || !modalRes.body) {
    const status = modalRes.status;
    logger.error('[ai/broker-task] Modal returned error', { status, brokerageId });
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 502 });
  }

  return proxyModalStream({
    modalBody: modalRes.body,
    brokerageId,
    conversationId,
    abortController,
  });
}
