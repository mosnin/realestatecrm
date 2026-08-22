'use client';

/**
 * `useAgentTask` — the client-side driver for the on-demand agent.
 *
 * Owns the transcript state (a list of messages, each a block sequence),
 * streams events from /api/ai/task and /api/ai/task/approve, and exposes
 * send / approve / deny / abort as stable callbacks. Surrounding UI (the
 * conversation sidebar, @-mention search, voice mode, ...) stays in the
 * ChatInterface; this hook's only job is to run the loop.
 *
 * Stream → state mapping:
 *   - `text_delta`          → append to the trailing text block.
 *   - `tool_call_start`     → push a tool_call block with status=running.
 *   - `tool_call_result`    → update the matching block with result + status.
 *   - `permission_required` → surface the approval card via `pendingApproval`.
 *   - `permission_resolved` → clear `pendingApproval`.
 *   - `turn_complete`       → mark the trailing assistant message as saved.
 *   - `error`               → surface via `error`, end the stream.
 *
 * When the user approves or denies, a SEPARATE fetch hits the approve
 * endpoint; its events append to a fresh assistant message bubble (matching
 * the server, which persists the continuation as its own Message row).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, WorkActivityEvent } from '@/lib/ai-tools/events';
import type { MessageBlock, ToolCallBlock } from '@/lib/ai-tools/blocks';
import type { PermissionPromptData } from '@/components/ai/blocks/permission-prompt-view';
import { chippiErrorMessage, classifyError } from '@/lib/ai-tools/chippi-voice';
import {
  startTurn,
  attachTurn,
  abortTurn,
  getTurn,
  turnKey,
  type TurnRecord,
} from './turn-runner';
import type { WorkExecutionMode } from '@/lib/chat/work-execution-mode';
import type {
  ConversationTurnAttachment,
  ConversationTurnRecord,
} from '@/lib/chat/turn-control';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: MessageBlock[];
  /** True while the assistant is actively streaming into this message. */
  streaming?: boolean;
}

/**
 * Product-facing pick from the top-of-page Chat/Work switch.
 *   - 'chat'  → lean single-call path (one LLM completion + read-only vector
 *               search). Fast, cheap, can't act.
 *   - 'work'  → full tool surface plus durable background work. Can act;
 *               bounded server-side.
 * Defaults to 'chat' when the caller omits it.
 */
export type ChatMode = 'chat' | 'work';

/**
 * Lightweight attachment descriptor the composer passes to `send` so the
 * optimistic user bubble can show the file chips/thumbnails immediately —
 * before the server persists them. `previewUrl` is an object URL for instant
 * image display; it's surfaced via `attachmentPreviewUrls` so the renderer can
 * use it instead of waiting on a signed-URL round-trip.
 */
export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  isImage: boolean;
  sizeBytes?: number;
  previewUrl?: string;
}

export interface UseAgentTaskOptions {
  spaceSlug: string;
  /** Current conversation, or null to have the hook create one on first send. */
  conversationId: string | null;
  /**
   * Called when the hook creates a new conversation (first message of a
   * fresh chat). Parent uses this to update the sidebar + keep future
   * sends scoped to the same conversation.
   */
  onConversationCreated?: (conversationId: string, mode: ChatMode) => void;
  /**
   * Called when a turn this hook was DRIVING reaches its terminal state, with
   * the conversation it belonged to. The surface uses this to record that its
   * in-memory transcript already contains that turn's answer, so the history
   * loader doesn't treat the runner's finished-turn tombstone as "a turn
   * completed while you weren't looking" and blank + re-fetch the thread it
   * just streamed. Fires for successful, errored, and stopped turns alike —
   * in every case the transcript on screen is the freshest thing we have.
   */
  onTurnSettled?: (conversationId: string) => void;
  /**
   * Backing API endpoints. Defaults route to the realtor surface; the
   * broker variant (`/broker/chippi`) overrides both to hit the broker-
   * gated routes (`resolveBrokerContext()` gates layer 2 of the
   * defense-in-depth chain).
   *
   * - `taskEndpoint`          — POST target for a chat turn.
   * - `conversationsEndpoint` — POST creates a new conversation; the body
   *                             shape differs per variant (realtor sends
   *                             `{ slug }`; broker sends nothing because
   *                             the broker route resolves brokerage from
   *                             the Clerk session).
   * - `resumeEndpoint`        — POST target for approve / deny resume.
   *                             Phase 1 doesn't ship broker approvals so
   *                             the broker variant inherits the realtor
   *                             default; Phase 3 will introduce a parallel.
   * - `conversationCreatePayload` — overrides the POST body for create.
   */
  taskEndpoint?: string;
  conversationsEndpoint?: string;
  resumeEndpointBase?: string;
  conversationCreatePayload?: Record<string, unknown>;
  /** Receives typed rich tool results that drive workspace-level UI state. */
  onToolResult?: (input: { name: string; data: unknown; ok: boolean }) => void;
  /**
   * Narrow lifecycle signal for workspace surfaces that must open while a
   * long-running tool is still active. It carries no tool arguments and does
   * not create a generic tool-event rendering channel.
   */
  onToolStart?: (input: { name: string }) => void;
  /** A Workbench the user has actively opened. The server re-resolves it in
   * the caller's tenant before putting any workbook state in the tool context. */
  activeWorkbookArtifactId?: string | null;
  /** Persisted execution posture for Work conversations. */
  workExecutionMode?: WorkExecutionMode;
  /** Current product mode; used to prevent legacy per-tool auto-allow from bypassing Review. */
  conversationMode?: ChatMode;
}

export interface UseAgentTaskResult {
  messages: UiMessage[];
  setMessages: React.Dispatch<React.SetStateAction<UiMessage[]>>;
  isStreaming: boolean;
  pendingApproval: PermissionPromptData | null;
  /** True while an inline specialist approval POST is in flight. */
  approvalBusy: boolean;
  liveCallIds: Set<string>;
  error: string | null;
  /** Accumulated reasoning tokens for the current streaming turn. Empty string when not streaming. */
  streamingReasoning: string;
  /**
   * The live action line for the thinking indicator ("Reading your
   * workspace…", "Running Find contacts…"). Driven by server `status` events
   * and tool_call_start/result; cleared on the first text_delta of the turn
   * and on every terminal event. Null when there's nothing to say.
   */
  currentAction: string | null;
  /**
   * The plan emitted by the most recent `create_plan` tool call during the
   * current streaming turn. Null when not streaming or when no plan has been
   * created yet. Cleared automatically on `turn_complete`.
   */
  activePlan: { task: string; steps: Array<{ title: string; description: string }> } | null;
  /** Grounded runtime receipts for the live Work turn. */
  workActivities: WorkActivityEvent[];
  send: (
    text: string,
    attachmentIds?: string[],
    mode?: ChatMode,
    attachmentsMeta?: AttachmentMeta[],
  ) => Promise<boolean>;
  /**
   * Object URLs for just-sent attachments, keyed by attachment id. Lets the
   * user-message renderer show an image thumbnail instantly while the signed
   * URL is still being minted. Cleared as conversations change.
   */
  attachmentPreviewUrls: Record<string, string>;
  approve: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
  deny: (requestId: string) => Promise<void>;
  /**
   * Phase 4c — approve this call AND auto-approve any future call to the
   * same tool in this conversation. Scoped to sessionStorage so a refresh
   * preserves the decision but a new browser session resets it.
   */
  alwaysAllow: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
  /** Set of tool names currently auto-approved for this conversation. */
  allowedTools: Set<string>;
  /** Tear down an in-flight stream. Safe to call when nothing is running. */
  abort: () => void;
  clearError: () => void;
  /**
   * Re-sends the last user message. Safe to call after an error — the ref
   * is populated on every `send()` call so the composer doesn't need to
   * hold onto the text itself.
   */
  retryLastMessage: () => Promise<void>;
  /**
   * Put a new instruction ahead of ordinary queued messages and ask the
   * active server turn to stop at its next safe boundary. The instruction is
   * dispatched only after that turn has actually settled, so a late stop
   * signal cannot bleed into the replacement turn.
   */
  steer: (text: string, mode?: ChatMode) => Promise<boolean>;
  /**
   * Seconds remaining on a rate-limit cool-down (429). Zero when no
   * rate-limit is active. The composer can show a countdown and re-enable
   * itself automatically when this reaches zero.
   */
  rateLimitSeconds: number;
  /**
   * Messages typed while a turn was streaming, waiting to dispatch — one per
   * completed turn, in order (the ChatGPT-Work "queued messages" mechanic).
   */
  queuedMessages: PendingTurnMessage[];
  /** Drop a queued message by its stable database id before it dispatches. */
  removeQueuedMessage: (turnId: string) => Promise<void>;
}

export interface PendingTurnMessage {
  id: string;
  clientRequestId: string;
  text: string;
  mode: ChatMode;
  kind: 'queued' | 'steer';
  status: 'pending' | 'failed';
  attachmentIds: string[];
  attachments: ConversationTurnAttachment[];
}

/** Keep steering instructions FIFO, but ahead of ordinary queued turns. */
export function insertSteeringMessage(
  pending: readonly PendingTurnMessage[],
  next: PendingTurnMessage,
): PendingTurnMessage[] {
  const firstQueued = pending.findIndex((message) => message.kind === 'queued');
  const index = firstQueued === -1 ? pending.length : firstQueued;
  return [...pending.slice(0, index), next, ...pending.slice(index)];
}

function queuedMessagesFromTurns(
  turns: readonly ConversationTurnRecord[],
): PendingTurnMessage[] {
  return turns
    .filter((turn) => turn.status === 'pending' || turn.status === 'failed')
    .slice()
    .sort((a, b) => b.priority - a.priority || a.enqueueSeq - b.enqueueSeq)
    .map((turn) => ({
      id: turn.id,
      clientRequestId: turn.clientRequestId,
      text: turn.message,
      mode: turn.mode,
      kind: turn.source === 'steer' ? 'steer' : 'queued',
      status: turn.status as 'pending' | 'failed',
      attachmentIds: turn.attachmentIds ?? [],
      attachments: turn.attachments ?? [],
    }));
}

function nextDispatchableQueuedTurn(
  turns: readonly ConversationTurnRecord[],
): ConversationTurnRecord | null {
  if (turns.some((turn) => turn.status === 'running' || turn.status === 'paused' || turn.status === 'failed')) {
    return null;
  }
  return turns
    .filter((turn) => turn.status === 'pending')
    .slice()
    .sort((a, b) => b.priority - a.priority || a.enqueueSeq - b.enqueueSeq)[0] ?? null;
}

/** Short random id for UI-local message keys. */
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

/**
 * Turn a snake_case tool name into a thinking-indicator action line:
 * "find_contacts" → "Running Find Contacts". delegate_task gets bespoke copy
 * since it kicks off a longer background job.
 */
function friendlyToolAction(name: string): string {
  if (name === 'delegate_task') return 'Starting a background task';
  const words = name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `Running ${words}`;
}

export function useAgentTask(options: UseAgentTaskOptions): UseAgentTaskResult {
  const {
    spaceSlug,
    conversationId: initialConversationId,
    onConversationCreated,
    onTurnSettled,
    taskEndpoint = '/api/ai/task',
    conversationsEndpoint = '/api/ai/conversations',
    resumeEndpointBase = '/api/ai/task/resume',
    conversationCreatePayload,
    onToolResult,
    onToolStart,
    activeWorkbookArtifactId,
    workExecutionMode = 'autonomous',
    conversationMode = 'chat',
  } = options;

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  // Synchronous mirror of isStreaming — send() consults this (not the state)
  // so the queue drain scheduled in consumeStream's finally can't race a
  // stale closure into re-queueing forever.
  const isStreamingRef = useRef(false);
  // Messages typed while a turn is streaming. Dispatched in order, one per
  // completed turn (the ChatGPT-Work "queued messages" mechanic).
  const [queuedMessages, setQueuedMessages] = useState<PendingTurnMessage[]>([]);
  const queuedRef = useRef<PendingTurnMessage[]>([]);
  const durableTurnQueueEnabled = taskEndpoint === '/api/ai/task';
  // Exact identity of the currently running/approval-paused turn. Stop and
  // Steer must target this id rather than a conversation-wide flag that can
  // accidentally bleed into the next instruction.
  const activeTurnIdRef = useRef<string | null>(null);
  const unacceptedSubmissionRef = useRef<{
    fingerprint: string;
    turnId: string;
    clientRequestId: string;
  } | null>(null);
  const lastAcceptedTurnRef = useRef<{
    turn: ConversationTurnRecord;
    attachmentsMeta?: AttachmentMeta[];
  } | null>(null);
  const queueDrainInFlightRef = useRef<Promise<void> | null>(null);
  const refreshDurableQueueRef = useRef<((conversationId: string) => Promise<ConversationTurnRecord[]>) | null>(null);
  // Late-bound callbacks close the runTurn -> drain -> dispatch cycle without
  // making React recreate the stream driver on every queue refresh.
  const drainDurableQueueRef = useRef<((conversationId: string) => Promise<void>) | null>(null);
  const dispatchQueuedTurnRef = useRef<((turn: ConversationTurnRecord) => Promise<void>) | null>(null);
  const sendRef = useRef<
    ((text: string, attachmentIds?: string[], mode?: ChatMode, attachmentsMeta?: AttachmentMeta[]) => Promise<boolean>) | null
  >(null);
  const [pendingApproval, setPendingApproval] = useState<PermissionPromptData | null>(null);
  const pendingApprovalRef = useRef<PermissionPromptData | null>(null);
  pendingApprovalRef.current = pendingApproval;
  const [liveCallIds, setLiveCallIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [allowedTools, setAllowedTools] = useState<Set<string>>(new Set());
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  // Object URLs for just-sent attachments → instant image thumbnails in the
  // optimistic user bubble. Keyed by attachment id.
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Record<string, string>>({});
  const [activePlan, setActivePlan] = useState<{
    task: string;
    steps: Array<{ title: string; description: string }>;
  } | null>(null);
  const [workActivities, setWorkActivities] = useState<WorkActivityEvent[]>([]);

  // Refs shadow the reactive state for places where we need the latest value
  // synchronously without re-closing over it every render. We only sync
  // the ref from props when the prop actually changes — otherwise the
  // `ensureConversationId` path would see its own write overwritten on the
  // very next render while the parent is still holding the old value.
  const conversationIdRef = useRef(initialConversationId);
  useEffect(() => {
    conversationIdRef.current = initialConversationId;
  }, [initialConversationId]);

  // Held in a ref so a parent passing an inline closure doesn't re-create
  // runTurn → consumeStream → send on every render.
  const onTurnSettledRef = useRef(onTurnSettled);
  useEffect(() => {
    onTurnSettledRef.current = onTurnSettled;
  }, [onTurnSettled]);

  // ── Phase 4c: always-allow for this chat ──────────────────────────────────
  // Auto-approvals are keyed by BOTH surface endpoint and conversationId so
  // switching chats or moving between realtor/broker surfaces resets the list.
  // This matters for migrated legacy rows where the broker and realtor tables
  // can temporarily share a conversation id while storage is being backfilled.
  // sessionStorage (not localStorage) matches the "for this chat" semantics:
  // a fresh tab / new session forgets what you trusted before.
  const STORAGE_PREFIX = `agent-allow:${taskEndpoint}:`;
  const allowedToolsRef = useRef<Set<string>>(new Set());
  // Dedup guard for the auto-approve effect (declared up here so the
  // conversation-change effect below can reset it when switching chats).
  const autoApprovedRef = useRef<string | null>(null);
  useEffect(() => {
    allowedToolsRef.current = allowedTools;
  }, [allowedTools]);

  // Load the saved allow-list when the conversation changes. The dependency
  // is only the id — we deliberately don't rebind this effect when the
  // user adds a new tool (that's handled by `commitAllow` below writing
  // directly to storage).
  //
  // Also clears the transient approval + auto-approve tracking so
  // switching conversations mid-prompt doesn't bleed a prompt or an
  // already-fired requestId into the new chat.
  useEffect(() => {
    setPendingApproval(null);
    setWorkActivities([]);
    autoApprovedRef.current = null;
    // Drop stale optimistic preview URLs — the new conversation's history
    // signs its own URLs per image.
    setAttachmentPreviewUrls({});
    if (typeof window === 'undefined') return;
    if (!initialConversationId) {
      setAllowedTools(new Set());
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(STORAGE_PREFIX + initialConversationId);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          setAllowedTools(new Set(parsed.filter((x) => typeof x === 'string')));
          return;
        }
      }
    } catch {
      /* corrupt JSON / access denied — fall through to empty */
    }
    setAllowedTools(new Set());
  }, [initialConversationId, STORAGE_PREFIX]);

  const commitAllow = useCallback((toolName: string) => {
    const next = new Set(allowedToolsRef.current);
    next.add(toolName);
    allowedToolsRef.current = next;
    setAllowedTools(next);
    const cid = conversationIdRef.current;
    if (cid && typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(STORAGE_PREFIX + cid, JSON.stringify(Array.from(next)));
      } catch {
        /* quota / private mode — in-memory allow-list still works */
      }
    }
  }, [STORAGE_PREFIX]);

  // The runner key of the turn THIS hook instance is currently driving.
  // Turns themselves live at module scope (turn-runner.ts) so they survive
  // this component unmounting; the key is how abort() reaches them.
  const activeKeyRef = useRef<string | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  const toolNameByCallIdRef = useRef<Map<string, string>>(new Map());
  // True once the turn reaches a real terminal event (turn_complete or a
  // landed error). If the SSE stream closes WITHOUT one — the serverless proxy
  // hit its duration cap mid-response, the socket dropped, or Modal was killed
  // — we must not leave the bubble blinking "streaming" forever with no word to
  // the realtor. Reset at the start of every turn.
  const turnTerminalRef = useRef(false);
  const turnOutcomeRef = useRef<'complete' | 'paused' | 'cancelled' | 'failed' | null>(null);
  // Wall-clock when the assistant turn started. Set on the first event of
  // the turn; used to derive ReasoningBlock.durationMs at turn_complete.
  const turnStartedAtRef = useRef<number | null>(null);
  // Buffer for the current turn's reasoning. Mirrors `streamingReasoning`
  // state but read synchronously inside the turn_complete handler — the
  // setter is async and would lose data on the same tick.
  const reasoningBufferRef = useRef<string>('');
  // Fix 2: remember the last user input so the UI can offer a one-tap retry.
  const lastUserInputRef = useRef<{ text: string; attachmentIds?: string[] } | null>(null);
  // Fix 3: store the Retry-After value so the countdown effect can read it
  // without closing over stale state inside consumeStream.
  const rateLimitSecondsRef = useRef(0);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Land a Chippi-voiced error line as an assistant message in the transcript.
   * If we already have an open assistant bubble (the streaming target), we
   * drop its empty content and replace it with the error text so the error
   * looks like Chippi talking, not like a system warning under a phantom
   * empty bubble.
   *
   * Also writes the same string into the `error` state so any banner-style
   * consumer still has something to render — but the visible affordance is
   * the inline assistant message.
   */
  const landChippiError = useCallback((message: string) => {
    turnTerminalRef.current = true;
    turnOutcomeRef.current = 'failed';
    setError(message);
    setCurrentAction(null);
    const targetId = streamingMsgIdRef.current;
    const errorBlock: MessageBlock = { type: 'text', content: message };
    setMessages((prev) => {
      if (targetId) {
        const idx = prev.findIndex((m) => m.id === targetId);
        if (idx !== -1) {
          const target = prev[idx];
          if (target.role === 'assistant') {
            const next = [...prev];
            // Fix 1: if the bubble already has partial content from the
            // stream, preserve it and append the error notice below it so
            // the user sees what arrived before the crash.  Only replace
            // when the bubble was still empty (no content streamed yet).
            const existingBlocks = target.blocks;
            next[idx] = {
              ...target,
              blocks:
                existingBlocks.length > 0
                  ? [...existingBlocks, errorBlock]
                  : [errorBlock],
              streaming: false,
            };
            return next;
          }
        }
      }
      // No live assistant bubble — append a fresh one.
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      return [
        ...prev,
        {
          id,
          role: 'assistant',
          blocks: [errorBlock],
          streaming: false,
        },
      ];
    });
  }, []);

  /**
   * Drop whatever stream this hook is currently driving, CLIENT-SIDE ONLY.
   *
   * Deliberately does not signal the server. Starting a turn supersedes any
   * previous one locally, but telling the server to stop generating on this
   * conversation while we're opening a new turn on it is self-sabotage: the
   * stop flag has a 10-minute TTL and is consumed by whichever stream polls
   * next, which is the turn we're about to start. That race is why messages
   * sometimes came back with no answer at all.
   */
  const abortLocal = useCallback(() => {
    if (activeKeyRef.current) {
      abortTurn(activeKeyRef.current);
      activeKeyRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    // Tell the SERVER to stop generating. Since the disconnect-survival
    // work, dropping the fetch alone doesn't end the turn (a closed tab
    // must not kill it) — without this signal, Stop only stopped the
    // rendering while the turn kept generating, spending, and persisting.
    // keepalive lets the request survive a quick navigation; best-effort.
    // ONLY the user-facing Stop reaches this; see abortLocal above.
    const cid = conversationIdRef.current;
    const turnId = activeTurnIdRef.current;
    if (cid && turnId) {
      void fetch('/api/ai/stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: cid, turnId }),
        keepalive: true,
      }).catch(() => {});
    }
    abortLocal();
    setCurrentAction(null);
  }, [abortLocal]);

  /**
   * Apply one AgentEvent to the transcript state. The targeted assistant
   * message is the one whose id matches `streamingMsgIdRef.current` — that
   * ref is set when we start a new assistant turn and cleared on close.
   */
  const applyEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case 'text_delta': {
        if (!event.delta) return;
        // Real text is on screen — the action line's job is done.
        setCurrentAction(null);
        const targetId = streamingMsgIdRef.current;
        if (!targetId) return;
        setMessages((prev) => {
          // Defense-in-depth: if the target bubble is gone (some external
          // setter wiped messages while a stream was open), recreate a
          // tail assistant bubble at the new id instead of silently
          // no-op'ing every delta. The previous behavior turned every
          // mid-stream wipe into a totally invisible failure for the
          // realtor.
          if (!prev.some((m) => m.id === targetId)) {
            const recovered: UiMessage = {
              id: targetId,
              role: 'assistant',
              blocks: [{ type: 'text', content: event.delta }],
              streaming: true,
            };
            return [...prev, recovered];
          }
          return prev.map((m) => {
            if (m.id !== targetId) return m;
            const last = m.blocks[m.blocks.length - 1];
            if (last?.type === 'text') {
              const updated = [...m.blocks];
              updated[updated.length - 1] = { ...last, content: last.content + event.delta };
              return { ...m, blocks: updated };
            }
            return { ...m, blocks: [...m.blocks, { type: 'text', content: event.delta }] };
          });
        });
        return;
      }

      case 'tool_call_start': {
        toolNameByCallIdRef.current.set(event.callId, event.name);
        onToolStart?.({ name: event.name });
        const targetId = streamingMsgIdRef.current;
        if (!targetId) return;
        setCurrentAction(`${friendlyToolAction(event.name)}…`);
        // delegate_task is represented by its own live task card (mounted on
        // the subagent_spawned event), not a generic tool row — skip the
        // tool_call block so the realtor sees one clean card, not both.
        if (event.name === 'delegate_task') return;
        setLiveCallIds((s) => {
          const next = new Set(s);
          next.add(event.callId);
          return next;
        });
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== targetId) return m;
            const block: ToolCallBlock = {
              type: 'tool_call',
              callId: event.callId,
              name: event.name,
              args: event.args,
              status: 'complete', // placeholder; overridden by `live` prop during streaming
              display: event.display,
            };
            return { ...m, blocks: [...m.blocks, block] };
          }),
        );
        return;
      }

      case 'tool_call_result': {
        const toolName = toolNameByCallIdRef.current.get(event.callId);
        toolNameByCallIdRef.current.delete(event.callId);
        if (toolName && event.data !== undefined) onToolResult?.({ name: toolName, data: event.data, ok: event.ok });
        setLiveCallIds((s) => {
          if (!s.has(event.callId)) return s;
          const next = new Set(s);
          next.delete(event.callId);
          return next;
        });
        // The tool finished; the model is reading its result. Next
        // text_delta (or the next tool_call_start label) replaces this.
        setCurrentAction('Thinking…');
        setMessages((prev) =>
          prev.map((m) => ({
            ...m,
            blocks: m.blocks.map((b) => {
              if (b.type !== 'tool_call' || b.callId !== event.callId) return b;
              return {
                ...b,
                status: event.ok ? 'complete' : 'error',
                // The in-process runtime only knows a tool's `display` once the
                // handler ran, so it rides the result event (not just start).
                // Prefer it; fall back to whatever start carried.
                display: event.display ?? b.display,
                result: {
                  ok: event.ok,
                  summary: event.summary,
                  data: event.data,
                  error: event.error,
                },
              };
            }),
          })),
        );
        return;
      }

      case 'permission_required': {
        // Always surface the prompt. A hidden tab used to drop the event
        // entirely, which left the chat turn stuck mid-stream with no card
        // and no resolution when the realtor came back. pendingApproval is
        // just state — the inline card renders when the tab is next visible.
        setPendingApproval({
          requestId: event.requestId,
          callId: event.callId,
          name: event.name,
          args: event.args,
          summary: event.summary,
          otherPendingCalls: event.otherPendingCalls,
          inline: event.inline,
        });
        return;
      }

      case 'permission_resolved': {
        // Clear the prompt only if it still matches this requestId — a later
        // event for a different pending call shouldn't nuke a fresh prompt.
        setPendingApproval((prev) => (prev && prev.requestId === event.requestId ? null : prev));
        return;
      }

      case 'reasoning_delta': {
        if (!event.delta) return;
        if (turnStartedAtRef.current === null) turnStartedAtRef.current = Date.now();
        reasoningBufferRef.current += event.delta;
        setStreamingReasoning((prev) => prev + event.delta);
        return;
      }

      case 'plan_created': {
        setActivePlan({ task: event.task, steps: event.steps });
        return;
      }

      case 'work_activity': {
        setWorkActivities((previous) => {
          const sameWork = previous.length === 0 || previous[0]?.workId === event.workId;
          const base = sameWork ? previous : [];
          const correlation =
            event.toolCallId ?? event.subagentRunId ?? `${event.phase}:${event.status}`;
          const index = base.findIndex((candidate) => {
            const candidateCorrelation =
              candidate.toolCallId ??
              candidate.subagentRunId ??
              `${candidate.phase}:${candidate.status}`;
            return candidateCorrelation === correlation;
          });
          const next = [...base];
          if (index >= 0) next[index] = event;
          else next.push(event);
          return next.slice(-24);
        });
        return;
      }

      case 'subagent_spawned': {
        // A delegate_task call started a Modal sub-agent run. Drop a
        // subagent_task block into the streaming assistant turn; its view
        // subscribes to /api/swarm/{runId}/stream and renders live progress.
        const targetId = streamingMsgIdRef.current;
        if (!targetId) return;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== targetId) return m;
            // Idempotent — never mount two cards for the same run.
            if (m.blocks.some((b) => b.type === 'subagent_task' && b.runId === event.runId)) {
              return m;
            }
            const block: MessageBlock = {
              type: 'subagent_task',
              callId: event.callId,
              runId: event.runId,
              goal: event.goal,
            };
            return { ...m, blocks: [...m.blocks, block] };
          }),
        );
        return;
      }

      case 'turn_complete': {
        turnTerminalRef.current = true;
        turnOutcomeRef.current = event.reason === 'paused'
          ? 'paused'
          : event.reason === 'aborted'
            ? 'cancelled'
            : 'complete';
        const targetId = streamingMsgIdRef.current;
        // Snapshot + reset the reasoning buffer + start time before any
        // async setState — we need both values inside the updater closure.
        const reasoning = reasoningBufferRef.current;
        const startedAt = turnStartedAtRef.current;
        reasoningBufferRef.current = '';
        turnStartedAtRef.current = null;
        if (targetId) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== targetId) return m;
              // Persist the reasoning trace as the first block of the
              // assistant turn so reload reproduces the "Thought for Xs"
              // disclosure. Only if reasoning was actually produced.
              const trimmed = reasoning.trim();
              if (!trimmed) return { ...m, streaming: false };
              const durationMs = startedAt ? Date.now() - startedAt : undefined;
              const reasoningBlock: MessageBlock = {
                type: 'reasoning',
                content: trimmed,
                durationMs,
              };
              const existing = m.blocks ?? [];
              // Place the reasoning block first — Claude / o1 pattern.
              return {
                ...m,
                blocks: [reasoningBlock, ...existing],
                streaming: false,
              };
            }),
          );
        }
        setStreamingReasoning('');
        setActivePlan(null);
        setCurrentAction(null);
        return;
      }

      case 'status': {
        // Renders in the thinking indicator; the next text_delta clears it.
        setCurrentAction(event.label || null);
        return;
      }

      case 'error': {
        // Server hands us a Chippi-voiced line in `message`; if it didn't
        // (older server, raw fallback), pick one from the code.
        const text =
          event.message && event.message.length < 400
            ? event.message
            : chippiErrorMessage(event.code ?? 'internal');
        landChippiError(text);
        setCurrentAction(null);
        return;
      }
    }
  }, [landChippiError, onToolResult, onToolStart]);

  /**
   * Drive one turn owned by the module-scope TurnRunner: replay whatever
   * events already arrived (empty for a fresh send, the full buffer on
   * re-attach after navigation), mirror live events into state, and when
   * the runner's loop ends run the terminal handling the old inline loop
   * used to (HTTP errors, cut-off detection, teardown, queue drain).
   *
   * The fetch itself does NOT live here — it lives in turn-runner.ts and
   * keeps consuming when this component unmounts. That is the whole
   * "turns survive navigation" fix.
   */
  const runTurn = useCallback(
    async (rec: TurnRecord) => {
      activeKeyRef.current = rec.key;
      activeTurnIdRef.current = rec.turnId;
      turnTerminalRef.current = false;
      turnOutcomeRef.current = null;
      setIsStreaming(true);
      isStreamingRef.current = true;
      setError(null);

      const { replay, detach } = attachTurn(rec, applyEvent);
      try {
        for (const event of replay) applyEvent(event);
        await rec.completion;

        if (rec.status === 'http_error') {
          const he = rec.httpError;
          // Fix 3: on 429 read Retry-After so the composer can count down.
          if (he?.status === 429 && he.retryAfterSeconds) {
            rateLimitSecondsRef.current = he.retryAfterSeconds;
            setRateLimitSeconds(he.retryAfterSeconds);
          }
          // Server already speaks Chippi for this route; if not, classify
          // by HTTP status as a fallback so the user never sees raw text.
          let message = he?.message;
          if (!message || message.length > 400) {
            const code =
              he?.status === 429
                ? 'rate_limited'
                : he?.status === 401 || he?.status === 403
                  ? 'auth'
                  : 'internal';
            message = chippiErrorMessage(code);
          }
          landChippiError(message);
          return;
        }

        if (rec.status === 'network_error') {
          landChippiError(
            chippiErrorMessage(classifyError(rec.networkErrorMessage ?? 'Network error')),
          );
          return;
        }

        if (rec.status === 'aborted') {
          // Explicit Stop: tidy the trailing empty assistant bubble.
          const targetId = streamingMsgIdRef.current;
          if (targetId) {
            setMessages((prev) =>
              prev
                .filter(
                  (m) => !(m.id === targetId && m.role === 'assistant' && m.blocks.length === 0),
                )
                .map((m) => (m.id === targetId ? { ...m, streaming: false } : m)),
            );
          }
          return;
        }

        // The stream closed cleanly (no throw) but never delivered a
        // turn_complete or error — the turn was cut off mid-response (proxy
        // duration cap, dropped socket, Modal killed). Without this the bubble
        // keeps blinking "streaming" forever and the realtor waits on output
        // that will never arrive. Land the truth: stop the bubble and say so.
        if (!turnTerminalRef.current) {
          const targetId = streamingMsgIdRef.current;
          if (targetId) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== targetId) return m;
                const cutOff: MessageBlock = {
                  type: 'text',
                  content:
                    (m.blocks.length > 0 ? '\n\n' : '') +
                    'The response was cut off before it finished. Tap retry to pick it back up.',
                };
                return { ...m, streaming: false, blocks: [...m.blocks, cutOff] };
              }),
            );
          }
          setError('The response was cut off before it finished.');
        }
      } finally {
        detach();
        // The finished record is deliberately LEFT in the runner: it's the
        // tombstone the workspace's history loader consumes to know "a turn
        // ended since your server props rendered — fetch fresh." Consuming
        // it here would let a stale props branch clobber the streamed
        // answer right after the turn lands. TTL-swept if nobody consumes.
        activeKeyRef.current = null;
        // Nothing is streaming into this bubble any more. Every terminal
        // path above already clears the flag; doing it once here covers the
        // ones that can't (a record that ended without a target message) so
        // a bubble can never be left permanently marked live.
        const settledMsgId = streamingMsgIdRef.current;
        if (settledMsgId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === settledMsgId && m.streaming ? { ...m, streaming: false } : m)),
          );
        }
        streamingMsgIdRef.current = null;
        setIsStreaming(false);
        isStreamingRef.current = false;
        setLiveCallIds(new Set());
        setStreamingReasoning('');
        // Reset the reasoning buffer + turn start here too, not only in
        // turn_complete: after a Stop or a stream that drops without a terminal
        // frame, these would otherwise carry the prior turn's trace and a bogus
        // "Thought for Xs" duration into the next answer.
        reasoningBufferRef.current = '';
        turnStartedAtRef.current = null;
        // Tell the surface its transcript now contains this turn's outcome —
        // synchronously, BEFORE React commits the isStreaming flip that wakes
        // the history loader, so the loader sees the flag already set and
        // doesn't blank the thread it just watched stream in.
        onTurnSettledRef.current?.(rec.conversationId);
        if (durableTurnQueueEnabled && (
          turnOutcomeRef.current === 'complete' || turnOutcomeRef.current === 'cancelled'
        )) {
          // PostgreSQL — not this component — decides whether a paused/failed
          // turn holds the queue and which pending instruction is next.
          await drainDurableQueueRef.current?.(rec.conversationId);
        } else if (durableTurnQueueEnabled) {
          // A network/HTTP failure can occur before the server claims the row;
          // redispatching here would create a tight billing/rate-limit loop.
          // Refresh the durable state for honest UI, but require user retry or
          // the recovery rail to decide what happens next.
          await refreshDurableQueueRef.current?.(rec.conversationId).catch(() => {});
        } else {
          // Broker chat has not migrated to ConversationTurn yet. Keep its
          // bounded per-tab FIFO behavior, but still use exact per-turn Stop.
          if (activeTurnIdRef.current === rec.turnId) activeTurnIdRef.current = null;
          const next = queuedRef.current[0];
          if (next) {
            queuedRef.current = queuedRef.current.slice(1);
            setQueuedMessages(queuedRef.current);
            const meta = next.attachments.map((attachment) => ({
              ...attachment,
              isImage: attachment.isImage ?? attachment.mimeType.startsWith('image/'),
            }));
            setTimeout(() => {
              void sendRef.current?.(next.text, next.attachmentIds, next.mode, meta);
            }, 0);
          }
        }
      }
    },
    [applyEvent, durableTurnQueueEnabled, landChippiError],
  );

  /**
   * Start a fresh turn and drive it. `conversationId` keys the turn in the
   * module-scope runner; `optimistic` is what the runner remembers so a
   * surface mounting mid-turn can rebuild the user bubble.
   */
  const consumeStream = useCallback(
    async (
      url: string,
      body: unknown,
      conversationId: string,
      turnId: string,
      optimistic: { text: string; attachmentBlocks: MessageBlock[] } = {
        text: '',
        attachmentBlocks: [],
      },
    ) => {
      // Local teardown only — see abortLocal. Signalling the server here
      // would stop the very turn this call is starting.
      abortLocal();
      const rec = startTurn({
        url,
        // Keyed under the surface's task endpoint (not the POST url) so a
        // resume turn re-attaches exactly like the turn it continues.
        endpoint: taskEndpoint,
        conversationId,
        turnId,
        body,
        optimistic,
      });
      await runTurn(rec);
    },
    [abortLocal, runTurn, taskEndpoint],
  );

  /**
   * Re-attach after navigation: if the module-scope runner holds a LIVE turn
   * for this conversation (started here or on any other page), rebuild the
   * optimistic scaffold send() originally created — user bubble + streaming
   * assistant placeholder — replay the buffered events, and keep streaming.
   * This is what makes a turn visibly "run in the background": leave the
   * page, come back (or open the bar anywhere), and the turn is right there,
   * still typing.
   */
  useEffect(() => {
    const cid = initialConversationId;
    if (!cid) return;
    if (isStreamingRef.current) return; // already driving a turn
    const rec = getTurn(turnKey(taskEndpoint, cid));
    if (!rec || rec.status !== 'streaming') return;
    if (activeKeyRef.current === rec.key) return; // strict-mode double fire

    const userBlocks: MessageBlock[] = [
      ...rec.optimistic.attachmentBlocks,
      ...(rec.optimistic.text
        ? [{ type: 'text', content: rec.optimistic.text } as MessageBlock]
        : []),
    ];
    const assistantMsgId = newId();
    streamingMsgIdRef.current = assistantMsgId;
    setMessages((prev) => [
      ...prev,
      ...(userBlocks.length > 0
        ? [{ id: newId(), role: 'user', blocks: userBlocks } as UiMessage]
        : []),
      { id: assistantMsgId, role: 'assistant', blocks: [], streaming: true },
    ]);
    setCurrentAction('Thinking…');
    void runTurn(rec);
  }, [initialConversationId, taskEndpoint, runTurn]);

  /**
   * Ensure we have a conversationId before opening a stream. The task route
   * will create one for us if we don't pass one, but we have no way to read
   * the new id back from the SSE stream — so we create it client-side first.
   *
   * `conversationsEndpoint` and `conversationCreatePayload` are configurable
   * so the broker variant can target /api/ai/broker-conversations (gated by
   * resolveBrokerContext) without a custom hook. Defaults preserve the
   * realtor behaviour: POST /api/ai/conversations { slug }.
   */
  const ensureConversationId = useCallback(async (mode: ChatMode): Promise<string> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const body = {
      ...(conversationCreatePayload ?? ({ slug: spaceSlug } as Record<string, unknown>)),
      mode,
      executionMode: workExecutionMode,
    };
    const res = await fetch(conversationsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Could not start conversation');
    const conv = (await res.json()) as { id: string };
    conversationIdRef.current = conv.id;
    onConversationCreated?.(conv.id, mode);
    return conv.id;
  }, [spaceSlug, onConversationCreated, conversationsEndpoint, conversationCreatePayload, workExecutionMode]);

  const loadDurableTurns = useCallback(async (conversationId: string) => {
    if (!durableTurnQueueEnabled) return [] as ConversationTurnRecord[];
    const response = await fetch(
      `/api/ai/turns?conversationId=${encodeURIComponent(conversationId)}`,
      { cache: 'no-store' },
    );
    if (!response.ok) throw new Error('Could not load queued work.');
    const payload = (await response.json()) as { turns?: ConversationTurnRecord[] };
    const turns = Array.isArray(payload.turns) ? payload.turns : [];
    const visible = queuedMessagesFromTurns(turns);
    queuedRef.current = visible;
    setQueuedMessages(visible);
    const active = turns.find((turn) => turn.status === 'running' || turn.status === 'paused');
    activeTurnIdRef.current = active?.id ?? null;
    return turns;
  }, [durableTurnQueueEnabled]);
  refreshDurableQueueRef.current = loadDurableTurns;

  const beginAcceptedTurn = useCallback((input: {
    turnId: string;
    clientRequestId?: string;
    conversationId: string;
    text: string;
    mode: ChatMode;
    attachmentIds?: string[];
    attachmentsMeta?: AttachmentMeta[];
  }) => {
    const attachmentBlocks: MessageBlock[] = (input.attachmentsMeta ?? []).map((attachment) => ({
      type: 'attachment',
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      isImage: attachment.isImage,
      ...(typeof attachment.sizeBytes === 'number' ? { sizeBytes: attachment.sizeBytes } : {}),
    }));
    if (input.attachmentsMeta?.length) {
      setAttachmentPreviewUrls((previous) => {
        const next = { ...previous };
        for (const attachment of input.attachmentsMeta ?? []) {
          if (attachment.previewUrl) next[attachment.id] = attachment.previewUrl;
        }
        return next;
      });
    }

    const userMsg: UiMessage = {
      id: newId(),
      role: 'user',
      blocks: [
        ...attachmentBlocks,
        ...(input.text ? [{ type: 'text', content: input.text } as MessageBlock] : []),
      ],
    };
    const assistantMsgId = newId();
    streamingMsgIdRef.current = assistantMsgId;
    activeTurnIdRef.current = input.turnId;
    setMessages((previous) => [
      ...previous,
      userMsg,
      { id: assistantMsgId, role: 'assistant', blocks: [], streaming: true },
    ]);
    setPendingApproval(null);
    setWorkActivities([]);
    setCurrentAction('Thinking…');
    lastUserInputRef.current = {
      text: input.text,
      ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}),
    };

    void consumeStream(
      taskEndpoint,
      {
        spaceSlug,
        conversationId: input.conversationId,
        message: input.text,
        mode: input.mode,
        executionMode: workExecutionMode,
        ...(input.clientRequestId
          ? { turnId: input.turnId, clientRequestId: input.clientRequestId }
          : { turnId: input.turnId }),
        ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}),
        ...(activeWorkbookArtifactId ? { activeWorkbookArtifactId } : {}),
      },
      input.conversationId,
      input.turnId,
      { text: input.text, attachmentBlocks },
    );
  }, [activeWorkbookArtifactId, consumeStream, spaceSlug, taskEndpoint, workExecutionMode]);

  const dispatchQueuedTurn = useCallback(async (turn: ConversationTurnRecord) => {
    if (isStreamingRef.current) return;
    const meta: AttachmentMeta[] = (turn.attachments ?? []).map((attachment) => ({
      ...attachment,
      isImage: attachment.isImage ?? attachment.mimeType.startsWith('image/'),
    }));
    beginAcceptedTurn({
      turnId: turn.id,
      clientRequestId: turn.clientRequestId,
      conversationId: turn.conversationId,
      text: turn.message,
      mode: turn.mode,
      attachmentIds: turn.attachmentIds,
      attachmentsMeta: meta,
    });
  }, [beginAcceptedTurn]);
  dispatchQueuedTurnRef.current = dispatchQueuedTurn;

  const drainDurableQueue = useCallback(async (conversationId: string) => {
    if (!durableTurnQueueEnabled) return;
    if (queueDrainInFlightRef.current) return queueDrainInFlightRef.current;
    const drain = (async () => {
      const turns = await loadDurableTurns(conversationId);
      const next = nextDispatchableQueuedTurn(turns);
      if (next && !isStreamingRef.current) {
        await dispatchQueuedTurnRef.current?.(next);
      }
    })().catch((queueError) => {
      const message = queueError instanceof Error ? queueError.message : 'Could not continue queued work.';
      setError(message);
    }).finally(() => {
      if (queueDrainInFlightRef.current === drain) queueDrainInFlightRef.current = null;
    });
    queueDrainInFlightRef.current = drain;
    return drain;
  }, [durableTurnQueueEnabled, loadDurableTurns]);
  drainDurableQueueRef.current = drainDurableQueue;

  useEffect(() => {
    if (!durableTurnQueueEnabled || !initialConversationId) {
      if (durableTurnQueueEnabled) {
        queuedRef.current = [];
        setQueuedMessages([]);
        activeTurnIdRef.current = null;
      }
      return;
    }
    let cancelled = false;
    void loadDurableTurns(initialConversationId)
      .then((turns) => {
        if (cancelled || isStreamingRef.current) return;
        const next = nextDispatchableQueuedTurn(turns);
        if (next) void dispatchQueuedTurnRef.current?.(next);
      })
      .catch(() => {
        if (!cancelled) setError('Could not restore queued work.');
      });
    return () => { cancelled = true; };
  }, [durableTurnQueueEnabled, initialConversationId, loadDurableTurns]);

  const send = useCallback(
    async (
      text: string,
      attachmentIds?: string[],
      mode: ChatMode = 'chat',
      attachmentsMeta?: AttachmentMeta[],
    ): Promise<boolean> => {
      const trimmed = text.trim();
      const hasAttachments = Boolean(attachmentIds?.length);
      if (!trimmed && !hasAttachments) return false;

      let convId: string;
      try {
        convId = await ensureConversationId(mode);
      } catch (conversationError) {
        const raw = conversationError instanceof Error ? conversationError.message : '';
        landChippiError(chippiErrorMessage(classifyError(raw)));
        return false;
      }

      if (durableTurnQueueEnabled) {
        const manifest: ConversationTurnAttachment[] = (attachmentsMeta ?? []).map((attachment) => ({
          id: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          isImage: attachment.isImage,
          ...(typeof attachment.sizeBytes === 'number' ? { sizeBytes: attachment.sizeBytes } : {}),
        }));
        const fingerprint = JSON.stringify({ convId, mode, trimmed, attachmentIds: attachmentIds ?? [], manifest });
        const priorSubmission = unacceptedSubmissionRef.current;
        const turnId = priorSubmission?.fingerprint === fingerprint ? priorSubmission.turnId : newId();
        const clientRequestId = priorSubmission?.fingerprint === fingerprint
          ? priorSubmission.clientRequestId
          : newId();
        unacceptedSubmissionRef.current = { fingerprint, turnId, clientRequestId };
        try {
          const response = await fetch('/api/ai/turns', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              conversationId: convId,
              turnId,
              clientRequestId,
              mode,
              source: 'typed',
              message: trimmed,
              attachmentIds: attachmentIds ?? [],
              attachments: manifest,
            }),
          });
          const payload = (await response.json().catch(() => ({}))) as {
            turn?: ConversationTurnRecord;
            error?: string;
          };
          if (!response.ok || !payload.turn) {
            throw new Error(payload.error || 'Could not queue this message.');
          }
          const accepted = payload.turn;
          unacceptedSubmissionRef.current = null;
          lastAcceptedTurnRef.current = { turn: accepted, attachmentsMeta };
          if (isStreamingRef.current || activeTurnIdRef.current || pendingApprovalRef.current) {
            await loadDurableTurns(convId);
          } else {
            beginAcceptedTurn({
              turnId: accepted.id,
              clientRequestId: accepted.clientRequestId,
              conversationId: convId,
              text: accepted.message,
              mode: accepted.mode,
              attachmentIds: accepted.attachmentIds,
              attachmentsMeta,
            });
          }
          return true;
        } catch (queueError) {
          setError(queueError instanceof Error ? queueError.message : 'Could not queue this message.');
          return false;
        }
      }

      // Broker compatibility queue. It remains per-tab until the separate
      // BrokerConversation schema receives its own durable ledger.
      if (isStreamingRef.current || pendingApprovalRef.current) {
        const localTurn: PendingTurnMessage = {
          id: newId(),
          clientRequestId: newId(),
          text: trimmed,
          mode,
          kind: 'queued',
          status: 'pending',
          attachmentIds: attachmentIds ?? [],
          attachments: (attachmentsMeta ?? []).map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            isImage: attachment.isImage,
            sizeBytes: attachment.sizeBytes,
          })),
        };
        queuedRef.current = [...queuedRef.current, localTurn];
        setQueuedMessages(queuedRef.current);
        return true;
      }

      beginAcceptedTurn({
        turnId: newId(),
        conversationId: convId,
        text: trimmed,
        mode,
        attachmentIds,
        attachmentsMeta,
      });
      return true;
    },
    [beginAcceptedTurn, durableTurnQueueEnabled, ensureConversationId, landChippiError, loadDurableTurns],
  );
  sendRef.current = send;

  const steer = useCallback(async (text: string, mode: ChatMode = 'work'): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!isStreamingRef.current && !activeTurnIdRef.current) {
      return (await sendRef.current?.(trimmed, undefined, mode)) ?? false;
    }

    const conversationId = conversationIdRef.current;
    const activeTurnId = activeTurnIdRef.current;
    if (!durableTurnQueueEnabled || !conversationId || !activeTurnId) {
      if (durableTurnQueueEnabled) return false;
      const local: PendingTurnMessage = {
        id: newId(),
        clientRequestId: newId(),
        text: trimmed,
        mode,
        kind: 'steer',
        status: 'pending',
        attachmentIds: [],
        attachments: [],
      };
      queuedRef.current = insertSteeringMessage(queuedRef.current, local);
      setQueuedMessages(queuedRef.current);
      return true;
    }

    const fingerprint = JSON.stringify({ conversationId, mode, trimmed, source: 'steer', activeTurnId });
    const priorSubmission = unacceptedSubmissionRef.current;
    const turnId = priorSubmission?.fingerprint === fingerprint ? priorSubmission.turnId : newId();
    const clientRequestId = priorSubmission?.fingerprint === fingerprint
      ? priorSubmission.clientRequestId
      : newId();
    unacceptedSubmissionRef.current = { fingerprint, turnId, clientRequestId };
    const response = await fetch('/api/ai/turns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        turnId,
        clientRequestId,
        mode,
        source: 'steer',
        message: trimmed,
        activeTurnId,
      }),
      keepalive: true,
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error || 'Could not steer the active work.');
      return false;
    }
    unacceptedSubmissionRef.current = null;
    await loadDurableTurns(conversationId);
    return true;
  }, [durableTurnQueueEnabled, loadDurableTurns]);

  const removeQueuedMessage = useCallback(async (turnId: string) => {
    if (!durableTurnQueueEnabled) {
      queuedRef.current = queuedRef.current.filter((turn) => turn.id !== turnId);
      setQueuedMessages(queuedRef.current);
      return;
    }
    const response = await fetch(`/api/ai/turns/${encodeURIComponent(turnId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setError('That queued message could not be removed.');
      return;
    }
    const conversationId = conversationIdRef.current;
    if (conversationId) await loadDurableTurns(conversationId);
  }, [durableTurnQueueEnabled, loadDurableTurns]);

  const submitInlineDecision = useCallback(
    async (requestId: string, body: Record<string, unknown>) => {
      setApprovalBusy(true);
      try {
        const response = await fetch(`${resumeEndpointBase}/${encodeURIComponent(requestId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          setError('That approval could not be recorded. Try again.');
        }
      } catch {
        setError('That approval could not be recorded. Try again.');
      } finally {
        setApprovalBusy(false);
      }
    },
    [resumeEndpointBase],
  );

  const approve = useCallback(
    async (requestId: string, editedArgs?: Record<string, unknown>) => {
      if (isStreamingRef.current) {
        await submitInlineDecision(requestId, {
          approved: true,
          ...(editedArgs ? { editedArgs } : {}),
        });
        return;
      }
      // Start a new assistant bubble for the continuation. Matches the
      // server's persistence model (it saves a second Message row).
      const contId = newId();
      const contMsg: UiMessage = {
        id: contId,
        role: 'assistant',
        blocks: [],
        streaming: true,
      };
      streamingMsgIdRef.current = contId;
      setMessages((prev) => [...prev, contMsg]);

      await consumeStream(
        `${resumeEndpointBase}/${encodeURIComponent(requestId)}`,
        {
          approved: true,
          ...(editedArgs ? { editedArgs } : {}),
        },
        conversationIdRef.current ?? `resume-${requestId}`,
        activeTurnIdRef.current ?? `legacy-resume:${requestId}`,
      );
    },
    [consumeStream, resumeEndpointBase, submitInlineDecision],
  );

  const deny = useCallback(
    async (requestId: string) => {
      if (isStreamingRef.current) {
        await submitInlineDecision(requestId, { approved: false });
        return;
      }
      // Snapshot the prompt before the stream's `permission_resolved` event
      // clears it — we use the snapshot to pre-populate PermissionBlocks
      // on the continuation bubble so the denial is visible immediately,
      // matching what the server persists for this turn.
      //
      // The snapshot includes otherPendingCalls (forwarded from the
      // server's permission_required event): a deny cascades to every
      // mutating call in the batch, so we show a block per cascaded call
      // too — not only the one the user clicked on.
      const snapshot = pendingApproval;
      const contId = newId();
      const initialBlocks: MessageBlock[] = [];
      if (snapshot) {
        initialBlocks.push({
          type: 'permission',
          callId: snapshot.callId,
          name: snapshot.name,
          args: snapshot.args,
          summary: snapshot.summary,
          decision: 'denied',
        });
        for (const other of snapshot.otherPendingCalls ?? []) {
          initialBlocks.push({
            type: 'permission',
            callId: other.callId,
            name: other.name,
            args: other.args,
            summary: other.summary,
            decision: 'denied',
          });
        }
      }
      const contMsg: UiMessage = {
        id: contId,
        role: 'assistant',
        blocks: initialBlocks,
        streaming: true,
      };
      streamingMsgIdRef.current = contId;
      setMessages((prev) => [...prev, contMsg]);

      await consumeStream(
        `${resumeEndpointBase}/${encodeURIComponent(requestId)}`,
        { approved: false },
        conversationIdRef.current ?? `resume-${requestId}`,
        activeTurnIdRef.current ?? `legacy-resume:${requestId}`,
      );
    },
    [pendingApproval, consumeStream, resumeEndpointBase, submitInlineDecision],
  );

  const alwaysAllow = useCallback(
    async (requestId: string, editedArgs?: Record<string, unknown>) => {
      // Capture the tool name from the CURRENT pending prompt at click time —
      // by the time approve() returns the prompt will have been cleared.
      const toolName = pendingApproval?.name;
      // Exact workbook transforms are intentionally one-time approvals: their
      // source version, hash, and every target are what the user reviewed.
      if (toolName === 'apply_workbook_transformation') {
        await approve(requestId);
        return;
      }
      if (toolName) commitAllow(toolName);
      await approve(requestId, editedArgs);
    },
    [pendingApproval, approve, commitAllow],
  );

  // Fix 2: stable retry callback — calls send() with whatever was last sent.
  const retryLastMessage = useCallback(async () => {
    if (durableTurnQueueEnabled) {
      const accepted = lastAcceptedTurnRef.current;
      const conversationId = conversationIdRef.current;
      if (accepted && conversationId) {
        try {
          const turns = await loadDurableTurns(conversationId);
          const sameTurn = turns.find((turn) => turn.id === accepted.turn.id);
          if (sameTurn?.status === 'pending' && !isStreamingRef.current) {
            beginAcceptedTurn({
              turnId: sameTurn.id,
              clientRequestId: sameTurn.clientRequestId,
              conversationId: sameTurn.conversationId,
              text: sameTurn.message,
              mode: sameTurn.mode,
              attachmentIds: sameTurn.attachmentIds,
              attachmentsMeta: accepted.attachmentsMeta,
            });
            return;
          }
          if (sameTurn?.status === 'failed') {
            setError('This turn failed and is holding the queue. Remove it before retrying the instruction.');
            return;
          }
        } catch {
          setError('Chippi could not verify the saved turn yet. Try again in a moment.');
          return;
        }
      }
    }
    const last = lastUserInputRef.current;
    if (!last) return;
    await send(last.text, last.attachmentIds);
  }, [beginAcceptedTurn, durableTurnQueueEnabled, loadDurableTurns, send]);

  // Fix 3: count down rateLimitSeconds to zero, then auto-unlock the composer.
  useEffect(() => {
    if (rateLimitSeconds <= 0) return;
    const id = setTimeout(() => {
      setRateLimitSeconds((s) => {
        const next = s - 1;
        rateLimitSecondsRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearTimeout(id);
  }, [rateLimitSeconds]);

  // Auto-approve whenever we're paused on a tool the user has pre-trusted
  // for this chat. Runs after the initial turn's stream closes — that's the
  // moment `pendingApproval` flips to a value AND `isStreaming` goes false.
  // The autoApprovedRef guard (declared above) stops React 18's strict-mode
  // double-invocation from firing two approve requests for the same
  // requestId (setIsStreaming isn't visible yet on the synchronous second
  // pass) and also lets the conversation-change effect clear it.
  useEffect(() => {
    if (!pendingApproval) {
      autoApprovedRef.current = null;
      return;
    }
    if (conversationMode === 'work') return;
    if (isStreaming && !pendingApproval.inline) return;
    if (pendingApproval.name === 'apply_workbook_transformation') return;
    if (!allowedTools.has(pendingApproval.name)) return;
    if (autoApprovedRef.current === pendingApproval.requestId) return;
    autoApprovedRef.current = pendingApproval.requestId;
    void approve(pendingApproval.requestId);
  }, [pendingApproval, isStreaming, allowedTools, approve, conversationMode]);

  return {
    messages,
    setMessages,
    isStreaming,
    pendingApproval,
    approvalBusy,
    liveCallIds,
    error,
    streamingReasoning,
    currentAction,
    activePlan,
    workActivities,
    send,
    attachmentPreviewUrls,
    approve,
    deny,
    alwaysAllow,
    allowedTools,
    abort,
    clearError,
    retryLastMessage,
    steer,
    rateLimitSeconds,
    queuedMessages,
    removeQueuedMessage,
  };
}
