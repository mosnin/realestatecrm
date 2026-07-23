/**
 * TurnRunner behavioral tests — the module-scope turn owner that makes chat
 * turns survive navigation (components/ai/hooks/turn-runner.ts).
 *
 * The load-bearing contract: a turn keeps consuming with ZERO surfaces
 * attached, buffers every event, and a surface attaching later gets the
 * full replay plus live delivery. This is what the old hook-owned fetch
 * loop could not do — unmount meant every event landed on dead state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startTurn,
  attachTurn,
  abortTurn,
  getTurn,
  getAnyLiveTurn,
  consumeFinishedTurn,
  turnKey,
  __resetTurnRunnerForTests,
} from '@/components/ai/hooks/turn-runner';
import type { AgentEvent } from '@/lib/ai-tools/events';

let seq = 0;
function sseFrame(event: Record<string, unknown>): Uint8Array {
  // decodeEvent (lib/ai-tools/events.ts) requires a numeric seq on every
  // frame — the server always stamps one; mirror that here.
  return new TextEncoder().encode(`data: ${JSON.stringify({ seq: seq++, ...event })}\n\n`);
}

/** A fetch stub whose SSE body is fed frame-by-frame from the test. Mirrors
 *  real fetch abort semantics: an abort mid-body-read makes reader.read()
 *  reject with AbortError (that's what the runner's catch classifies on). */
function controllableFetch(status = 200, headers: Record<string, string> = {}) {
  let push!: (e: Record<string, unknown>) => void;
  let close!: () => void;
  let errorBody!: (err: unknown) => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      push = (e) => {
        if (open) controller.enqueue(sseFrame(e));
      };
      close = () => {
        if (open) {
          open = false;
          controller.close();
        }
      };
      errorBody = (err) => {
        if (open) {
          open = false;
          controller.error(err);
        }
      };
    },
  });
  const res = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    body: status >= 200 && status < 300 ? body : null,
    json: async () => ({ error: 'nope' }),
  };
  const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    const signal = init?.signal;
    const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      // Abort after the response resolved → the body read rejects, exactly
      // like a live fetch whose connection is torn down mid-stream.
      signal?.addEventListener('abort', () => {
        errorBody(abortError());
        reject(abortError());
      });
      resolve(res);
    });
  });
  return { fetchMock, push: (e: Record<string, unknown>) => push(e), close: () => close() };
}

const OPTIMISTIC = { text: 'compare my listings', attachmentBlocks: [] };

beforeEach(() => {
  __resetTurnRunnerForTests();
});
afterEach(() => {
  __resetTurnRunnerForTests();
  vi.unstubAllGlobals();
});

describe('TurnRunner — survives with nobody attached', () => {
  it('buffers events with zero listeners; a late attach replays everything then streams live', async () => {
    const { fetchMock, push, close } = controllableFetch();
    vi.stubGlobal('fetch', fetchMock);

    const rec = startTurn({
      url: '/api/ai/task',
      endpoint: '/api/ai/task',
      conversationId: 'c1',
      body: { message: 'hi' },
      optimistic: OPTIMISTIC,
    });

    // Events arrive while NO surface is attached (user navigated away).
    await Promise.resolve();
    push({ type: 'status', label: 'Thinking…' });
    push({ type: 'text_delta', delta: 'Push ' });
    await new Promise((r) => setTimeout(r, 10));
    expect(rec.events.length).toBe(2);
    expect(rec.status).toBe('streaming');

    // A surface mounts mid-turn: atomic replay + live subscription.
    const seen: AgentEvent[] = [];
    const { replay, detach } = attachTurn(rec, (e) => seen.push(e));
    expect(replay.map((e) => (e as { type: string }).type)).toEqual(['status', 'text_delta']);

    push({ type: 'text_delta', delta: 'Oakwood.' });
    push({ type: 'turn_complete', reason: 'complete' });
    close();
    await rec.completion;

    expect(seen.map((e) => (e as { type: string }).type)).toEqual([
      'text_delta',
      'turn_complete',
    ]);
    expect(rec.status).toBe('done');
    expect(rec.optimistic.text).toBe('compare my listings');
    detach();
  });

  it('a detached listener stops receiving but the loop keeps consuming to completion', async () => {
    const { fetchMock, push, close } = controllableFetch();
    vi.stubGlobal('fetch', fetchMock);

    const rec = startTurn({
      url: '/api/ai/task',
      endpoint: '/api/ai/task',
      conversationId: 'c1',
      body: {},
      optimistic: OPTIMISTIC,
    });
    await Promise.resolve();

    const seen: AgentEvent[] = [];
    const { detach } = attachTurn(rec, (e) => seen.push(e));
    push({ type: 'text_delta', delta: 'a' });
    await new Promise((r) => setTimeout(r, 10));
    detach(); // "the component unmounted"

    push({ type: 'text_delta', delta: 'b' });
    push({ type: 'turn_complete', reason: 'complete' });
    close();
    await rec.completion;

    expect(seen.length).toBe(1); // nothing after detach
    expect(rec.events.length).toBe(3); // but the runner got everything
    expect(rec.status).toBe('done');
  });
});

describe('TurnRunner — lookup, adoption, and the finished tombstone', () => {
  it('getAnyLiveTurn finds a streaming turn by endpoint; finished turns are not adoptable', async () => {
    const { fetchMock, push, close } = controllableFetch();
    vi.stubGlobal('fetch', fetchMock);

    const rec = startTurn({
      url: '/api/ai/task',
      endpoint: '/api/ai/task',
      conversationId: 'c9',
      body: {},
      optimistic: OPTIMISTIC,
    });
    await Promise.resolve();
    expect(getAnyLiveTurn('/api/ai/task')?.conversationId).toBe('c9');
    expect(getAnyLiveTurn('/api/ai/broker-task')).toBeUndefined();

    push({ type: 'turn_complete', reason: 'complete' });
    close();
    await rec.completion;
    expect(getAnyLiveTurn('/api/ai/task')).toBeUndefined();
  });

  it('consumeFinishedTurn returns a finished record once (the stale-props guard) and never a live one', async () => {
    const { fetchMock, close } = controllableFetch();
    vi.stubGlobal('fetch', fetchMock);

    const key = turnKey('/api/ai/task', 'c2');
    const rec = startTurn({
      url: '/api/ai/task',
      endpoint: '/api/ai/task',
      conversationId: 'c2',
      body: {},
      optimistic: OPTIMISTIC,
    });
    await Promise.resolve();

    // Live: must not be consumable — the transcript is still streaming.
    expect(consumeFinishedTurn(key)).toBeUndefined();
    expect(getTurn(key)?.status).toBe('streaming');

    close();
    await rec.completion;

    // Finished: consumed exactly once, then gone.
    expect(consumeFinishedTurn(key)?.status).toBe('done');
    expect(consumeFinishedTurn(key)).toBeUndefined();
    expect(getTurn(key)).toBeUndefined();
  });
});

describe('TurnRunner — terminal states', () => {
  it('abortTurn ends the turn with status aborted', async () => {
    const { fetchMock } = controllableFetch();
    vi.stubGlobal('fetch', fetchMock);

    const key = turnKey('/api/ai/task', 'c3');
    const rec = startTurn({
      url: '/api/ai/task',
      endpoint: '/api/ai/task',
      conversationId: 'c3',
      body: {},
      optimistic: OPTIMISTIC,
    });
    abortTurn(key);
    await rec.completion;
    expect(rec.status).toBe('aborted');
  });

  it('captures HTTP errors with the server message and Retry-After', async () => {
    const { fetchMock } = controllableFetch(429, { 'Retry-After': '17' });
    vi.stubGlobal('fetch', fetchMock);

    const rec = startTurn({
      url: '/api/ai/task',
      endpoint: '/api/ai/task',
      conversationId: 'c4',
      body: {},
      optimistic: OPTIMISTIC,
    });
    await rec.completion;
    expect(rec.status).toBe('http_error');
    expect(rec.httpError).toEqual({ status: 429, message: 'nope', retryAfterSeconds: 17 });
  });

  it('starting a new turn on the same conversation aborts and replaces the old one', async () => {
    const { fetchMock } = controllableFetch();
    vi.stubGlobal('fetch', fetchMock);

    const first = startTurn({
      url: '/api/ai/task',
      endpoint: '/api/ai/task',
      conversationId: 'c5',
      body: { message: 'one' },
      optimistic: OPTIMISTIC,
    });
    const second = startTurn({
      url: '/api/ai/task',
      endpoint: '/api/ai/task',
      conversationId: 'c5',
      body: { message: 'two' },
      optimistic: OPTIMISTIC,
    });
    await first.completion;
    expect(first.status).toBe('aborted');
    expect(getTurn(turnKey('/api/ai/task', 'c5'))).toBe(second);
  });
});
