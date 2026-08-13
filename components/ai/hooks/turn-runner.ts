/**
 * TurnRunner — module-scope owner of in-flight chat turns.
 *
 * THE fix for "message Chippi, navigate to another page, and the turn dies."
 * The old wiring put the SSE fetch loop inside the React hook: navigation
 * unmounted the component, every incoming event landed on dead state, and
 * the fresh instance on return had no idea a turn was running — so the
 * answer never appeared even though the server finished and persisted it.
 *
 * The runner lives at MODULE scope (per tab, not per component). It owns the
 * fetch + SSE parse loop, buffers every event in order, and broadcasts to
 * whoever is attached — zero, one, or many surfaces:
 *
 *   - Component mounts mid-turn → `attach()` returns the full replay buffer
 *     (rebuild the transcript exactly) + a live subscription for the rest.
 *   - Component unmounts → detach. The loop keeps consuming. Nothing dies.
 *   - Turn finishes with nobody attached → the record is kept (with a TTL)
 *     so the next mounted surface knows to fetch FRESH history instead of
 *     trusting stale server props that predate the answer.
 *
 * The tab closing is the only client-side death, and the server survives
 * that by contract (stream cancel() never aborts the turn; `after()`
 * keep-alive persists the assistant message — see lib/chat/direct-stream.ts
 * and lib/ai-tools/sdk-chat-stream.ts).
 */

import type { AgentEvent } from '@/lib/ai-tools/events';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { SSEParser } from '@/lib/ai-tools/client/parse-sse';

export type TurnStatus = 'streaming' | 'done' | 'aborted' | 'http_error' | 'network_error';

export interface TurnRecord {
  key: string;
  conversationId: string;
  /** Stable server-side identity for this exact turn. ConversationTurn-backed
   *  realtor turns require it; broker turns use the same identity for an
   *  exact, non-leaking Stop signal. */
  turnId: string;
  /** The task endpoint this turn was posted to — surfaces only adopt turns
   *  from their own endpoint (realtor vs broker). */
  endpoint: string;
  /** Every parsed SSE event, in arrival order. Replayed on attach. */
  events: AgentEvent[];
  status: TurnStatus;
  /** Set when status === 'http_error'. */
  httpError?: { status: number; message?: string; retryAfterSeconds?: number };
  /** Set when status === 'network_error'. */
  networkErrorMessage?: string;
  /** What the user sent — used to rebuild the optimistic bubble on attach. */
  optimistic: { text: string; attachmentBlocks: MessageBlock[] };
  startedAt: number;
  finishedAt?: number;
  /** Resolves when the loop ends, whatever the terminal status. */
  completion: Promise<void>;
}

interface InternalRecord extends TurnRecord {
  controller: AbortController;
  listeners: Set<(e: AgentEvent) => void>;
}

const records = new Map<string, InternalRecord>();

/** Finished records linger so a late-mounting surface can detect "a turn
 *  completed while nothing was watching" and force a fresh history fetch.
 *  Ten minutes is far past any realistic return-to-tab window. */
const FINISHED_TTL_MS = 10 * 60_000;

export function turnKey(endpoint: string, conversationId: string): string {
  return `${endpoint}::${conversationId}`;
}

function sweep(): void {
  const now = Date.now();
  for (const [key, rec] of records) {
    if (rec.status !== 'streaming' && rec.finishedAt && now - rec.finishedAt > FINISHED_TTL_MS) {
      records.delete(key);
    }
  }
}

export function getTurn(key: string): TurnRecord | undefined {
  sweep();
  return records.get(key);
}

/** The live (still-streaming) turn for `endpoint`, if any. Lets the bar on an
 *  unrelated page adopt a background turn it didn't start. */
export function getAnyLiveTurn(endpoint: string): TurnRecord | undefined {
  sweep();
  for (const rec of records.values()) {
    if (rec.status === 'streaming' && rec.endpoint === endpoint) return rec;
  }
  return undefined;
}

/**
 * Atomically snapshot the replay buffer and subscribe for subsequent events.
 * Single synchronous block — an event can never fall between the snapshot
 * and the subscription. Caller applies `replay` first, then receives live
 * events through `onEvent`.
 */
export function attachTurn(
  rec: TurnRecord,
  onEvent: (e: AgentEvent) => void,
): { replay: AgentEvent[]; detach: () => void } {
  const internal = rec as InternalRecord;
  const replay = internal.events.slice();
  internal.listeners.add(onEvent);
  return {
    replay,
    detach: () => {
      internal.listeners.delete(onEvent);
    },
  };
}

/** Abort a turn's fetch (explicit Stop / superseded by a new send). */
export function abortTurn(key: string): void {
  records.get(key)?.controller.abort();
}

/**
 * Remove and return a FINISHED record. A mounted surface calls this when
 * loading history: a returned record means "a turn ended since your server
 * props were rendered — fetch fresh or you'll show a transcript missing the
 * answer." Live records are never consumed.
 */
export function consumeFinishedTurn(key: string): TurnRecord | undefined {
  const rec = records.get(key);
  if (!rec || rec.status === 'streaming') return undefined;
  records.delete(key);
  return rec;
}

/**
 * Start a turn: POST `body` to `url` and consume the SSE response at module
 * scope. Any prior turn on the same key is aborted and replaced (same
 * semantics the hook always had — one turn per conversation).
 *
 * `url` is the POST target (task route, or a resume route for approvals);
 * `endpoint` is the logical surface identity used for keying and adoption —
 * a resume turn keys under the same task endpoint as the turn it continues,
 * so navigation re-attaches to it the same way.
 */
export function startTurn(opts: {
  url: string;
  endpoint: string;
  conversationId: string;
  turnId?: string;
  body: unknown;
  optimistic: { text: string; attachmentBlocks: MessageBlock[] };
}): TurnRecord {
  const key = turnKey(opts.endpoint, opts.conversationId);
  records.get(key)?.controller.abort();

  const controller = new AbortController();
  const rec: InternalRecord = {
    key,
    conversationId: opts.conversationId,
    turnId: opts.turnId ?? `legacy:${opts.conversationId}`,
    endpoint: opts.endpoint,
    events: [],
    status: 'streaming',
    optimistic: opts.optimistic,
    startedAt: Date.now(),
    controller,
    listeners: new Set(),
    completion: Promise.resolve(),
  };

  rec.completion = (async () => {
    try {
      const res = await fetch(opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts.body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let message: string | undefined;
        try {
          const parsed = (await res.json()) as { error?: string };
          if (parsed?.error) message = parsed.error;
        } catch {
          /* non-JSON body */
        }
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '0', 10);
        rec.status = 'http_error';
        rec.httpError = {
          status: res.status,
          ...(message ? { message } : {}),
          ...(retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
        };
        return;
      }
      if (!res.body) {
        rec.status = 'network_error';
        rec.networkErrorMessage = 'Empty response body';
        return;
      }

      const parser = new SSEParser();
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of parser.feed(value)) emit(rec, event);
      }
      for (const event of parser.end()) emit(rec, event);
      rec.status = 'done';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        rec.status = 'aborted';
      } else {
        rec.status = 'network_error';
        rec.networkErrorMessage = err instanceof Error ? err.message : 'Network error';
      }
    } finally {
      rec.finishedAt = Date.now();
    }
  })();

  records.set(key, rec);
  return rec;
}

function emit(rec: InternalRecord, event: AgentEvent): void {
  rec.events.push(event);
  for (const listener of rec.listeners) {
    try {
      listener(event);
    } catch {
      /* one bad listener must not break the loop or other listeners */
    }
  }
}

/** Test-only: reset all module state between test cases. */
export function __resetTurnRunnerForTests(): void {
  for (const rec of records.values()) rec.controller.abort();
  records.clear();
}
