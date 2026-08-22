/**
 * The SSE-streaming wrapper around `runChatTurn`.
 *
 * Lives outside the route so the route stays a thin branch and so this
 * code can be exercised in tests without spinning up Next's request
 * machinery. Mirrors the shape of the Modal-side stream pump in
 * `app/api/ai/task/route.ts`: build a ReadableStream, push framed
 * AgentEvent JSON, persist the assistant message after the stream
 * closes, write any paused-run state if the SDK interrupted.
 *
 * Pause-and-resume:
 *   When the agent run finishes with `result.interruptions` non-empty,
 *   we serialize `result.state`, write a row to AgentPausedRun, and emit
 *   a `permission_required` event whose requestId is the new row id.
 *   The realtor's UI POSTs the decision to
 *   /api/ai/task/resume/[pausedRunId] which re-enters via `resumeChatTurn`.
 */

import crypto from 'crypto';
import { after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { AgentEvent, PushableEvent } from '@/lib/ai-tools/events';
import { createSeqCounter, encodeEvent } from '@/lib/ai-tools/events';
import {
  saveAssistantMessage,
  saveConversationTurnAssistantMessage,
} from '@/lib/ai-tools/persistence';
import type { ToolContext, ToolResult } from '@/lib/ai-tools/types';
import type { MessageBlock, ToolCallBlock } from '@/lib/ai-tools/blocks';
import { chippiErrorMessage } from '@/lib/ai-tools/chippi-voice';
import { runChatTurn, resumeChatTurn } from '@/lib/ai-tools/sdk-chat';
import { createStopPoller } from '@/lib/chat/stop-signal';
import { mapSdkEvent, type SdkStreamEventLike } from '@/lib/ai-tools/sdk-event-mapper';
import {
  DELEGATE_TASK_TOOL_NAME,
  parseSubagentRunId,
  stripSubagentMarker,
} from '@/lib/ai-tools/tools/delegate-task';
import { extractApprovals, serializeRunState, type ToolResultSink } from '@/lib/ai-tools/sdk-bridge';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import { withApprovalDisplayArgs } from '@/lib/ai-tools/permission-enrich';
import { emit as emitTelemetry } from '@/lib/telemetry';
import { logToolCallStart, logToolCallComplete, logToolCallError } from '@/lib/agent/tool-call-logger';
import { compactContext, estimateContextChars } from '@/lib/agent/compaction';
import type { MultimodalAttachment } from '@/lib/chat/multimodal';
import { recordChatUsage } from '@/lib/usage/record-chat-usage';
import { sumSdkTurnUsage } from '@/lib/ai-tools/turn-usage';
import { markTurnEnded } from '@/lib/chat/turn-presence';
import { DEFAULT_CHAT_MODEL } from '@/lib/chat-models';
import {
  settledConversationTurnOutcome,
  startConversationTurnLeaseGuardian,
  type ConversationTurnSettler,
  type TurnTerminalOutcome,
} from '@/lib/chat/turn-control';

const COMPACTION_THRESHOLD_CHARS = 80_000;
const WORK_ACTIVITY_LABEL_LIMIT = 160;

export type ProviderTurnErrorClass =
  | 'reasoning_replay_rejected'
  | 'tool_replay_rejected'
  | 'context_limit'
  | 'rate_limited'
  | 'authentication'
  | 'bad_request'
  | 'provider_server_error'
  | 'transport'
  | 'unknown';

function errorRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function safeMetadataToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const compact = value.trim();
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(compact) ? compact : undefined;
}

function providerErrorDetail(error: unknown): string {
  const outer = errorRecord(error);
  const providerBody = errorRecord(outer?.error);
  const cause = errorRecord(outer?.cause);
  const causeBody = errorRecord(cause?.error);
  const detail =
    providerBody?.message
    ?? causeBody?.message
    ?? outer?.message
    ?? cause?.message;
  return typeof detail === 'string' ? detail.slice(0, 32_768) : '';
}

function classifyProviderTurnError(status: number | undefined, detail: string): ProviderTurnErrorClass {
  const text = detail.toLowerCase();
  if (/reasoning[_\s-]?details?|thinking blocks?|reasoning signature/.test(text)) {
    return 'reasoning_replay_rejected';
  }
  if (/tool[_\s-]?calls?|tool[_\s-]?call[_\s-]?id|tool results?|tool messages?/.test(text)) {
    return 'tool_replay_rejected';
  }
  if (/context.{0,20}(?:length|window|limit)|maximum context/.test(text)) return 'context_limit';
  if (status === 429 || /rate limit|too many requests/.test(text)) return 'rate_limited';
  if (status === 401 || status === 403) return 'authentication';
  if (status === 400 || status === 422) return 'bad_request';
  if (status != null && status >= 500) return 'provider_server_error';
  if (/network|fetch failed|econn|socket|timed? out|connection/.test(text)) return 'transport';
  return 'unknown';
}

/**
 * Extract only non-content provider diagnostics. Never return the provider's
 * message, request body, tool arguments, or user content. A bounded detail is
 * inspected in memory solely to assign a coarse class and correlation hash.
 */
export function providerTurnErrorLogContext(error: unknown): Record<string, unknown> {
  const outer = errorRecord(error);
  const cause = errorRecord(outer?.cause);
  const statusCandidate = outer?.status ?? outer?.statusCode ?? cause?.status ?? cause?.statusCode;
  const status = typeof statusCandidate === 'number' && Number.isFinite(statusCandidate)
    ? statusCandidate
    : undefined;
  const detail = providerErrorDetail(error);
  const requestId = safeMetadataToken(
    outer?.requestID ?? outer?.requestId ?? cause?.requestID ?? cause?.requestId,
  );
  const code = safeMetadataToken(outer?.code ?? cause?.code);
  const providerType = safeMetadataToken(outer?.type ?? cause?.type);
  const errorName = safeMetadataToken(outer?.name ?? cause?.name);

  return {
    providerErrorClass: classifyProviderTurnError(status, detail),
    ...(status != null ? { providerStatus: status } : {}),
    ...(code ? { providerCode: code } : {}),
    ...(providerType ? { providerType } : {}),
    ...(requestId ? { providerRequestId: requestId } : {}),
    ...(errorName ? { errorName } : {}),
    ...(detail
      ? {
          providerBodyBytes: new TextEncoder().encode(detail).byteLength,
          providerBodySha256: crypto.createHash('sha256').update(detail).digest('hex'),
        }
      : {}),
  };
}

/**
 * Provider exceptions can embed the entire rejected request, including user
 * content and tool arguments. Keep the raw error out of logger.error's third
 * parameter because that parameter is forwarded to observability providers.
 */
export function logProviderTurnFailure(
  stage: 'start failed' | 'stream pump crashed',
  context: { conversationId: string; model: string },
  error: unknown,
): void {
  logger.error(`[ai/task ts] ${stage}`, {
    ...context,
    ...providerTurnErrorLogContext(error),
  });
}

/** Keep activity copy compact even when a provider or tool supplied a long value. */
export function boundedWorkActivityLabel(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= WORK_ACTIVITY_LABEL_LIMIT) return compact;
  return `${compact.slice(0, WORK_ACTIVITY_LABEL_LIMIT - 1).trimEnd()}…`;
}

/**
 * Opaque, deterministic correlation id for one persisted user turn. The seed
 * is server-issued (normally the saved Message id wrapped by
 * continuationIdempotencySeed), never model-authored.
 */
export function createWorkActivityId(seed: string): string {
  return `work_${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function readableToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

interface HistoryRow {
  role: 'user' | 'assistant';
  content: string;
}

interface StreamTsChatTurnInput {
  ctx: ToolContext;
  conversationId: string;
  userMessage: string;
  /** Prior history, already deduped against the just-saved user turn. */
  history: HistoryRow[];
  /** Workspace chat model slug. Resolved to the active provider downstream. */
  model?: string;
  /** Attachments for this turn (images / PDFs), hydrated to signed URLs. */
  attachments?: MultimodalAttachment[];
  attachmentManifest?: Array<{ id: string; filename: string; mimeType: string }>;
  abortController: AbortController;
  /** Stable database turn identity. Stop/pause/finish must never key on a conversation. */
  turnId?: string;
  /** Exact v2 attempt authority for transcript publication. */
  attemptToken?: string;
  onSettled?: ConversationTurnSettler;
}

export function streamTsChatTurn(input: StreamTsChatTurnInput): Response {
  // Run compaction synchronously-ish by capturing the async work in a
  // promise that resolves before `start` is awaited inside buildSseStream.
  // We need to mutate history before the agent call, so we do the work up
  // front and carry it into the closure.
  const initialEvents: PushableEvent[] = [];
  const historyPromise: Promise<HistoryRow[]> = (async () => {
    const history = input.history ?? [];
    if (estimateContextChars(history) > COMPACTION_THRESHOLD_CHARS) {
      try {
        const compacted = await compactContext({
          messages: history,
          maxContextChars: COMPACTION_THRESHOLD_CHARS,
          // Compaction picks its own provider-correct summarizer model
          // internally; this field is vestigial. Pass the workspace model so
          // it's at least honest about the turn it's compacting for.
          model: input.model ?? DEFAULT_CHAT_MODEL,
        });
        initialEvents.push({
          type: 'system',
          content: 'Context compacted to fit within model limits.',
        });
        return compacted.messages as HistoryRow[];
      } catch {
        // Non-blocking: compaction failure never stops the agent.
      }
    }
    return history;
  })();

  const stream = buildSseStream({
    ctx: input.ctx,
    attachmentManifest: input.attachmentManifest,
    workActivityId: input.ctx.workMode
      ? createWorkActivityId(
          input.ctx.continuationIdempotencySeed ??
            `${input.conversationId}:${crypto.randomUUID()}`,
        )
      : undefined,
    conversationId: input.conversationId,
    turnId: input.turnId,
    attemptToken: input.attemptToken,
    onSettled: input.onSettled,
    abortController: input.abortController,
    initialEvents,
    model: input.model,
    start: async (resultSink) => {
      const history = await historyPromise;
      const { result } = await runChatTurn({
        ctx: input.ctx,
        userMessage: input.userMessage,
        history,
        model: input.model,
        attachments: input.attachments,
        attachmentManifest: input.attachmentManifest,
        resultSink,
      });
      return { result: result as unknown as SdkResultLike };
    },
  });
  return wrapAsResponse(stream, input.abortController);
}

// ── Resume entry point — used by /api/ai/task/resume/[pausedRunId] ─────────

interface StreamResumeInput {
  ctx: ToolContext;
  conversationId: string;
  serializedState: string;
  callId: string;
  decision: { approved: true } | { approved: false; message?: string };
  abortController: AbortController;
  turnId?: string;
  attemptToken?: string;
  onSettled?: ConversationTurnSettler;
}

export function streamTsResumeTurn(input: StreamResumeInput): Response {
  const stream = buildSseStream({
    ctx: input.ctx,
    workActivityId: input.ctx.workMode
      ? createWorkActivityId(`${input.conversationId}:${input.serializedState}`)
      : undefined,
    conversationId: input.conversationId,
    turnId: input.turnId,
    attemptToken: input.attemptToken,
    onSettled: input.onSettled,
    abortController: input.abortController,
    start: async (resultSink) => {
      const { result } = await resumeChatTurn({
        ctx: input.ctx,
        serializedState: input.serializedState,
        callId: input.callId,
        decision: input.decision,
        resultSink,
      });
      return { result: result as unknown as SdkResultLike };
    },
  });
  return wrapAsResponse(stream, input.abortController);
}

// ── Internals ──────────────────────────────────────────────────────────────

/**
 * Idle watchdog for the stream pump. If the SDK stream yields no event and
 * the run never completes for this long, treat the turn as wedged. This is
 * the guard against the production failure where a stalled run parked
 * `reader.read()` / `result.completed` forever with no thrown error, riding
 * the lambda to its 300s wall with nothing in the logs. 90s is generous for a
 * legitimate reasoning gap (the LLM client also has its own 120s per-request
 * timeout) and well under maxDuration.
 */
const PUMP_IDLE_TIMEOUT_MS = 90_000;

/** Distinct from AbortError on purpose: the catch in the pump suppresses the
 *  error event only for client aborts. A stall MUST surface as an error so the
 *  browser stops waiting, so it carries its own name. */
class StreamStalledError extends Error {
  constructor() {
    super('Agent stream stalled — no activity within the idle timeout.');
    this.name = 'StreamStalledError';
  }
}

/**
 * Race a pump await against the idle watchdog. On timeout, abort the
 * underlying run (so it stops burning resources) and reject with
 * StreamStalledError, which the pump's catch turns into a terminal error
 * event. A settled `p` clears the timer so a healthy stream pays nothing.
 */
function createIdleWatchdog(abortController: AbortController) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onStall: ((error: StreamStalledError) => void) | undefined;

  const trip = () => {
    try {
      abortController.abort();
    } catch {
      /* already aborted */
    }
    onStall?.(new StreamStalledError());
  };

  const heartbeat = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(trip, PUMP_IDLE_TIMEOUT_MS);
  };

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    onStall = undefined;
  };

  function wrap<T>(p: Promise<T>): Promise<T> {
    heartbeat();
    return new Promise<T>((resolve, reject) => {
      onStall = reject;
      p.then(
        (v) => {
          stop();
          resolve(v);
        },
        (e) => {
          stop();
          reject(e);
        },
      );
    });
  }

  return { wrap, heartbeat, stop };
}

interface BuildStreamInput {
  ctx: ToolContext;
  /** Present only for Work. Groups the normalized activity receipts. */
  workActivityId?: string;
  /** Fresh-turn hydrated attachment manifest, retained for pause durability. */
  attachmentManifest?: Array<{ id: string; filename: string; mimeType: string }>;
  conversationId: string;
  turnId?: string;
  attemptToken?: string;
  onSettled?: ConversationTurnSettler;
  abortController: AbortController;
  /**
   * Returns the SDK streamed result. Either fresh or resumed. Receives the
   * per-turn `resultSink` so the agent's tools can stash their structured
   * `data`/`display` keyed by call id; the pump reads it back on
   * `tool_call_result`.
   */
  start: (resultSink: ToolResultSink) => Promise<{ result: SdkResultLike }>;
  /**
   * Events to push immediately after the stream opens, before the agent
   * call fires. Used to relay compaction notices assembled before the
   * ReadableStream constructor ran (where pushEvent isn't yet available).
   */
  initialEvents?: PushableEvent[];
  /** The model this turn ran on — for ChatUsage attribution + pricing.
   *  Falls back to the default chat model (resume path doesn't carry it). */
  model?: string;
}

/**
 * What we actually need from the SDK streamed result. Loose so tests can
 * pass plain objects and so we don't lock to a specific SDK type for an
 * internal helper.
 */
interface SdkResultLike {
  toStream(): ReadableStream<unknown> | { getReader(): ReadableStreamDefaultReader<unknown> };
  completed: Promise<void>;
  interruptions?: ReadonlyArray<unknown>;
  state?: { toString(): string };
  /** Per-model-call responses; each carries a `usage` block once the call
   *  settles. Summed across the turn for ChatUsage. Public getter on the
   *  SDK's streamed result. */
  rawResponses?: ReadonlyArray<{
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      inputTokensDetails?: Record<string, number> | Array<Record<string, number>>;
      cost?: number;
      costUsd?: number;
    };
  }>;
}

function buildSseStream(input: BuildStreamInput): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Hold the serverless function open until the turn (tools, model calls,
      // persistence) finishes even if the browser disconnects mid-stream —
      // cancel() below no longer aborts, and without this registration the
      // platform may suspend the function once the response is cancelled.
      let turnDone!: () => void;
      const turnDonePromise = new Promise<void>((resolve) => {
        turnDone = resolve;
      });
      try {
        after(() => turnDonePromise);
      } catch {
        /* outside a request context (tests, workers) */
      }

      const nextSeq = createSeqCounter();
      let textBuffer = '';
      let terminalOutcome: TurnTerminalOutcome = {
        status: 'failed',
        reason: 'stream_closed_without_terminal_event',
        error: 'The stream closed without a terminal event.',
      };
      let atomicallySettled = false;
      let separatelySettled = false;
      const leaseGuardian = input.turnId && input.attemptToken
        ? startConversationTurnLeaseGuardian(supabase, {
            turnId: input.turnId,
            spaceId: input.ctx.space.id,
            conversationId: input.conversationId,
            attemptToken: input.attemptToken,
            abortController: input.abortController,
          })
        : null;
      // Successful terminal receipts are held until assistant persistence has
      // committed. Text/tool events can stream live, but the browser and FIFO
      // ledger must never be told "complete" for a reply that will disappear
      // from history on reload.
      let pendingTurnCompleteReason: 'complete' | 'paused' | 'aborted' | null = null;

      // The model's thinking trace for this turn (auto-think). Accumulated
      // from reasoning_delta events and persisted as a leading `reasoning`
      // block so the "Thought for Xs" disclosure survives reload — the
      // client's live buffer only exists for the session.
      let thoughtBuffer = '';
      const turnStartedAt = Date.now();

      // Track the assistant text that's accumulated since the last tool
      // call landed. This is the "reasoning" we pin to the next tool
      // call's telemetry — the sentence the realtor sees before the
      // approval prompt. Reset on every tool_call_start.
      let reasoningBuffer = '';

      // Maps callId → the pending ExecutionStep insert. Tool results can arrive
      // before that insert resolves (especially for fast local tools), so retaining
      // the promise prevents a terminal result from racing past the ledger row.
      const callIdToStepPromise = new Map<string, Promise<string>>();

      // Maps callId → tool name, so on tool_call_result (which carries no
      // name) we can recognize a delegate_task result and lift the SwarmRun
      // id out of its summary marker.
      const callIdToToolName = new Map<string, string>();
      const callIdToPlanStepCount = new Map<string, number>();

      // Sub-agent task blocks spawned this turn (via delegate_task). Persisted
      // alongside the assistant text so a reloaded conversation re-shows the
      // live task card.
      const subagentBlocks: MessageBlock[] = [];

      // Rich payloads (data + display) captured from tool handlers, keyed by
      // SDK call id. The bridge writes here via the sink during execute; we
      // read it back on the matching tool_call_result to attach the payload to
      // the SSE frame (and the persisted block) WITHOUT it touching the model's
      // context. See `ToolResultSink` in sdk-bridge.ts.
      const richByCallId = new Map<string, { data?: unknown; display?: ToolResult['display'] }>();
      const resultSink: ToolResultSink = (callId, rich) => {
        richByCallId.set(callId, rich);
      };

      // Tool-call blocks for THIS turn, in call order, settled as results
      // arrive. Persisted so a reloaded conversation re-renders the rich
      // inline cards (contacts table, weather, …) — previously the TS runtime
      // saved only text + subagent blocks, so tool cards vanished on refresh.
      const toolBlocks: ToolCallBlock[] = [];
      const toolBlockByCallId = new Map<string, ToolCallBlock>();

      // `work_activity` is emitted only for the explicit Work surface. Keep a
      // single terminal receipt even if a late persistence warning follows a
      // successful model turn.
      let terminalActivityEmitted = false;
      let providerActivityEmitted = false;
      let pushEvent!: (event: PushableEvent) => void;
      const pushWorkActivity = (
        event: Omit<Extract<PushableEvent, { type: 'work_activity' }>, 'type' | 'workId'>,
      ) => {
        if (!input.workActivityId) return;
        pushEvent({
          type: 'work_activity',
          workId: input.workActivityId,
          ...event,
          label: boundedWorkActivityLabel(event.label),
        });
      };

      // Drain any events that were queued before the stream opened
      // (e.g. compaction notice assembled in streamTsChatTurn).
      // We define pushEvent first and call it immediately after.
      pushEvent = (event: PushableEvent) => {
        // Once lease renewal fails this process is stale. Do not publish any
        // later provider/tool frame while abort propagates through the SDK.
        if (leaseGuardian?.hasLostAuthority() && event.type !== 'error') return;
        if (event.type === 'turn_complete') {
          terminalOutcome = event.reason === 'complete'
            ? { status: 'completed', reason: 'complete' }
            : event.reason === 'paused'
              ? { status: 'paused', reason: 'approval_required' }
              : { status: 'cancelled', reason: 'interrupted' };
        } else if (event.type === 'error') {
          terminalOutcome = {
            status: 'failed',
            reason: event.code ?? 'stream_error',
            error: event.message,
          };
        }
        if (event.type === 'turn_complete' && !terminalActivityEmitted) {
          terminalActivityEmitted = true;
          const status =
            event.reason === 'complete'
              ? 'completed'
              : event.reason === 'paused'
                ? 'paused'
                : 'cancelled';
          pushWorkActivity({
            phase: 'terminal',
            status,
            label:
              event.reason === 'complete'
                ? 'Work turn finished'
                : event.reason === 'paused'
                  ? 'Work is waiting for review'
                  : 'Work turn stopped',
          });
        } else if (event.type === 'error' && !terminalActivityEmitted) {
          terminalActivityEmitted = true;
          pushWorkActivity({
            phase: 'terminal',
            status: 'failed',
            label: 'Work turn could not finish',
          });
        }

        if (event.type === 'text_delta') {
          textBuffer += event.delta;
          reasoningBuffer += event.delta;
        }
        if (event.type === 'reasoning_delta') {
          thoughtBuffer += event.delta;
        }
        if (event.type === 'tool_call_start') {
          // When the agent invokes `create_plan`, emit a `plan_created` event
          // immediately so the frontend can render the PlanCard before any
          // further tool calls fire. The tool itself is a no-op on the server
          // (no side effects); its value is purely the plan it carries.
          if (event.name === 'create_plan') {
            const args = event.args as { task?: unknown; steps?: unknown };
            const task = typeof args.task === 'string' ? args.task : '';
            const steps = Array.isArray(args.steps)
              ? (args.steps as Array<Record<string, unknown>>).map((s) => ({
                  title: typeof s['title'] === 'string' ? s['title'] : '',
                  description: typeof s['description'] === 'string' ? s['description'] : '',
                }))
              : [];
            callIdToPlanStepCount.set(event.callId, steps.length);
            pushWorkActivity({
              phase: 'plan',
              status: 'active',
              label: `Preparing ${steps.length} plan step${steps.length === 1 ? '' : 's'}`,
              toolCallId: event.callId,
              toolName: event.name,
              planStepCount: steps.length,
            });
            pushEvent({ type: 'plan_created', task, steps });
          } else {
            pushWorkActivity({
              phase: 'tool',
              status: 'active',
              label: `Running ${readableToolName(event.name)}`,
              toolCallId: event.callId,
              toolName: event.name,
            });
          }

          // Fire-and-forget — telemetry must never block the stream.
          // Trim aggressively; we want the closest preceding sentence,
          // not the whole turn's prose.
          const reasoning = trimReasoning(reasoningBuffer);
          void emitTelemetry({
            event: 'agent_tool_called',
            spaceId: input.ctx.space.id,
            userId: input.ctx.userId,
            payload: {
              toolName: event.name,
              callId: event.callId,
              args: event.args,
              reasoning,
              conversationId: input.conversationId,
            },
          });
          // Reset for the next tool call. If multiple tool calls fire
          // back-to-back without intervening text, the reasoning for
          // the second one is empty — that's honest.
          reasoningBuffer = '';

          // Remember the tool name so the result branch can recognize a
          // delegate_task call.
          callIdToToolName.set(event.callId, event.name);

          // Open a tool-call block for persistence; settled on its result.
          // Waiting delegate_task renders as a compact specialist row.
          // Legacy swarm launches still add a subagent_task card below.
          {
            const block: ToolCallBlock = {
              type: 'tool_call',
              callId: event.callId,
              name: event.name,
              args: event.args,
              status: 'complete',
            };
            toolBlocks.push(block);
            toolBlockByCallId.set(event.callId, block);
          }

          // Fire-and-forget ExecutionStep logging. Never awaited — must not
          // block or affect the stream in any way.
          const stepPromise = logToolCallStart(
            input.ctx.space.id,
            event.name,
            event.args,
            undefined,
          );
          callIdToStepPromise.set(event.callId, stepPromise);
          void stepPromise.catch(() => {
            if (callIdToStepPromise.get(event.callId) === stepPromise) {
              callIdToStepPromise.delete(event.callId);
            }
          });
        }

        if (event.type === 'tool_call_result') {
          const stepPromise = callIdToStepPromise.get(event.callId);
          if (stepPromise) {
            callIdToStepPromise.delete(event.callId);
            void stepPromise.then((stepId) => (
              event.ok
                ? logToolCallComplete(stepId, event.summary)
                : logToolCallError(stepId, event.error ?? event.summary)
            )).catch(() => {});
          }

          // Attach the structured payload the tool stashed in the sink so the
          // rich inline card (contacts table, weather, …) gets its data. The
          // mapper only carries the summary string; data/display ride here.
          const rich = richByCallId.get(event.callId);
          if (rich) {
            richByCallId.delete(event.callId);
            if (rich.data !== undefined) event.data = rich.data;
            if (rich.display) event.display = rich.display;
          }

          // Settle the persisted tool-call block so a reloaded conversation
          // re-renders this card with the same data/display.
          const block = toolBlockByCallId.get(event.callId);
          if (block) {
            block.status = event.ok ? 'complete' : 'error';
            block.result = {
              ok: event.ok,
              summary: event.summary,
              data: rich?.data,
              error: event.error,
            };
            if (rich?.display) block.display = rich.display;
          }

          // delegate_task landed → lift the SwarmRun id out of the summary
          // marker, strip the marker so the realtor sees clean text, push a
          // persistable subagent_task block, and emit subagent_spawned so the
          // client mounts the live task card.
          const toolName = callIdToToolName.get(event.callId);
          callIdToToolName.delete(event.callId);
          if (toolName === 'create_plan') {
            const planStepCount = callIdToPlanStepCount.get(event.callId);
            callIdToPlanStepCount.delete(event.callId);
            pushWorkActivity({
              phase: 'plan',
              status: event.ok ? 'completed' : 'failed',
              label: event.ok
                ? `Plan ready${planStepCount === undefined ? '' : ` with ${planStepCount} step${planStepCount === 1 ? '' : 's'}`}`
                : 'Plan could not be created',
              toolCallId: event.callId,
              toolName,
              ...(planStepCount === undefined ? {} : { planStepCount }),
            });
          } else if (toolName) {
            pushWorkActivity({
              phase: 'tool',
              status: event.ok ? 'completed' : 'failed',
              label: `${readableToolName(toolName)} ${event.ok ? 'finished' : 'failed'}`,
              toolCallId: event.callId,
              toolName,
            });
          }
          if (toolName === DELEGATE_TASK_TOOL_NAME && event.ok) {
            const runId = parseSubagentRunId(event.summary);
            event.summary = stripSubagentMarker(event.summary);
            if (runId) {
              const goal = event.summary
                .replace(/^Delegated to a sub-agent\.\s*Working on it now:\s*/i, '')
                .trim();
              subagentBlocks.push({
                type: 'subagent_task',
                callId: event.callId,
                runId,
                goal,
              });
              pushWorkActivity({
                phase: 'specialist',
                status: 'active',
                label: 'Specialist team started',
                toolCallId: event.callId,
                toolName,
                subagentRunId: runId,
              });
              pushEvent({ type: 'subagent_spawned', runId, goal, callId: event.callId });
            }
          }
        }
        const full = { ...event, seq: nextSeq(), ts: new Date().toISOString() } as AgentEvent;
        try {
          controller.enqueue(encodeEvent(full));
        } catch {
          /* controller already closed */
        }
      };

      // These receipts are grounded in route/runtime boundaries, not model
      // narration. The request and user message have already been validated
      // and persisted before this stream is constructed; context assembly is
      // now actively running.
      pushWorkActivity({
        phase: 'request',
        status: 'completed',
        label: 'Request received',
      });
      pushWorkActivity({
        phase: 'context',
        status: 'active',
        label: 'Preparing workspace context',
      });

      // Emit any events queued before the stream opened (e.g. compaction notice).
      for (const ev of input.initialEvents ?? []) {
        pushEvent(ev);
      }

      // Immediate signal for the thinking indicator — the agent path can
      // spend seconds in context assembly + the first model call before any
      // visible event fires. Superseded client-side by tool_call_start
      // labels and the first text_delta.
      const idleWatchdog = createIdleWatchdog(input.abortController);
      input.ctx.conversationId = input.ctx.conversationId ?? input.conversationId;
      input.ctx.onProgress = (label) => {
        idleWatchdog.heartbeat();
        pushEvent({ type: 'status', label });
      };
      input.ctx.onPermissionRequired = (event) => {
        idleWatchdog.heartbeat();
        pushEvent({
          type: 'permission_required',
          requestId: event.requestId,
          callId: event.callId,
          name: event.name,
          args: event.args,
          summary: event.summary,
          inline: event.inline,
          otherPendingCalls: event.otherPendingCalls,
        });
      };
      input.ctx.onPermissionResolved = (event) => {
        idleWatchdog.heartbeat();
        pushEvent({
          type: 'permission_resolved',
          requestId: event.requestId,
          callId: event.callId,
          decision: event.decision,
        });
      };
      pushEvent({ type: 'status', label: 'Thinking…' });

      let result: SdkResultLike;
      try {
        // Verify the attempt immediately instead of waiting for the first
        // timer tick. This closes the gap between route claim and provider
        // startup on a slow/cold serverless invocation.
        await leaseGuardian?.renewNow();
        ({ result } = await input.start(resultSink));
        pushWorkActivity({
          phase: 'context',
          status: 'completed',
          label: 'Workspace context ready',
        });
      } catch (err) {
        const leaseLost = leaseGuardian?.hasLostAuthority() ?? false;
        const aborted = (err as { name?: string })?.name === 'AbortError';
        if (leaseLost) {
          pushEvent({
            type: 'error',
            message: 'This turn lost execution authority and was stopped safely.',
            code: 'internal',
          });
        } else if (!aborted) {
          logProviderTurnFailure('start failed', {
            conversationId: input.conversationId,
            model: input.model ?? DEFAULT_CHAT_MODEL,
          }, err);
          pushEvent({
            type: 'error',
            message: chippiErrorMessage('internal'),
            code: 'internal',
          });
        } else if (!terminalActivityEmitted) {
          terminalActivityEmitted = true;
          pushWorkActivity({
            phase: 'terminal',
            status: 'cancelled',
            label: 'Work turn stopped',
          });
          terminalOutcome = { status: 'cancelled', reason: 'interrupted' };
        }
        // Startup failures happen before the stream-pump try/finally below.
        // Settle the exact durable turn here or it remains `running` forever
        // and blocks every later queued instruction.
        leaseGuardian?.stop();
        if (input.onSettled) {
          try {
            await input.onSettled(terminalOutcome);
          } catch (settlementError) {
            logger.error('[ai/task ts] startup settlement failed', {
              conversationId: input.conversationId,
              turnId: input.turnId,
            }, settlementError);
          }
        }
        await markTurnEnded(input.conversationId);
        turnDone();
        try { controller.close(); } catch { /* already closed */ }
        return;
      }

      // Explicit Stop (POST /api/ai/stop) — polled at a bounded cadence
      // between stream events. Distinct from disconnect (which must NOT
      // stop the turn): Stop aborts generation and tool execution; the
      // finally block persists whatever the user already saw.
      // Fresh durable turns always carry turnId. The fallback keeps legacy
      // tests/resumes functional without reintroducing a conversation-scoped
      // key into the migrated path.
      const shouldStop = createStopPoller(input.turnId ?? `legacy:${input.conversationId}`);
      let stopRequested = false;

      try {
        const stream = result.toStream() as { getReader(): ReadableStreamDefaultReader<unknown> };
        const reader = stream.getReader();
        while (true) {
          void shouldStop().then((s) => {
            if (s && !stopRequested) {
              stopRequested = true;
              input.abortController.abort();
            }
          });
          if (stopRequested) break;
          // Each read is raced against the idle watchdog — a stalled stream
          // rejects with StreamStalledError instead of parking forever.
          const { done, value } = await idleWatchdog.wrap(reader.read());
          if (done) break;
          leaseGuardian?.assertActive();
          if (!providerActivityEmitted) {
            providerActivityEmitted = true;
            pushWorkActivity({
              phase: 'provider',
              status: 'active',
              label: 'Model activity started',
            });
          }
          const mapped = mapSdkEvent(value as SdkStreamEventLike, ALL_TOOLS);
          if (mapped?.type === 'permission_required') {
            mapped.args = await withApprovalDisplayArgs(
              input.ctx.space.id,
              mapped.name,
              mapped.args,
            );
            pushEvent(mapped);
          } else if (mapped) {
            pushEvent(mapped);
          }
        }
        // Stopped: skip the completed/usage/pause bookkeeping (the SDK run
        // was aborted mid-flight; its usage aggregate is unreliable), tell
        // the client honestly, and let the finally block persist what the
        // user already saw.
        if (stopRequested) {
          pendingTurnCompleteReason = 'aborted';
          terminalOutcome = { status: 'cancelled', reason: 'interrupted' };
          return;
        }

        // Block until the SDK declares the run complete so result.interruptions
        // and result.state are stable before we read them. Same watchdog — the
        // SDK can finish the stream yet never resolve `completed`.
        await idleWatchdog.wrap(result.completed);

        // Record token usage for this turn — the in-process agent path's
        // equivalent of what the direct path (record-chat-usage) and the Modal
        // path (record_chat_usage) already do. WITHOUT this, the now-default
        // runtime's tokens never hit ChatUsage, so the Usage page misses agent
        // turns AND the daily token budget (which sums ChatUsage) is silently
        // bypassed. Fire-and-forget: usage accounting must never block or fail
        // the stream. recordChatUsage no-ops when the provider reported no
        // usage (all-zero), so this is safe to call unconditionally.
        {
          const usage = sumSdkTurnUsage(result);
          void recordChatUsage({
            spaceId: input.ctx.space.id,
            userId: input.ctx.userId,
            conversationId: input.conversationId,
            model: input.model ?? DEFAULT_CHAT_MODEL,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            cachedTokens: usage.cachedTokens,
            costUsd: usage.costUsd,
            route: 'agent',
            runtime: 'ts',
          }).catch(() => {});
        }

        // Pause path: if the run paused for approval, persist the state,
        // emit permission_required with the AgentPausedRun id as requestId,
        // and report the turn as paused.
        if (result.interruptions && result.interruptions.length > 0 && result.state) {
          const pausedRunId = await persistPausedRun({
            ctx: input.ctx,
            turnId: input.turnId,
            attachmentManifest: input.attachmentManifest,
            conversationId: input.conversationId,
            state: result.state,
            interruptions: result.interruptions,
          });
          if (pausedRunId) {
            // The mapper already pushed a permission_required event keyed
            // by callId. Emit a fresh one with the AgentPausedRun id as
            // requestId so the resume route knows where to PATCH.
            const approvals = extractApprovals(
              { interruptions: result.interruptions as Array<{
                rawItem: { callId?: string; id?: string };
                name?: string;
                arguments?: string;
              }> },
              ALL_TOOLS,
            );
            const first = approvals[0];
            if (first) {
              const args = await withApprovalDisplayArgs(
                input.ctx.space.id,
                first.toolName,
                asRecord(first.arguments),
              );
              const otherPendingCalls = await Promise.all(
                approvals.slice(1).map(async (a) => ({
                  callId: a.callId,
                  name: a.toolName,
                  args: await withApprovalDisplayArgs(
                    input.ctx.space.id,
                    a.toolName,
                    asRecord(a.arguments),
                  ),
                  summary: a.summary,
                })),
              );
              pushEvent({
                type: 'permission_required',
                requestId: pausedRunId,
                callId: first.callId,
                name: first.toolName,
                args,
                summary: first.summary,
                otherPendingCalls,
              });
            }
            pendingTurnCompleteReason = 'paused';
            terminalOutcome = { status: 'paused', reason: 'approval_required' };
          } else {
            // Never create an unresumable paused ConversationTurn. If the
            // checkpoint row could not be persisted, fail visibly and hold
            // the queue for an explicit retry/reconciliation decision.
            pushEvent({
              type: 'error',
              message: 'Chippi could not save the review checkpoint. No action was taken.',
              code: 'persistence',
            });
          }
        } else {
          // A completed turn that produced NOTHING visible — no prose, no
          // tool cards, no delegated task — is indistinguishable from
          // "Chippi ignored me", and since the finally below only persists
          // when one of those buffers is non-empty it also leaves no trace
          // on reload. Say so instead. (Thinking-only turns land here when a
          // model spends its whole budget reasoning.)
          if (!textBuffer.trim() && toolBlocks.length === 0 && subagentBlocks.length === 0) {
            logger.warn('[ai/task ts] turn completed with no visible output', {
              conversationId: input.conversationId,
            });
            textBuffer = chippiErrorMessage('empty_reply');
            pushEvent({ type: 'text_delta', delta: textBuffer });
          }
          pendingTurnCompleteReason = 'complete';
          terminalOutcome = { status: 'completed', reason: 'complete' };
        }
      } catch (err) {
        const leaseLost = leaseGuardian?.hasLostAuthority() ?? false;
        const aborted = (err as { name?: string })?.name === 'AbortError';
        if (leaseLost) {
          terminalOutcome = {
            status: 'failed',
            reason: 'lease_authority_lost',
            error: 'Conversation turn attempt authority could not be renewed.',
          };
          pendingTurnCompleteReason = null;
          pushEvent({
            type: 'error',
            message: 'This turn lost execution authority and was stopped safely.',
            code: 'internal',
          });
        } else if (!aborted) {
          logProviderTurnFailure('stream pump crashed', {
            conversationId: input.conversationId,
            model: input.model ?? DEFAULT_CHAT_MODEL,
          }, err);
          pushEvent({
            type: 'error',
            message: chippiErrorMessage('internal'),
            code: 'internal',
          });
        } else if (stopRequested) {
          // The abort raced into a pending read — still an explicit Stop.
          pendingTurnCompleteReason = 'aborted';
          terminalOutcome = { status: 'cancelled', reason: 'interrupted' };
        }
      } finally {
        if (leaseGuardian?.hasLostAuthority()) {
          terminalOutcome = {
            status: 'failed',
            reason: 'lease_authority_lost',
            error: 'Conversation turn attempt authority could not be renewed.',
          };
          pendingTurnCompleteReason = null;
          if (!terminalActivityEmitted) {
            pushEvent({
              type: 'error',
              message: 'This turn lost execution authority and was stopped safely.',
              code: 'internal',
            });
          }
        }
        // Persist the assistant text. Empty buffers are normal on a paused
        // turn (the model hasn't said anything yet) — saveAssistantMessage
        // handles the empty-text case with a placeholder.
        //
        // Persistence is the terminal barrier. Do not retry an ambiguous
        // insert: saveAssistantMessage currently creates a random Message id,
        // so a committed insert followed by a lost response would turn a
        // retry into a duplicate transcript row. A failure stays visible and
        // keeps the durable turn failed for explicit reconciliation.
        if (
          !leaseGuardian?.hasLostAuthority()
          && (textBuffer.trim() || subagentBlocks.length > 0 || toolBlocks.length > 0)
        ) {
          // Order: tool-call cards first (what Chippi looked up / did — incl.
          // their rich data/display so the inline cards re-render on reload),
          // then the assistant's prose, then any delegated task cards. Reads
          // top-to-bottom as "here's what I did, here's the answer, here's the
          // deeper job I kicked off".
          const blocks: MessageBlock[] = [
            // Thinking trace first — same ordering the client renders live.
            ...(thoughtBuffer.trim()
              ? [
                  {
                    type: 'reasoning',
                    content: thoughtBuffer.trim(),
                    durationMs: Date.now() - turnStartedAt,
                  } as MessageBlock,
                ]
              : []),
            ...toolBlocks,
            ...(textBuffer.trim() ? [{ type: 'text', content: textBuffer } as MessageBlock] : []),
            ...subagentBlocks,
          ];
          let saved = false;
          let lastError: unknown;
          try {
            leaseGuardian?.assertActive();
            if (input.turnId && input.attemptToken) {
              await leaseGuardian?.prepareToCommit();
              const receipt = await saveConversationTurnAssistantMessage({
                spaceId: input.ctx.space.id,
                conversationId: input.conversationId,
                turnId: input.turnId,
                attemptToken: input.attemptToken,
                outcome: terminalOutcome,
                blocks,
              });
              terminalOutcome = {
                status: receipt.terminalStatus,
                reason: receipt.terminalReason,
              };
              pendingTurnCompleteReason = receipt.terminalStatus === 'cancelled'
                ? 'aborted'
                : receipt.terminalStatus === 'paused'
                  ? 'paused'
                  : receipt.terminalStatus === 'completed'
                    ? 'complete'
                    : null;
              atomicallySettled = true;
              leaseGuardian?.commitSucceeded();
              leaseGuardian?.stop();
            } else {
              await saveAssistantMessage({
                spaceId: input.ctx.space.id,
                conversationId: input.conversationId,
                blocks,
              });
            }
            saved = true;
          } catch (err) {
            lastError = err;
            logger.warn('[ai/task ts] save assistant message failed', {
              conversationId: input.conversationId,
            }, err);
          }
          if (!saved) {
            logger.error('[ai/task ts] save assistant message could not be confirmed', {
              conversationId: input.conversationId,
            }, lastError);
            // Surface to the client so the UI can show a non-blocking
            // warning. The reply is on screen; the database doesn't have
            // it. Refreshing now would lose the context.
            const authorityFailure = leaseGuardian?.hasLostAuthority()
              || /lease|attempt token|terminal result/i.test(
                lastError instanceof Error ? lastError.message : String(lastError),
              );
            pushEvent({
              type: 'error',
              message: authorityFailure
                ? 'This turn no longer had authority to publish its reply.'
                : chippiErrorMessage('persistence'),
              code: authorityFailure ? 'internal' : 'persistence',
            });
            pendingTurnCompleteReason = null;
          }
        }
        if (
          pendingTurnCompleteReason
          && terminalOutcome.status !== 'failed'
          && input.onSettled
          && !atomicallySettled
        ) {
          try {
            const settled = await input.onSettled(terminalOutcome);
            terminalOutcome = settledConversationTurnOutcome(settled, terminalOutcome);
            pendingTurnCompleteReason = terminalOutcome.status === 'cancelled'
              ? 'aborted'
              : terminalOutcome.status === 'paused'
                ? 'paused'
                : terminalOutcome.status === 'completed'
                  ? 'complete'
                  : null;
            separatelySettled = true;
          } catch (error) {
            logger.error('[ai/task ts] pre-terminal durable settlement failed', {
              conversationId: input.conversationId,
              turnId: input.turnId,
            }, error);
            terminalOutcome = {
              status: 'failed',
              reason: 'durable_settlement_failed',
              error: error instanceof Error ? error.message : 'Durable turn settlement failed.',
            };
            pendingTurnCompleteReason = null;
            pushEvent({
              type: 'error',
              message: chippiErrorMessage('persistence'),
              code: 'persistence',
            });
          }
        }
        if (pendingTurnCompleteReason && terminalOutcome.status !== 'failed') {
          pushEvent({ type: 'turn_complete', reason: pendingTurnCompleteReason });
        }
        leaseGuardian?.stop();
        if (input.onSettled && !atomicallySettled && !separatelySettled) {
          try {
            await input.onSettled(terminalOutcome);
          } catch (error) {
            logger.error('[ai/task ts] durable turn settlement failed', {
              conversationId: input.conversationId,
              turnId: input.turnId,
            }, error);
          }
        }
        // Presence clears only after transcript persistence and durable
        // settlement have both completed or failed visibly.
        await markTurnEnded(input.conversationId);
        turnDone();
        try {
          controller.close();
        } catch {
          /* already closed by cancel() */
        }
      }
    },
    // Client disconnected (tab/app closed, navigation, Stop). Do NOT abort —
    // the turn keeps running server-side to completion and the finally block
    // above persists it, so the answer (and any tool side effects' record) is
    // in history when the user returns. This matches the Modal proxy path's
    // behaviour in app/api/ai/task. Bounded by the SDK maxTurns, the idle
    // watchdog, and lib/ai-tools/loop-guard, so "keep running" can't become
    // "run forever". pushEvent already swallows enqueue-after-close.
    cancel() {
      /* intentionally no abort */
    },
  });
}

// ── Pause-and-resume persistence ───────────────────────────────────────────

interface PersistPausedInput {
  ctx: ToolContext;
  turnId?: string;
  attachmentManifest?: Array<{ id: string; filename: string; mimeType: string }>;
  conversationId: string;
  state: { toString(): string };
  interruptions: ReadonlyArray<unknown>;
}

/** The only pause-time workbook data retained across approval. Keeping this
 * pure makes the feature-off omission testable without a database write. */
export function pausedRunActiveWorkbookFields(ctx: ToolContext): Record<string, unknown> {
  if (!ctx.activeWorkbook) return {};
  return {
    activeWorkbookContext: {
      artifactId: ctx.activeWorkbook.artifactId,
      versionNumber: ctx.activeWorkbook.versionNumber,
      title: ctx.activeWorkbook.title,
    },
  };
}

/**
 * Insert one AgentPausedRun row carrying the SDK's serialized state plus
 * the realtor-facing approval prompts. Returns the new row id, or null
 * on failure (the route still emits the event keyed by callId so the UI
 * isn't completely silent).
 */
async function persistPausedRun(input: PersistPausedInput): Promise<string | null> {
  try {
    const id = crypto.randomUUID();
    const now = Date.now();
    const expires = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const approvals = extractApprovals(
      {
        interruptions: input.interruptions as Array<{
          rawItem: { callId?: string; id?: string };
          name?: string;
          arguments?: string;
        }>,
      },
      ALL_TOOLS,
    );
    const pausedRun: Record<string, unknown> = {
      id,
      spaceId: input.ctx.space.id,
      userId: input.ctx.userId,
      conversationId: input.conversationId,
      ...(input.turnId ? { turnId: input.turnId } : {}),
      runState: serializeRunState(input.state),
      approvals,
      // The fresh-turn manifest comes from the server's attachment hydration,
      // not tool approval arguments. Resume intersects that durable grant.
      attachmentManifest: input.attachmentManifest?.map(({ id, filename }) => ({ id, filename }))
        ?? input.ctx.attachmentManifest
        ?? (input.ctx.attachmentIds ?? []).map((id) => ({ id, filename: '' })),
      status: 'pending',
      expiresAt: expires,
    };
    // Do not mention the additive column for ordinary/feature-off pauses: old
    // schemas and non-Workbench approvals retain their existing insert shape.
    Object.assign(pausedRun, pausedRunActiveWorkbookFields(input.ctx));
    const { error } = await supabase.from('AgentPausedRun').insert(pausedRun);
    if (error) {
      logger.error('[ai/task ts] persistPausedRun failed', { conversationId: input.conversationId }, error);
      return null;
    }
    return id;
  } catch (err) {
    logger.error('[ai/task ts] persistPausedRun threw', { conversationId: input.conversationId }, err);
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * The agent's reasoning sentence — the last thing the model said before
 * deciding to fire a tool. We keep it short: enough to capture WHY the
 * tool fired without dumping a paragraph into telemetry. Falls back to
 * an empty string when the model went straight from history to tool
 * (which is honest — there was no spoken reason).
 */
function trimReasoning(buffer: string): string {
  const cleaned = buffer.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  // Last sentence-ish chunk. Match from the latest sentence break to end.
  const parts = cleaned.split(/(?<=[.!?])\s+/);
  const last = parts[parts.length - 1] ?? cleaned;
  return last.length > 280 ? last.slice(0, 277) + '…' : last;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function wrapAsResponse(stream: ReadableStream<Uint8Array>, _abort: AbortController): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
