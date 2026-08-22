/**
 * POST /api/ai/task — on-demand agent streaming endpoint.
 *
 * Every chat turn proxies to the Modal Python sandbox running Chippi via the
 * OpenAI Agents SDK. Modal provides the secure isolated execution environment
 * for long-running, autonomous, multi-step reasoning chains. The Next.js layer
 * handles auth, rate-limiting, persistence, and SSE translation; Modal handles
 * the actual agent loop.
 *
 * Pipeline:
 *   1. Auth the caller + resolve a ToolContext.
 *   2. Rate-limit (per-user, per-IP, per-space).
 *   3. Resolve/create the conversation; save the user message.
 *   4. Load recent history (capped at HISTORY_LIMIT).
 *   5. Hydrate any referenced Attachment rows.
 *   6. POST to Modal chat_turn endpoint with the full context.
 *   7. Translate Modal SSE events → standard agent event format.
 *   8. Persist the assistant message on turn completion.
 *
 * Set CHIPPI_CHAT_RUNTIME=ts to fall back to the in-process TypeScript runtime
 * (useful for local dev without a Modal deployment).
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  saveUserMessage,
  saveConversationTurnAssistantMessage,
} from '@/lib/ai-tools/persistence';
import { resolveToolContext } from '@/lib/ai-tools/context';
import { isReservedConversationTitle } from '@/lib/chat/conversation-access';
import {
  claimConversationMode,
  type ConversationMode,
} from '@/lib/chat/conversation-mode';
import {
  parseInlineWorkGoal,
  parseWorkExecutionMode,
  type WorkExecutionMode,
} from '@/lib/chat/work-execution-mode';
import { isPlatformAdmin } from '@/lib/permissions';
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
import { sanitizeUserInput } from '@/lib/agent/prompt-sanitizer';
import { isPremiumAccessBlocked } from '@/lib/api-auth';
import { getTodayTokenUsage } from '@/lib/usage/today-token-usage';
import { assertCanSpend, CreditsExhaustedError, SubscriptionDelinquentError } from '@/lib/billing/meter';
import { resolveBillingAccount } from '@/lib/billing/account';
import { getSignedDownloadUrl } from '@/lib/storage';
import { decideRoute } from '@/lib/chat/router';
import { markTurnStarted, markTurnEnded } from '@/lib/chat/turn-presence';
import { streamDirectTurn } from '@/lib/chat/direct-stream';
import { createStopPoller, STOP_POLL_INTERVAL_MS } from '@/lib/chat/stop-signal';
import {
  claimConversationTurnV2,
  enqueueConversationTurn,
  finishConversationTurnV2,
  settledConversationTurnOutcome,
  startConversationTurnLeaseGuardian,
  type ConversationTurnRecord,
  type ConversationTurnSettler,
  type TurnTerminalOutcome,
} from '@/lib/chat/turn-control';
import {
  type MultimodalAttachment,
  pickModelForAttachments,
} from '@/lib/chat/multimodal';
import { resolveChatModel, isOpenRouterConfigured } from '@/lib/llm';
import { DEFAULT_CHAT_MODEL } from '@/lib/chat-models';
import { z } from 'zod';
import { readJsonWithLimit, parseOrBadRequest, BODY_LIMITS } from '@/lib/validation';

/** Shape guard for the chat turn. The body-size cap (lib/validation) runs
 *  first; this bounds the field types and array lengths. The pre-existing
 *  8000-char message limit and "required" ordering are preserved below. */
const taskBodySchema = z.object({
  spaceSlug: z.string().min(1).max(200),
  conversationId: z.string().max(200).nullish(),
  message: z.string().max(20000),
  attachmentIds: z.array(z.string().max(200)).max(20).optional(),
  activeWorkbookArtifactId: z.string().max(200).optional(),
  mode: z.string().max(50).optional(),
  executionMode: z.enum(['review', 'autonomous']).optional(),
  turnId: z.string().min(1).max(200).optional(),
  clientRequestId: z.string().min(1).max(200).optional(),
});

/** TTL for attachment URLs forwarded to Modal. The agent reads them within
 *  seconds of receiving the task; 30 minutes is plenty of headroom and short
 *  enough that a leaked task payload can't be replayed against the assets. */
const ATTACHMENT_HYDRATE_TTL_SECONDS = 60 * 30;
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { mapModalToolResultFrame } from '@/lib/ai-tools/modal-frame';
import { isWorkbookAttachment } from '@/lib/chippi/workbench-store';
import { isExplicitWorkbenchIntent, isWorkbookTransformIntent } from '@/lib/chippi/workbench-intent';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';
import { isResearchWorkspaceEnabledForSpace } from '@/lib/chippi/research-workspace-flag';
import { isResearchWorkspaceIntent } from '@/lib/chippi/research-workspace-intent';
import { isWorkspaceRunContinuationIntent } from '@/lib/chippi/workspace-run-intent';
import { chatContinuationIdempotencySeed, isConversationWorkspaceContinuationEligible } from '@/lib/workspace-runs/conversation-continuation';
import { tenantTable } from '@/lib/tenant-db';

// A Modal chat turn can run for minutes (multi-tool agentic reasoning). The
// proxy must outlive the Modal function (its timeout is 600s) or Vercel kills
// the stream mid-turn and the assistant message is lost. nodejs runtime is
// required — this route streams and uses Node `crypto`.
//
// maxDuration was 300 — LESS than Modal's 600s ceiling, directly contradicting
// the requirement above: a turn running 300–600s got guillotined by Vercel at
// 300s, truncating the response (and a hard function kill can skip the
// persist-in-finally). Set to outlive Modal. Vercel silently clamps this to the
// plan's real maximum, so on a plan capped below 660 it's a no-op (no worse
// than before) and the client now lands a "cut off — retry" notice either way
// (see use-agent-task.ts); on a capable plan it removes the truncation entirely.
export const runtime = 'nodejs';
// Outlive Modal's own 600s per-turn ceiling (+ buffer) so the proxy never kills
// a long agentic turn before Modal finishes. Vercel clamps this to the plan's
// max, so it's a ceiling, not a guarantee — but 300 was BELOW Modal's timeout,
// which meant a long turn could be cut on the proxy side even though Modal was
// still working. Also gives the disconnect-survival drain (below) room to run
// the turn to completion after the client leaves.
export const maxDuration = 800;

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
const HISTORY_LIMIT = 8;

interface PostBody {
  spaceSlug: string;
  conversationId?: string | null;
  message: string;
  attachmentIds?: string[];
  /**
   * Explicit experience pick from the top-of-page Chat/Work switch.
   *   - 'chat'  → lean single-call path: one LLM completion + read-only vector
   *               search over the realtor's data. No tools, no agent loop, so
   *               a turn costs ~3k tokens. The structural fix for the
   *               500k-tokens-per-input blowup: most turns never touch the
   *               tool loop at all.
   *   - 'work'  → full tool surface plus durable background work. The legacy
   *               'agent' value remains accepted for older clients.
   * Absent (older client) → fall back to the heuristic router.
   */
  mode?: 'chat' | 'work' | 'agent' | string;
  executionMode?: WorkExecutionMode;
  turnId?: string;
  clientRequestId?: string;
  activeWorkbookArtifactId?: string;
}

/** Resolves only the active artifact's current version identity. The agent
 * must call inspect_workbook for bounded schema/sample/hash data before it can
 * propose a transform. Missing and foreign ids intentionally look identical. */
async function resolveActiveWorkbookContext(
  artifactId: string | undefined,
  spaceId: string,
): Promise<ToolContext['activeWorkbook'] | undefined> {
  if (!artifactId || !isWorkbenchEnabled()) return undefined;
  try {
    const { data: artifact } = await supabase
      .from('Artifact')
      .select('id, title, artifactType, currentVersionId')
      .eq('id', artifactId)
      .eq('spaceId', spaceId)
      .maybeSingle();
    if (!artifact || artifact.artifactType !== 'workbook' || !artifact.currentVersionId || typeof artifact.title !== 'string' || artifact.title.length < 1 || artifact.title.length > 200) return undefined;
    const { data: version } = await supabase
      .from('ArtifactVersion')
      .select('id, versionNumber')
      .eq('id', artifact.currentVersionId)
      .eq('artifactId', artifact.id)
      .eq('spaceId', spaceId)
      .maybeSingle();
    if (!version || !Number.isInteger(version.versionNumber) || version.versionNumber < 1) return undefined;
    return {
      artifactId: artifact.id,
      versionNumber: version.versionNumber,
      title: artifact.title,
    };
  } catch {
    return undefined;
  }
}

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
        .eq('id', conversationId)
        .eq('spaceId', spaceId);
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
  requestedMode: ConversationMode,
  requestedExecutionMode: WorkExecutionMode,
): Promise<{
  id: string;
  mode: ConversationMode;
  executionMode: WorkExecutionMode;
  workGoal?: string;
  workGoalVersion?: number;
}> {
  if (conversationId) {
    const { data } = await supabase
      .from('Conversation')
      .select('id, spaceId, title, mode, executionMode, workGoal, workGoalStatus, workGoalVersion')
      .eq('id', conversationId)
      .eq('spaceId', spaceId)
      .maybeSingle();
    // Reject reserved broker/team titles. A broker_owner's personal spaceId
    // equals their realtor space, and the pre-migration broker/team rows still
    // live in this shared table — so the spaceId check alone is NOT isolation.
    // Without this, a broker/team conversationId would be accepted on the
    // realtor surface, its history fed to the model, and new realtor turns
    // persisted into that broker conversation. Fall through to a fresh one.
    if (data && data.spaceId === spaceId && !isReservedConversationTitle(data.title)) {
      if (!data.title || data.title === 'New conversation') {
        autoTitleConversation(spaceId, conversationId, userMessage);
      }
      const mode = await claimConversationMode(supabase, {
        conversationId,
        spaceId,
        requestedMode,
      });
      return {
        id: conversationId,
        mode,
        executionMode: parseWorkExecutionMode(data.executionMode),
        ...(data.workGoalStatus === 'active' && typeof data.workGoal === 'string'
          ? {
              workGoal: data.workGoal,
              workGoalVersion: Number(data.workGoalVersion ?? 0),
            }
          : {}),
      };
    }
  }

  const id = crypto.randomUUID();
  const { error } = await tenantTable(supabase, 'Conversation', { spaceId }).insert({
    id,
    spaceId,
    title: 'New conversation',
    mode: requestedMode,
    executionMode: requestedExecutionMode,
  });
  if (error) throw error;
  autoTitleConversation(spaceId, id, userMessage);
  return { id, mode: requestedMode, executionMode: requestedExecutionMode };
}

async function loadHistory(spaceId: string, conversationId: string): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from('Message')
    .select('role, content, createdAt')
    .eq('spaceId', spaceId)
    .eq('conversationId', conversationId)
    .order('createdAt', { ascending: false })
    .limit(HISTORY_LIMIT);

  // ascending:false + limit fetches the most RECENT n; reverse to restore
  // chronological order. The old ascending:true + limit silently fed the
  // model the OLDEST n messages and dropped every recent turn once a
  // conversation passed n messages.
  const rows = ((data ?? []) as Array<{ role: string; content: string }>).reverse();
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
}

async function hydrateAttachments(
  spaceId: string,
  ids: string[] | undefined,
): Promise<AttachmentPayload[]> {
  if (!ids || ids.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('Attachment')
      .select('id, filename, "mimeType", "extractedText", "storagePath", "extractionStatus"')
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
      storagePath: string | null;
      extractionStatus: string;
    }>;
    // Mint a fresh signed URL per attachment for this task. Each task is a
    // single agent turn — short-lived URLs are correct here. A signing
    // failure for one row drops that row's URL but doesn't poison the rest.
    return Promise.all(
      rows.map(async (r) => {
        let signedUrl = '';
        if (r.storagePath) {
          try {
            signedUrl = await getSignedDownloadUrl(
              r.storagePath,
              ATTACHMENT_HYDRATE_TTL_SECONDS,
            );
          } catch (signErr) {
            logger.warn(
              '[ai/task] attachment sign failed',
              { spaceId, attachmentId: r.id },
              signErr,
            );
          }
        }
        return {
          id: r.id,
          filename: r.filename,
          mime_type: r.mimeType,
          extracted_text: r.extractedText,
          public_url: signedUrl,
        };
      }),
    );
  } catch (err) {
    logger.warn('[ai/task] attachment hydrate threw — continuing empty', { spaceId }, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Modal SSE proxy
// ---------------------------------------------------------------------------

interface ProxyModalStreamInput {
  modalBody: ReadableStream<Uint8Array>;
  spaceId: string;
  conversationId: string;
  abortController: AbortController;
  turnId: string;
  attemptToken: string;
  onSettled: ConversationTurnSettler;
}

/**
 * Translate the SSE stream from Modal's chat_turn endpoint into the standard
 * agent event format the browser client expects, persisting the assistant
 * message once the turn completes.
 *
 * Modal event → browser event mapping:
 *   token            → text_delta
 *   tool_call_start  → tool_call_start  (rename "tool" field → "name")
 *   tool_call_result → tool_call_result (rename "tool" field → "name")
 *   done             → turn_complete    (+ persist assistant message)
 *   error            → error
 */
function proxyModalStream({
  modalBody,
  spaceId,
  conversationId,
  abortController,
  turnId,
  attemptToken,
  onSettled,
}: ProxyModalStreamInput): Response {
  const encoder = new TextEncoder();
  let seq = 0;
  // Set when the browser disconnects (tab/app closed, navigated away). We do NOT
  // abort the Modal run on disconnect — the turn keeps draining server-side to
  // completion and is persisted, so the finished answer is there when the user
  // returns (Claude/ChatGPT behaviour). This just stops us enqueueing into a
  // torn-down controller (which would throw).
  let clientGone = false;

  function push(controller: ReadableStreamDefaultController, event: Record<string, unknown>) {
    if (clientGone) return;
    const line = `data: ${JSON.stringify({ seq: seq++, ts: new Date().toISOString(), ...event })}\n\n`;
    try {
      controller.enqueue(encoder.encode(line));
    } catch {
      // Controller already closed/errored (client vanished between the check and
      // the enqueue) — treat as gone and keep draining Modal for persistence.
      clientGone = true;
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Hold the serverless function open until the Modal drain + persist
      // finish even after the client disconnects. The comments below promise
      // "the turn keeps draining server-side" — without this registration the
      // platform may suspend the function the moment the response stream is
      // cancelled, and that promise silently breaks.
      let drainDone!: () => void;
      const drainDonePromise = new Promise<void>((resolve) => {
        drainDone = resolve;
      });
      try {
        after(() => drainDonePromise);
      } catch {
        /* outside a request context (tests) */
      }

      const reader = modalBody.getReader();
      const decoder = new TextDecoder();
      let lineBuf = '';
      const textChunks: string[] = [];
      // Ordered render list assembled as the turn streams — text + tool-call
      // blocks. Persisted verbatim so a reloaded conversation shows what
      // Chippi actually did (tool calls, plan cards), not just a flat reply.
      const blocks: MessageBlock[] = [];
      // Track args from the most recent create_plan tool_call_start so we can
      // emit plan_created when the matching tool_call_result arrives.
      let pendingPlanArgs: Record<string, unknown> | null = null;
      // Persist exactly once — on `done`, on `error`, or on the stream simply
      // dropping. Before this only the `done` path saved, so any mid-stream
      // Modal failure erased the whole assistant turn from history.
      let persistenceAttempt: Promise<void> | null = null;
      // Track whether a terminal browser event (turn_complete | error) ever
      // reached the wire. Modal can be killed mid-stream (600s container
      // timeout, dropped socket) and end the SSE with NO `done`/`error`
      // frame — the browser's EventSource then sits open forever. The
      // `finally` below uses this to guarantee exactly one terminal frame.
      let sentTerminal = false;
      // Modal's first `done` or `error` is terminal. Trailing frames are
      // ignored so they cannot contradict or duplicate the browser receipt.
      let upstreamTerminalSeen = false;
      let terminalOutcome: TurnTerminalOutcome = {
        status: 'failed',
        reason: 'modal_stream_closed_without_terminal_event',
        error: 'The Modal stream closed without a terminal event.',
      };
      let atomicallySettled = false;
      let separatelySettled = false;
      const leaseGuardian = startConversationTurnLeaseGuardian(supabase, {
        turnId,
        spaceId,
        conversationId,
        attemptToken,
        abortController,
      });
      let stopRequested = false;
      const shouldStop = createStopPoller(turnId);
      const stopTimer = setInterval(() => {
        void shouldStop().then((stop) => {
          if (!stop || stopRequested) return;
          stopRequested = true;
          terminalOutcome = { status: 'cancelled', reason: 'interrupted' };
          try { abortController.abort(); } catch { /* already aborted */ }
          void reader.cancel().catch(() => {});
        });
      }, STOP_POLL_INTERVAL_MS);
      async function persistOnce(finalText?: string): Promise<void> {
        if (persistenceAttempt) return persistenceAttempt;
        let toSave: MessageBlock[] = blocks;
        if (toSave.length === 0 && finalText && finalText.trim()) {
          toSave = [{ type: 'text', content: finalText }];
        }
        if (toSave.length === 0) {
          persistenceAttempt = Promise.resolve();
          return persistenceAttempt;
        }
        persistenceAttempt = (async () => {
          leaseGuardian.assertActive();
          await leaseGuardian.prepareToCommit();
          const receipt = await saveConversationTurnAssistantMessage({
            spaceId,
            conversationId,
            turnId,
            attemptToken,
            outcome: terminalOutcome,
            blocks: toSave,
          });
          terminalOutcome = {
            status: receipt.terminalStatus,
            reason: receipt.terminalReason,
          };
          atomicallySettled = true;
          leaseGuardian.commitSucceeded();
          leaseGuardian.stop();
        })();
        return persistenceAttempt;
      }

      /**
       * Terminal `done` handling, shared by the in-loop branch and the
       * trailing-buffer flush. A turn that reaches `done` having produced
       * NOTHING visible — no tokens, no tool cards, no final_text — reads to
       * the realtor exactly like Chippi ignoring them, and persistOnce would
       * save nothing, so it wouldn't even survive a reload. Say so instead.
       */
      async function completeTurn(rawFinalText: string): Promise<void> {
        let finalText = rawFinalText;
        if (blocks.length === 0 && !finalText.trim()) {
          logger.warn('[ai/task] modal turn produced no visible output', { spaceId });
          finalText = chippiErrorMessage('empty_reply');
          push(controller, { type: 'text_delta', delta: finalText });
        }
        terminalOutcome = stopRequested
          ? { status: 'cancelled', reason: 'interrupted' }
          : { status: 'completed', reason: 'complete' };
        try {
          await persistOnce(finalText);
        } catch (err) {
          const authorityFailure = leaseGuardian.hasLostAuthority()
            || /lease|attempt token|terminal result/i.test(
              err instanceof Error ? err.message : String(err),
            );
          terminalOutcome = {
            status: 'failed',
            reason: authorityFailure ? 'lease_authority_lost' : 'persistence',
            error: err instanceof Error ? err.message : 'Assistant message persistence failed.',
          };
          logger.warn('[ai/task] modal: persist assistant message failed', { spaceId }, err);
          push(controller, {
            type: 'error',
            message: authorityFailure
              ? 'This turn no longer had authority to publish its reply.'
              : chippiErrorMessage('persistence'),
            code: authorityFailure ? 'lease_authority_lost' : 'persistence',
          });
          sentTerminal = true;
          return;
        }
        push(controller, {
          type: 'turn_complete',
          reason: terminalOutcome.status === 'cancelled' ? 'aborted' : 'complete',
        });
      }

      try {
        await leaseGuardian.renewNow();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          leaseGuardian.assertActive();

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

            } else if (type === 'status') {
              // Live thinking-line from the Modal agent ("Thinking…",
              // "Working through what I found…"). Relayed verbatim; the
              // client renders it as the thinking indicator's action line.
              push(controller, { type: 'status', label: String(evt.label ?? '') });

            } else if (type === 'tool_call_start') {
              const toolName = String(evt.tool ?? 'tool');
              const toolArgs = (evt.args ?? {}) as Record<string, unknown>;
              // Use the SDK call_id Modal now forwards so the browser can
              // correlate the result back to this call; fall back to a fresh
              // id for older Modal deploys that don't send one.
              const callId =
                typeof evt.call_id === 'string' && evt.call_id
                  ? evt.call_id
                  : crypto.randomUUID();
              // Remember create_plan args so we can emit plan_created on result.
              if (toolName === 'create_plan') {
                pendingPlanArgs = toolArgs;
              }
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
              // Single source of truth for the browser frame — FORWARDS the
              // rich-card display + data Modal lifted off the tool output
              // (weather / stats / contacts / deals / properties / option-list
              // / question-flow / message-draft / …). This is the Modal-path
              // hop the previous attempt missed.
              const frame = mapModalToolResultFrame(evt);
              const { name: toolName, callId, ok, summary, display } = frame;
              const data = frame.data;
              // Settle the result onto its tool-call block — by call_id when
              // present, else the most recent still-unresolved tool call. Carry
              // the rich data/display so the inline card re-renders on reload.
              for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.type !== 'tool_call') continue;
                if (callId ? b.callId === callId : !b.result) {
                  b.result = { ok, summary, data };
                  b.status = ok ? 'complete' : 'error';
                  if (display) b.display = display;
                  break;
                }
              }
              // Emit plan_created before the result so the browser can render
              // the plan card immediately, before the tool call settles.
              if (toolName === 'create_plan' && pendingPlanArgs !== null) {
                const args = pendingPlanArgs;
                if (typeof args.task === 'string' && Array.isArray(args.steps)) {
                  push(controller, {
                    type: 'plan_created',
                    task: args.task,
                    steps: args.steps,
                  });
                }
                pendingPlanArgs = null;
              }
              // Spread into a plain object — `push` takes Record<string,unknown>;
              // the typed frame interface has no index signature.
              push(controller, { ...frame });

            } else if (type === 'done') {
              await completeTurn(
                typeof evt.final_text === 'string' && evt.final_text.trim()
                  ? evt.final_text
                  : textChunks.join(''),
              );
              sentTerminal = true;
              upstreamTerminalSeen = true;
              break;

            } else if (type === 'error') {
              // Persist whatever streamed before the failure so a mid-turn
              // Modal error doesn't erase the assistant message the user saw.
              terminalOutcome = {
                status: 'failed',
                reason: 'modal_error',
                error: String(evt.message ?? 'Agent error'),
              };
              try {
                await persistOnce();
              } catch (persistError) {
                logger.warn('[ai/task] modal: persist partial assistant message failed', { spaceId }, persistError);
              }
              push(controller, { type: 'error', message: evt.message ?? 'Agent error' });
              sentTerminal = true;
              upstreamTerminalSeen = true;
              break;
            }
          }
          if (upstreamTerminalSeen) break;
        }

        // Flush any remaining buffer
        if (!upstreamTerminalSeen && lineBuf.startsWith('data: ')) {
          const raw = lineBuf.slice(6).trim();
          if (raw) {
            try {
              const evt = JSON.parse(raw) as Record<string, unknown>;
              if (evt.type === 'done') {
                await completeTurn(
                  typeof evt.final_text === 'string' && evt.final_text.trim()
                    ? evt.final_text
                    : textChunks.join(''),
                );
                sentTerminal = true;
                upstreamTerminalSeen = true;
              }
            } catch {
              // ignore malformed trailing line
            }
          }
        }
      } catch (err) {
        // A genuine read error (Modal crash/network). If the client already
        // left there's no one to tell — just fall through to persist. We no
        // longer abort on disconnect, so this is a real error, not our own abort.
        if (!clientGone) {
          if (leaseGuardian.hasLostAuthority()) {
            terminalOutcome = {
              status: 'failed',
              reason: 'lease_authority_lost',
              error: 'Conversation turn attempt authority could not be renewed.',
            };
            push(controller, {
              type: 'error',
              message: 'This turn lost execution authority and was stopped safely.',
              code: 'lease_authority_lost',
            });
            sentTerminal = true;
          } else if (stopRequested) {
            terminalOutcome = { status: 'cancelled', reason: 'interrupted' };
          } else {
            terminalOutcome = {
              status: 'failed',
              reason: 'modal_stream_error',
              error: err instanceof Error ? err.message : 'Modal stream failed.',
            };
          logger.error('[ai/task] modal stream read error', { spaceId }, err);
          push(controller, { type: 'error', message: chippiErrorMessage('internal') });
          sentTerminal = true;
          }
        }
      } finally {
        clearInterval(stopTimer);
        if (leaseGuardian.hasLostAuthority()) {
          terminalOutcome = {
            status: 'failed',
            reason: 'lease_authority_lost',
            error: 'Conversation turn attempt authority could not be renewed.',
          };
        }
        // Safety net — the stream ended with no `done`/`error` event (Modal
        // crash, dropped connection, 600s container kill mid-stream). Persist
        // whatever streamed (idempotent via the cached attempt) AND guarantee a still-
        // connected browser sees exactly one terminal frame so its EventSource
        // closes instead of hanging open forever. When the client is gone the
        // persist is the whole point — the finished turn lands in history.
        try {
          await persistOnce();
        } catch (persistError) {
          const authorityFailure = leaseGuardian.hasLostAuthority()
            || /lease|attempt token|terminal result/i.test(
              persistError instanceof Error ? persistError.message : String(persistError),
            );
          terminalOutcome = {
            status: 'failed',
            reason: authorityFailure ? 'lease_authority_lost' : 'persistence',
            error: persistError instanceof Error ? persistError.message : 'Assistant message persistence failed.',
          };
          logger.warn('[ai/task] modal: final assistant persistence failed', { spaceId }, persistError);
          if (!sentTerminal && !clientGone) {
            push(controller, {
              type: 'error',
              message: authorityFailure
                ? 'This turn no longer had authority to publish its reply.'
                : chippiErrorMessage('persistence'),
              code: authorityFailure ? 'lease_authority_lost' : 'persistence',
            });
            sentTerminal = true;
          }
        }
        if (
          !sentTerminal
          && !clientGone
          && terminalOutcome.status === 'cancelled'
          && !atomicallySettled
        ) {
          try {
            const settled = await onSettled(terminalOutcome);
            terminalOutcome = settledConversationTurnOutcome(settled, terminalOutcome);
            separatelySettled = true;
          } catch (error) {
            terminalOutcome = {
              status: 'failed',
              reason: 'durable_settlement_failed',
              error: error instanceof Error ? error.message : 'Durable turn settlement failed.',
            };
            logger.error('[ai/task] modal pre-terminal durable settlement failed', {
              conversationId,
              turnId,
            }, error);
            push(controller, {
              type: 'error',
              message: chippiErrorMessage('persistence'),
              code: 'persistence',
            });
            sentTerminal = true;
          }
        }
        if (!sentTerminal && !clientGone) {
          if (terminalOutcome.status === 'cancelled') {
            push(controller, { type: 'turn_complete', reason: 'aborted' });
          } else {
            logger.warn('[ai/task] modal stream ended with no terminal event', { spaceId });
            push(controller, { type: 'error', message: chippiErrorMessage('internal') });
          }
          sentTerminal = true;
        }
        try {
          if (!atomicallySettled && !separatelySettled) await onSettled(terminalOutcome);
        } catch (error) {
          logger.error('[ai/task] modal durable turn settlement failed', {
            conversationId,
            turnId,
          }, error);
        }
        // Presence clears only after transcript persistence and durable
        // settlement have both completed or failed visibly.
        await markTurnEnded(conversationId);
        // controller may already be torn down if the client disconnected —
        // closing a cancelled controller throws, so guard it.
        try { controller.close(); } catch { /* already closed by cancel() */ }
        reader.releaseLock();
        leaseGuardian.stop();
        drainDone();
      }
    },
    // Client disconnected (tab/app closed, navigation). Mark it so we stop
    // enqueueing, but DO NOT abort — the start() loop keeps draining Modal to
    // completion and persistOnce() saves the finished turn, so the answer is
    // waiting when the user comes back. The run stays bounded by Modal's own
    // 600s timeout, the SDK maxTurns, and lib/ai-tools/loop-guard, so "keep
    // running" can't become "run forever".
    cancel() {
      clientGone = true;
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
  const read = await readJsonWithLimit(req, BODY_LIMITS.aiText);
  if (!read.ok) return read.response;
  const parsed = parseOrBadRequest(taskBodySchema, read.data);
  if (!parsed.ok) return parsed.response;
  const body: PostBody = parsed.data;
  const spaceSlug = typeof body.spaceSlug === 'string' ? body.spaceSlug.trim() : '';
  const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
  if (!spaceSlug) return NextResponse.json({ error: 'spaceSlug required' }, { status: 400 });
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
  let message = sanitized.sanitized;
  const requestedWorkbookTransform = isWorkbenchEnabled() && isWorkbookTransformIntent(message);

  const abortController = new AbortController();

  const ctxOrResponse = await resolveToolContext(spaceSlug, abortController.signal);
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx: ToolContext = ctxOrResponse;
  let activeWorkbook: ToolContext['activeWorkbook'] | undefined;
  let workModeSelected = body.mode === 'work' || body.mode === 'agent';
  let workExecutionMode = parseWorkExecutionMode(body.executionMode);
  let toolCtx: ToolContext = {
    ...ctx,
    workMode: workModeSelected,
    workExecutionMode,
  };

  // The three rate-limit counters are independent — fire them together
  // instead of paying three sequential Redis round-trips on the critical
  // path before the first token.
  const ip = getClientIp(req);
  const [userLimit, ipLimit, spaceLimit] = await Promise.all([
    checkRateLimit(`ai:task:${ctx.userId}`, 30, 3600),
    checkRateLimit(`chat:ip:${ip}`, 30, 600),
    checkRateLimit(`chat:space:${ctx.space.id}`, 60, 600),
  ]);
  if (!userLimit.allowed) {
    return NextResponse.json({ error: chippiErrorMessage('rate_limited') }, { status: 429 });
  }
  if (!ipLimit.allowed || !spaceLimit.allowed) {
    return NextResponse.json(
      { error: chippiErrorMessage('rate_limited') },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }

  // Dunning gate — pause premium AI for a LAPSED paid subscription (the card
  // failed, the plan was canceled, or the persisted Stripe period expired),
  // while leaving the CRM fully usable. Free/never-subscribed ('inactive')
  // accounts keep their included access. Admins bypass. Fails OPEN so a DB
  // hiccup can't lock out a paying customer.
  //
  // Gate on the account that actually FUNDS the space, not the Space row: Solo/
  // Pro pay from the Space, but Team / Team Plus members are funded by their
  // Brokerage pool and their own Space status stays 'inactive' by design — so
  // reading only the Space let a lapsed brokerage keep premium AI on every seat.
  try {
    const { subscriptionStatus, subscriptionPeriodEnd } =
      await resolveBillingAccount(ctx.space.id);
    const subStatus = subscriptionStatus ?? 'inactive';
    if (isPremiumAccessBlocked(subStatus, subscriptionPeriodEnd)) {
      const { data: userRow } = await supabase
        .from('User')
        .select('platformRole')
        .eq('clerkId', ctx.userId)
        .maybeSingle();
      if (userRow?.platformRole !== 'admin') {
        return NextResponse.json(
          {
            error:
              'Your subscription needs attention — update your payment method in billing to keep using Chippi. Your workspace and data stay available.',
          },
          { status: 402 },
        );
      }
    }
  } catch (err) {
    logger.warn('[ai/task] subscription status check failed — allowing turn', { spaceSlug }, err);
  }

  // Platform admins get unlimited usage: exempt from the budget + credit gates
  // below. Token usage is still RECORDED downstream (ChatUsage), so an admin's
  // consumption is tracked — it's just never blocked.
  let isAdmin = false;
  try {
    isAdmin = await isPlatformAdmin();
  } catch (err) {
    logger.warn('[ai/task] admin check failed, treating as non-admin', { spaceSlug }, err);
  }

  try {
    // Budget settings + today's usage are independent reads — fetch together.
    const [settingsResult, usageResult] = await Promise.all([
      supabase
        .from('AgentSettings')
        .select('dailyTokenBudget')
        .eq('spaceId', ctx.space.id)
        .maybeSingle(),
      // Sums ChatUsage rows + the autonomous Redis counter, matching the
      // Settings display. (The old version read AgentTask token columns no
      // code writes, so enforcement silently passed every time.)
      getTodayTokenUsage(ctx.space.id),
    ]);

    // Default must match the AgentSettings.dailyTokenBudget DB column default
    // (and schemas.py / the settings + usage APIs), which are all 50_000. This
    // fallback was 500_000, so a space with no AgentSettings row was gated at
    // 10x the budget every other surface shows and enforces.
    const dailyTokenBudget: number =
      ((settingsResult.data as { dailyTokenBudget?: number | null } | null)?.dailyTokenBudget as
        | number
        | null
        | undefined) ?? 50_000;
    const { total: todayTokens } = usageResult;

    if (!isAdmin && todayTokens >= dailyTokenBudget) {
      logger.warn('[ai/task] daily token budget exceeded', {
        spaceId: ctx.space.id,
        todayTokens,
        dailyTokenBudget,
      });
      return NextResponse.json({ error: 'Daily token budget exceeded' }, { status: 429 });
    }
  } catch (err) {
    logger.warn('[ai/task] token budget check failed — continuing', { spaceSlug }, err);
  }

  // Credit gate — refuse the turn up front when the funding account is out of
  // credits. No-op unless CREDITS_ENFORCED, so this is dormant until credits go
  // live. Joins the daily-token-budget gate above as a pre-stream refusal the
  // chat client already surfaces (same non-OK JSON error shape as 429/400).
  // Admins skip the credit gate too (unlimited usage).
  if (!isAdmin) {
    try {
      await assertCanSpend(ctx.space.id, 'chat_turn');
    } catch (err) {
      if (err instanceof SubscriptionDelinquentError) {
        return NextResponse.json(
          { error: 'Your subscription is inactive. Update your payment method or resubscribe to keep chatting with Chippi.' },
          { status: 402 },
        );
      }
      if (err instanceof CreditsExhaustedError) {
        return NextResponse.json(
          { error: 'Out of credits. Buy a top-up or upgrade your plan to keep chatting with Chippi.' },
          { status: 402 },
        );
      }
      throw err;
    }
  }

  // This is intentionally after auth, rate, subscription, budget, and credit
  // gates. A normal chat with an open Workbench stays on its original path;
  // only a narrow transform request pays these two scoped identity reads.
  if (requestedWorkbookTransform) {
    activeWorkbook = await resolveActiveWorkbookContext(body.activeWorkbookArtifactId, ctx.space.id);
    toolCtx = { ...toolCtx, workbookTransformRequested: true, ...(activeWorkbook ? { activeWorkbook } : {}) };
  }

  let conversationId = '';
  let conversationTurn: ConversationTurnRecord | null = null;
  try {
    const conversation = await resolveConversation(
      ctx.space.id,
      body.conversationId ?? null,
      message,
      workModeSelected ? 'work' : 'chat',
      workExecutionMode,
    );
    conversationId = conversation.id;
    workModeSelected = conversation.mode === 'work';
    workExecutionMode = conversation.executionMode;

    if (Boolean(body.turnId) !== Boolean(body.clientRequestId)) {
      return NextResponse.json(
        { error: 'turnId and clientRequestId must be provided together' },
        { status: 400 },
      );
    }

    // New clients enqueue before opening the SSE request. Older callers get
    // an additive compatibility row here, but still pass through the same
    // FIFO claim and exact-turn lifecycle.
    const turnId = body.turnId ?? crypto.randomUUID();
    const clientRequestId = body.clientRequestId ?? `legacy:${turnId}`;
    if (!body.turnId) {
      await enqueueConversationTurn(supabase, {
        turnId,
        spaceId: ctx.space.id,
        conversationId,
        mode: conversation.mode,
        source: 'typed',
        clientRequestId,
        message,
        attachmentIds: body.attachmentIds,
      });
    }
    conversationTurn = await claimConversationTurnV2(supabase, {
      turnId,
      spaceId: ctx.space.id,
      conversationId,
      clientRequestId,
      message,
      attachmentIds: body.attachmentIds,
    });
    // PostgreSQL is the instruction authority. The claim RPC has already
    // checked an exact body/idempotency binding; use its canonical text.
    message = conversationTurn.message;

    let conversationGoal = conversation.workGoal;
    let conversationGoalVersion = conversation.workGoalVersion;
    const inlineWorkGoal = workModeSelected ? parseInlineWorkGoal(message) : null;
    if (inlineWorkGoal) {
      const { data: goalRows, error: goalError } = await supabase.rpc(
        'set_conversation_work_goal',
        {
          p_conversation_id: conversationId,
          p_space_id: ctx.space.id,
          p_goal: inlineWorkGoal,
        },
      );
      if (goalError) throw goalError;
      const goalRow = Array.isArray(goalRows) ? goalRows[0] : goalRows;
      conversationGoal = inlineWorkGoal;
      conversationGoalVersion = Number(goalRow?.version ?? (conversationGoalVersion ?? 0) + 1);
    }
    toolCtx = {
      ...toolCtx,
      workMode: workModeSelected,
      workExecutionMode,
      ...(conversationGoal ? { conversationGoal } : {}),
      ...(typeof conversationGoalVersion === 'number' ? { conversationGoalVersion } : {}),
    };
  } catch (err) {
    logger.error('[ai/task] conversation resolve failed', { spaceSlug }, err);
    if (conversationTurn) {
      if (!conversationTurn.attemptToken) throw new Error('Missing turn attempt authority.');
      await finishConversationTurnV2(supabase, {
        turnId: conversationTurn.id,
        spaceId: ctx.space.id,
        conversationId,
        attemptToken: conversationTurn.attemptToken,
        outcome: {
          status: 'failed',
          reason: 'preflight_failed',
          error: err instanceof Error ? err.message : 'Turn preflight failed.',
        },
      }).catch(() => {});
    }
    const detail = err instanceof Error ? err.message : String(err);
    const queueConflict = /queue|claim|binding|pending|running|paused|failed|head|held/i.test(detail);
    return NextResponse.json(
      { error: queueConflict ? 'This turn is queued behind other work.' : chippiErrorMessage('internal') },
      { status: queueConflict ? 409 : 500 },
    );
  }

  if (!conversationTurn) {
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }
  const claimedTurn = conversationTurn;
  if (!claimedTurn.attemptToken) {
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }
  const claimedAttemptToken = claimedTurn.attemptToken;

  const settleConversationTurn = async (outcome: TurnTerminalOutcome) => {
    return finishConversationTurnV2(supabase, {
      turnId: claimedTurn.id,
      spaceId: ctx.space.id,
      conversationId,
      attemptToken: claimedAttemptToken,
      outcome,
    });
  };

  let userMessageId: string;
  try {
    ({ messageId: userMessageId } = await saveUserMessage({
      spaceId: ctx.space.id,
      conversationId,
      content: message,
      attachmentIds: body.attachmentIds,
    }));
  } catch (err) {
    logger.error('[ai/task] save user message failed', { spaceSlug }, err);
    await settleConversationTurn({
      status: 'failed',
      reason: 'user_message_persistence_failed',
      error: err instanceof Error ? err.message : 'User message persistence failed.',
    }).catch(() => {});
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }

  // This is the only chat-side capability lookup. It is deliberately
  // fail-closed: a transient read failure must not interrupt normal chat or
  // advertise a continuation capability we cannot prove is tenant-scoped.
  let workspaceContinuationEligible = false;
  if (isWorkspaceRunContinuationIntent(message)) {
    try {
      workspaceContinuationEligible = await isConversationWorkspaceContinuationEligible(ctx.space.id, conversationId);
    } catch (err) {
      logger.warn('[ai/task] workspace continuation eligibility unavailable', { spaceSlug, conversationId }, err);
    }
  }
  toolCtx = {
    ...toolCtx,
    conversationId,
    continuationIdempotencySeed: chatContinuationIdempotencySeed(userMessageId),
    workspaceContinuationEligible,
  };

  // The turn's credit charge is applied by the model-aware ChatUsage trigger
  // (meter_chat_usage_credits) when usage is recorded — not here. A second flat
  // charge at this point would double-debit the turn. The pre-stream gate above
  // (assertCanSpend) stays: refuse up front when out of credits.

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
          messagePreview: message.slice(0, 50),
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

  if (history.length > 0) {
    const last = history[history.length - 1];
    if (last.role === 'user' && last.content === message) history.pop();
  }

  const hydratedAttachments = await hydrateAttachments(ctx.space.id, body.attachmentIds);

  // ── Unified router ─────────────────────────────────────────────────────────
  // The router decides direct (fast Q&A / multimodal summary) vs agent (full
  // tool surface). Both run IN-PROCESS by default — no Modal cold start, fast
  // first token. Modal is reached two ways and two ways only:
  //   1. the agent runtime spawns deep / swarm sub-tasks ON Modal via
  //      delegate_task (the keystone use the owner wants Modal for), and
  //   2. CHIPPI_CHAT_RUNTIME=modal proxies the WHOLE agent turn to the sandbox
  //      (kept as a fallback / for running heavy turns entirely in Modal).
  // Router errors → 'agent' (its safe default), so a router bug can't silently
  // drop a real action.
  // Turn presence — mark this conversation busy BEFORE any path starts
  // streaming, so a client that reopens (even after a full browser close)
  // can see the turn is in flight via /api/ai/turn-status and wait for the
  // persisted answer instead of showing a dead transcript. Every path's
  // finally clears it; the TTL backstops a crashed function.
  void markTurnStarted(conversationId);

  const routerAttachments = hydratedAttachments.map((a) => ({
    id: a.id,
    mimeType: a.mime_type,
  }));
  // Explicit mode from the top-of-page Chat/Work switch wins over
  // the heuristic router. 'agent' always gets the full tool surface. 'chat'
  // gets the fast direct path ONLY when the heuristic router would also send
  // it direct — workspace-data reads and integration queries still need tools
  // regardless of which mode the composer is in (forcing them direct made the
  // model say "I don't have access to any tools", the bug the escalation
  // hook was meant to rescue). An absent mode falls back to decideRoute.
  const explicitMode: 'chat' | 'agent' = workModeSelected ? 'agent' : 'chat';
  const heuristicRoute = decideRoute(message, routerAttachments);
  const workbenchRequested =
    process.env.NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED === 'true'
    && hydratedAttachments.some((attachment) => isWorkbookAttachment({ mimeType: attachment.mime_type, filename: attachment.filename }))
    && isExplicitWorkbenchIntent(message);
  // A natural follow-up stays in the Workbench TS lane even if the selected
  // id is missing or foreign. In that case the prompt asks the user to reopen
  // a workbook rather than silently falling back to legacy Modal tools.
  const workbookTransformRequested = requestedWorkbookTransform;
  const researchWorkspaceRequested =
    isResearchWorkspaceEnabledForSpace(ctx.space.id) && isResearchWorkspaceIntent(message);
  const route =
    workbenchRequested || workbookTransformRequested || researchWorkspaceRequested || explicitMode === 'agent'
      ? 'agent'
      : explicitMode === 'chat' && heuristicRoute === 'direct'
        ? 'direct'
        : heuristicRoute;

  // Resolve the model for THIS turn: the workspace model forced to something
  // the active provider can actually serve (kills the grok-slug-to-OpenAI
  // mismatch), then upgraded to a vision-capable model if the turn carries
  // attachments the chosen model can't see — so multimodal just works instead
  // of dropping the file on a text-only model.
  const workspaceModel = await loadWorkspaceModel(ctx.space.id);
  const baseModel = resolveChatModel(workspaceModel);
  const turnAttachments = hydratedAttachments.map<MultimodalAttachment>((a) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mime_type,
    url: a.public_url,
    extractedText: a.extracted_text,
  }));
  const { model: turnModel, upgraded } = pickModelForAttachments(
    baseModel,
    turnAttachments,
    isOpenRouterConfigured(),
  );
  if (upgraded) {
    logger.info('[ai/task] vision upgrade for attachment turn', {
      spaceSlug,
      from: baseModel,
      to: turnModel,
    });
  }

  // Direct path — fast Q&A + multimodal summaries, fully in-process.
  if (route === 'direct') {
    logger.info('[ai/task] router → direct', { spaceSlug, model: turnModel });
    return streamDirectTurn({
      spaceId: ctx.space.id,
      userId: ctx.userId,
      conversationId,
      model: turnModel,
      userMessage: message,
      history: history.map((h) => ({ role: h.role, content: h.content })),
      attachments: turnAttachments,
      abortController,
      turnId: claimedTurn.id,
      attemptToken: claimedAttemptToken,
      onSettled: settleConversationTurn,
      // Escalation hook — when the direct model's reply trips
      // shouldEscalate() ("I can't send that from here…"), re-run the SAME
      // message on the in-process TS agent (full tool surface) and pipe its
      // stream through. This was previously hardwired to `false`, so a
      // misrouted action committed the toolless deflection — the realtor
      // read that as "Chippi has no tools".
      onEscalate: async () => {
        logger.info('[ai/task] direct → agent escalation', { spaceSlug, model: turnModel });
        return streamTsChatTurn({
          ctx: { ...toolCtx, attachmentIds: hydratedAttachments.map((a) => a.id), attachmentManifest: hydratedAttachments.map((a) => ({ id: a.id, filename: a.filename })) },
          conversationId,
          userMessage: message,
          history,
          model: turnModel,
          attachments: turnAttachments,
          attachmentManifest: hydratedAttachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mime_type })),
          abortController,
          turnId: claimedTurn.id,
          attemptToken: claimedAttemptToken,
          onSettled: settleConversationTurn,
        });
      },
    });
  }

  // Agent path → Modal. Two ways in:
  //   1. CHIPPI_CHAT_RUNTIME=modal forces ALL agent turns through the sandbox.
  //      This is a deliberate deploy choice, so a missing MODAL_CHAT_URL is a
  //      misconfiguration we surface loudly (callModalAgent returns 503) rather
  //      than silently downgrading the whole deploy to the TS runtime.
  //   2. The realtor picked Work mode for THIS message. Prefer Modal, but if
  //      MODAL_CHAT_URL is unset, degrade gracefully to the in-process TS agent
  //      (it has the full tool surface too) instead of failing the one turn.
  const forcedModal = chatRuntime() === 'modal';
  const perMessageModal = explicitMode === 'agent' && Boolean(process.env.MODAL_CHAT_URL);
  // Workbench is deliberately a TypeScript-native vertical slice: its tool
  // accepts stable Attachment ids and returns a typed UI result. Do not send
  // this one request to the legacy Modal catalog, where that contract does not
  // exist. This is feature-gated and only narrows requests that explicitly ask
  // to open this turn's uploaded spreadsheet.
  const requiresTsWorkbenchTool = workbenchRequested || workbookTransformRequested;
  // Work mode stays on the unified TypeScript runtime because that is where
  // the natural-language durable-work bridge and inline progress contract
  // live. Modal remains an execution backend reached by delegated tools, not
  // a separate product mode with a different catalog.
  const requiresTsNativeTool =
    workModeSelected ||
    requiresTsWorkbenchTool ||
    researchWorkspaceRequested ||
    workspaceContinuationEligible;
  if (route === 'agent' && !requiresTsNativeTool && (forcedModal || perMessageModal)) {
    logger.info('[ai/task] router → agent (Modal)', { spaceSlug, explicitMode, forcedModal });
    return callModalAgent({
      ctx,
      conversationId,
      message,
      history,
      hydratedAttachments,
      abortController,
      spaceSlug,
      turnId: claimedTurn.id,
      attemptToken: claimedAttemptToken,
      onSettled: settleConversationTurn,
    });
  }

  // ── Default: in-process TS runtime (PRIMARY) ─────────────────────────────
  // App-wide LLM client (OpenRouter-first), the realtor's workspace model,
  // full Chippi tool set, approval gates, rate limits, tool-call logging,
  // multimodal, and the delegate_task orchestrator. No Modal cold start —
  // first token is fast. Deep work is spawned ON Modal via delegate_task and
  // streamed back inline.
  logger.info('[ai/task] router → agent (in-process TS)', { spaceSlug, model: turnModel });
  return streamTsChatTurn({
    ctx: { ...toolCtx, attachmentIds: hydratedAttachments.map((a) => a.id), attachmentManifest: hydratedAttachments.map((a) => ({ id: a.id, filename: a.filename })) },
    conversationId,
    userMessage: message,
    history,
    model: turnModel,
    attachments: turnAttachments,
    attachmentManifest: hydratedAttachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mime_type })),
    abortController,
    turnId: claimedTurn.id,
    attemptToken: claimedAttemptToken,
    onSettled: settleConversationTurn,
  });
}

// ── Workspace model lookup ────────────────────────────────────────────────

/**
 * Resolve the chat model the realtor's workspace is configured for. The
 * direct path needs this BEFORE the LLM call (provider detection drives
 * multimodal encoding); the agent path reads it inside Modal so it doesn't
 * need this helper. Falls back to DEFAULT_CHAT_MODEL on any lookup failure.
 */
async function loadWorkspaceModel(spaceId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('AgentSettings')
      .select('"chatModel"')
      .eq('spaceId', spaceId)
      .maybeSingle();
    const m = (data as { chatModel?: string } | null)?.chatModel;
    return m && typeof m === 'string' && m.trim() ? m.trim() : DEFAULT_CHAT_MODEL;
  } catch {
    return DEFAULT_CHAT_MODEL;
  }
}

// ── Modal agent call (extracted so the router can call either path) ──────

interface CallModalAgentInput {
  ctx: ToolContext;
  conversationId: string;
  message: string;
  history: HistoryRow[];
  hydratedAttachments: AttachmentPayload[];
  abortController: AbortController;
  spaceSlug: string;
  turnId: string;
  attemptToken: string;
  onSettled: ConversationTurnSettler;
}

async function callModalAgent(input: CallModalAgentInput): Promise<Response> {
  const { ctx, conversationId, message, history, hydratedAttachments, abortController, spaceSlug, turnId, attemptToken, onSettled } =
    input;

  const modalChatUrl = process.env.MODAL_CHAT_URL;
  if (!modalChatUrl) {
    logger.error('[ai/task] MODAL_CHAT_URL not set — cannot route to Modal sandbox', { spaceSlug });
    await onSettled({ status: 'failed', reason: 'modal_not_configured', error: 'MODAL_CHAT_URL is missing.' }).catch(() => {});
    return NextResponse.json(
      { error: 'Agent backend not configured. Set MODAL_CHAT_URL.' },
      { status: 503 },
    );
  }
  const agentInternalSecret = process.env.AGENT_INTERNAL_SECRET;
  if (!agentInternalSecret) {
    logger.error('[ai/task] AGENT_INTERNAL_SECRET not set — refusing Modal agent call', { spaceSlug });
    await onSettled({ status: 'failed', reason: 'modal_auth_not_configured', error: 'AGENT_INTERNAL_SECRET is missing.' }).catch(() => {});
    return NextResponse.json(
      { error: 'Agent backend auth not configured. Set AGENT_INTERNAL_SECRET.' },
      { status: 503 },
    );
  }

  const payload = {
    secret: agentInternalSecret,
    space_id: ctx.space.id,
    // Composio scopes connections per "entity" (Clerk userId). Without
    // this, Modal can't know which realtor's Gmail / Slack / etc. to
    // load — the agent ends up with zero integration tools regardless
    // of how many the realtor has connected. The Python side reads
    // `user_id` to look up active toolkits in IntegrationConnection
    // and load them via the Composio Python SDK.
    user_id: ctx.userId,
    message,
    history: history.map((h) => ({ role: h.role, content: h.content })),
    conversation_id: conversationId,
    attachments: hydratedAttachments,
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
    logger.error('[ai/task] Modal fetch failed', { spaceSlug }, err);
    await onSettled({ status: 'failed', reason: 'modal_fetch_failed', error: err instanceof Error ? err.message : 'Modal fetch failed.' }).catch(() => {});
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 502 });
  }

  if (!modalRes.ok || !modalRes.body) {
    const status = modalRes.status;
    logger.error('[ai/task] Modal returned error', { status, spaceSlug });
    await onSettled({ status: 'failed', reason: 'modal_response_failed', error: `Modal returned ${status}.` }).catch(() => {});
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 502 });
  }

  return proxyModalStream({
    modalBody: modalRes.body,
    spaceId: ctx.space.id,
    conversationId,
    abortController,
    turnId,
    attemptToken,
    onSettled,
  });
}
