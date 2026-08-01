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
import type { AgentEvent } from '@/lib/ai-tools/events';
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

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: MessageBlock[];
  /** True while the assistant is actively streaming into this message. */
  streaming?: boolean;
}

/**
 * Per-message runtime pick from the composer's Chat/Agent switch.
 *   - 'chat'  → lean single-call path (one LLM completion + read-only vector
 *               search). Fast, cheap, can't act.
 *   - 'agent' → full tool surface on Modal. Can act; bounded server-side.
 * Defaults to 'chat' when the caller omits it.
 */
export type ChatMode = 'chat' | 'agent';

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
  onConversationCreated?: (conversationId: string) => void;
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
}

export interface UseAgentTaskResult {
  messages: UiMessage[];
  setMessages: React.Dispatch<React.SetStateAction<UiMessage[]>>;
  isStreaming: boolean;
  pendingApproval: PermissionPromptData | null;
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
  send: (
    text: string,
    attachmentIds?: string[],
    mode?: ChatMode,
    attachmentsMeta?: AttachmentMeta[],
  ) => Promise<void>;
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
   * Seconds remaining on a rate-limit cool-down (429). Zero when no
   * rate-limit is active. The composer can show a countdown and re-enable
   * itself automatically when this reaches zero.
   */
  rateLimitSeconds: number;
  /**
   * Messages typed while a turn was streaming, waiting to dispatch — one per
   * completed turn, in order (the ChatGPT-Work "queued messages" mechanic).
   */
  queuedMessages: { text: string; mode: ChatMode }[];
  /** Drop a queued message (by index) before it dispatches. */
  removeQueuedMessage: (index: number) => void;
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
  } = options;

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  // Synchronous mirror of isStreaming — send() consults this (not the state)
  // so the queue drain scheduled in consumeStream's finally can't race a
  // stale closure into re-queueing forever.
  const isStreamingRef = useRef(false);
  // Messages typed while a turn is streaming. Dispatched in order, one per
  // completed turn (the ChatGPT-Work "queued messages" mechanic).
  const [queuedMessages, setQueuedMessages] = useState<{ text: string; mode: ChatMode }[]>([]);
  const queuedRef = useRef<{ text: string; mode: ChatMode }[]>([]);
  // Late-bound self-reference so the drain in consumeStream's finally can
  // call the CURRENT send without a circular useCallback dependency.
  const sendRef = useRef<
    ((text: string, attachmentIds?: string[], mode?: ChatMode) => Promise<void>) | null
  >(null);
  const [pendingApproval, setPendingApproval] = useState<PermissionPromptData | null>(null);
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

  function commitAllow(toolName: string) {
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
  }

  // The runner key of the turn THIS hook instance is currently driving.
  // Turns themselves live at module scope (turn-runner.ts) so they survive
  // this component unmounting; the key is how abort() reaches them.
  const activeKeyRef = useRef<string | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  // True once the turn reaches a real terminal event (turn_complete or a
  // landed error). If the SSE stream closes WITHOUT one — the serverless proxy
  // hit its duration cap mid-response, the socket dropped, or Modal was killed
  // — we must not leave the bubble blinking "streaming" forever with no word to
  // the realtor. Reset at the start of every turn.
  const turnTerminalRef = useRef(false);
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
    if (cid) {
      void fetch('/api/ai/stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: cid }),
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
  }, [landChippiError]);

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
      turnTerminalRef.current = false;
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
        // Drain the queue: one message per completed turn, in order. Deferred
        // a tick so this turn's teardown state settles before the next send's
        // optimistic UI lands.
        const next = queuedRef.current[0];
        if (next) {
          queuedRef.current = queuedRef.current.slice(1);
          setQueuedMessages(queuedRef.current);
          setTimeout(() => {
            void sendRef.current?.(next.text, undefined, next.mode);
          }, 0);
        }
      }
    },
    [applyEvent, landChippiError],
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
  const ensureConversationId = useCallback(async (): Promise<string> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const body =
      conversationCreatePayload ?? ({ slug: spaceSlug } as Record<string, unknown>);
    const res = await fetch(conversationsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Could not start conversation');
    const conv = (await res.json()) as { id: string };
    conversationIdRef.current = conv.id;
    onConversationCreated?.(conv.id);
    return conv.id;
  }, [spaceSlug, onConversationCreated, conversationsEndpoint, conversationCreatePayload]);

  const send = useCallback(
    async (
      text: string,
      attachmentIds?: string[],
      mode: ChatMode = 'chat',
      attachmentsMeta?: AttachmentMeta[],
    ) => {
      const trimmed = text.trim();
      const hasAttachments = Array.isArray(attachmentIds) && attachmentIds.length > 0;
      // Allow attachment-only sends — the user might just want to drop in a
      // photo with no caption. Block when both text AND attachments are empty.
      if (!trimmed && !hasAttachments) return;
      // Mid-turn sends QUEUE instead of dropping: the message dispatches in
      // order when the current turn ends (ChatGPT-Work mechanic). Text only —
      // attachment uploads are owned by the composer's lifecycle. Guarded on
      // the ref (not state) so the drain in consumeStream's finally can never
      // race a stale closure back into the queue.
      if (isStreamingRef.current) {
        if (trimmed && !hasAttachments) {
          queuedRef.current = [...queuedRef.current, { text: trimmed, mode }];
          setQueuedMessages(queuedRef.current);
        }
        return;
      }

      // Fix 2: record immediately so retryLastMessage always has current data.
      lastUserInputRef.current = { text: trimmed, ...(hasAttachments ? { attachmentIds } : {}) };

      // Build attachment blocks for the optimistic user bubble so the chips
      // show immediately, and stash any object URLs for instant thumbnails.
      const attachmentBlocks: MessageBlock[] = (attachmentsMeta ?? []).map((a) => ({
        type: 'attachment',
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        isImage: a.isImage,
        ...(typeof a.sizeBytes === 'number' ? { sizeBytes: a.sizeBytes } : {}),
      }));
      if (attachmentsMeta && attachmentsMeta.length > 0) {
        setAttachmentPreviewUrls((prev) => {
          const next = { ...prev };
          for (const a of attachmentsMeta) {
            if (a.previewUrl) next[a.id] = a.previewUrl;
          }
          return next;
        });
      }

      // Optimistic UI: push the user message + a streaming assistant
      // placeholder BEFORE we await conversation creation. This is what
      // flips the workspace from the empty / "Good evening" view into the
      // active thread; previously it waited on the POST /api/ai/conversations
      // round-trip (~200–500ms) and the user perceived a freeze. The thinking
      // indicator shows immediately because `messages` is non-empty.
      const userMsg: UiMessage = {
        id: newId(),
        role: 'user',
        // Attachment chips render above the text, matching the composer.
        blocks: [
          ...attachmentBlocks,
          ...(trimmed ? [{ type: 'text', content: trimmed } as MessageBlock] : []),
        ],
      };
      const assistantMsgId = newId();
      const assistantMsg: UiMessage = {
        id: assistantMsgId,
        role: 'assistant',
        blocks: [],
        streaming: true,
      };
      streamingMsgIdRef.current = assistantMsgId;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setPendingApproval(null);
      // Instant signal — the server's first status event is a network
      // round-trip away; the indicator must not wait for it.
      setCurrentAction('Thinking…');

      let convId: string;
      try {
        convId = await ensureConversationId();
      } catch (err) {
        // Conversation creation failed — pull the optimistic placeholders
        // back so the realtor doesn't see a hung user message + empty
        // assistant bubble. landChippiError surfaces an error message in
        // its place via a fresh assistant entry.
        setMessages((prev) =>
          prev.filter((m) => m.id !== userMsg.id && m.id !== assistantMsgId),
        );
        streamingMsgIdRef.current = null;
        const raw = err instanceof Error ? err.message : '';
        landChippiError(chippiErrorMessage(classifyError(raw)));
        return;
      }

      await consumeStream(
        taskEndpoint,
        {
          spaceSlug,
          conversationId: convId,
          message: trimmed,
          mode,
          ...(hasAttachments ? { attachmentIds } : {}),
        },
        convId,
        { text: trimmed, attachmentBlocks },
      );
    },
    [isStreaming, spaceSlug, ensureConversationId, consumeStream, landChippiError, taskEndpoint],
  );
  // Late-bind for the queue drain (see consumeStream's finally).
  sendRef.current = send;

  /** Drop a queued message before it dispatches (index into queuedMessages). */
  const removeQueuedMessage = useCallback((index: number) => {
    queuedRef.current = queuedRef.current.filter((_, i) => i !== index);
    setQueuedMessages(queuedRef.current);
  }, []);

  const approve = useCallback(
    async (requestId: string, editedArgs?: Record<string, unknown>) => {
      if (isStreaming) return;
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
      );
    },
    [isStreaming, consumeStream, resumeEndpointBase],
  );

  const deny = useCallback(
    async (requestId: string) => {
      if (isStreaming) return;
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
      );
    },
    [isStreaming, pendingApproval, consumeStream, resumeEndpointBase],
  );

  const alwaysAllow = useCallback(
    async (requestId: string, editedArgs?: Record<string, unknown>) => {
      // Capture the tool name from the CURRENT pending prompt at click time —
      // by the time approve() returns the prompt will have been cleared.
      const toolName = pendingApproval?.name;
      if (toolName) commitAllow(toolName);
      await approve(requestId, editedArgs);
    },
    [pendingApproval, approve],
  );

  // Fix 2: stable retry callback — calls send() with whatever was last sent.
  const retryLastMessage = useCallback(async () => {
    const last = lastUserInputRef.current;
    if (!last) return;
    await send(last.text, last.attachmentIds);
  }, [send]);

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
    if (isStreaming) return;
    if (!allowedTools.has(pendingApproval.name)) return;
    if (autoApprovedRef.current === pendingApproval.requestId) return;
    autoApprovedRef.current = pendingApproval.requestId;
    void approve(pendingApproval.requestId);
  }, [pendingApproval, isStreaming, allowedTools, approve]);

  return {
    messages,
    setMessages,
    isStreaming,
    pendingApproval,
    liveCallIds,
    error,
    streamingReasoning,
    currentAction,
    activePlan,
    send,
    attachmentPreviewUrls,
    approve,
    deny,
    alwaysAllow,
    allowedTools,
    abort,
    clearError,
    retryLastMessage,
    rateLimitSeconds,
    queuedMessages,
    removeQueuedMessage,
  };
}
