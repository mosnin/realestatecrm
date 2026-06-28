/**
 * Unit tests for `fireRoutineRun` dispatch reliability (Fix #5).
 *
 * The Modal autonomous-run dispatch is fire-and-forget: the endpoint only
 * returns once the whole run finishes, so a client timeout is the NORMAL case
 * (the run is in flight), while a non-2xx or a non-timeout network error is a
 * GENUINE dispatch failure (the run never started — safe to retry).
 *
 * These assert the three outcomes precisely:
 *   (a) 2xx               → ledger in_flight, return 'ok', single POST.
 *   (b) non-2xx           → retried up to 3x, then ledger failed, return 'error'.
 *   (c) timeout (Abort)   → ledger in_flight, return 'ok', and NOT retried.
 *   (d) network error     → retried, then failed (the run never landed).
 *
 * The run-ledger helper is mocked so we observe the lifecycle transitions
 * without a DB; fetch is a routed spy. ROUTINE_DISPATCH_BACKOFF_MS=0 keeps the
 * retry path instant.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── run-ledger mock ───────────────────────────────────────────────────────────
const { recordDispatchMock, markInFlightMock, markFailedMock } = vi.hoisted(() => ({
  recordDispatchMock: vi.fn<(spaceId: string, trigger: string, runId?: string) => Promise<string>>(),
  markInFlightMock: vi.fn<(runId: string) => Promise<void>>(),
  markFailedMock: vi.fn<(runId: string, reason: string) => Promise<void>>(),
}));

vi.mock('@/lib/agent/run-ledger', () => ({
  recordDispatch: recordDispatchMock,
  markInFlight: markInFlightMock,
  markFailed: markFailedMock,
}));

// ── in-process runner mock ────────────────────────────────────────────────────
// The Modal-free fallback (fireInProcessRun) calls this when Modal env is
// missing. Mocked so these tests stay focused on dispatch wiring, not the agent.
const { runAutonomousInstructionMock } = vi.hoisted(() => ({
  runAutonomousInstructionMock: vi.fn<
    (input: { spaceId: string; instruction: string }) => Promise<{ ok: boolean; ran: boolean; error?: string }>
  >(),
}));

vi.mock('@/lib/agent/run-instruction', () => ({
  runAutonomousInstruction: runAutonomousInstructionMock,
}));

import { fireRoutineRun } from '@/lib/routines';

// ── Fetch mock ────────────────────────────────────────────────────────────────
type Responder = () => Promise<Response> | Response;
let modalResponder: Responder;
let modalCallCount = 0;

function buildFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (process.env.MODAL_WEBHOOK_URL && url === process.env.MODAL_WEBHOOK_URL) {
      modalCallCount++;
      // Honor the AbortSignal so an AbortError surfaces like the real timeout.
      const signal = init?.signal;
      if (signal?.aborted) throw abortError();
      return modalResponder();
    }
    return new Response('unmocked', { status: 599 });
  });
}

function abortError(): Error {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

const ENV_KEYS = ['MODAL_WEBHOOK_URL', 'AGENT_INTERNAL_SECRET', 'ROUTINE_DISPATCH_BACKOFF_MS'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.MODAL_WEBHOOK_URL = 'https://modal.example/webhook';
  process.env.AGENT_INTERNAL_SECRET = 'agent-secret';
  process.env.ROUTINE_DISPATCH_BACKOFF_MS = '0'; // instant retries

  modalCallCount = 0;
  modalResponder = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  recordDispatchMock.mockResolvedValue('run-test-id');
  markInFlightMock.mockResolvedValue(undefined);
  markFailedMock.mockResolvedValue(undefined);
  runAutonomousInstructionMock.mockResolvedValue({ ok: true, ran: true });

  vi.stubGlobal('fetch', buildFetchMock());
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

describe('fireRoutineRun — dispatch reliability', () => {
  it('records a dispatch row up front and forwards the runId to Modal', async () => {
    const fetchSpy = global.fetch as unknown as ReturnType<typeof buildFetchMock>;
    const status = await fireRoutineRun('space_1', 'do the thing');
    expect(status).toBe('ok');
    expect(recordDispatchMock).toHaveBeenCalledWith('space_1', 'routine');
    // run_id from recordDispatch is in the POST body.
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.run_id).toBe('run-test-id');
    expect(body).toMatchObject({ space_id: 'space_1', instruction: 'do the thing' });
  });

  it('2xx → ledger in_flight, returns ok, single POST (no retry)', async () => {
    const status = await fireRoutineRun('space_1', 'instr');
    expect(status).toBe('ok');
    expect(markInFlightMock).toHaveBeenCalledWith('run-test-id');
    expect(markFailedMock).not.toHaveBeenCalled();
    expect(modalCallCount).toBe(1);
  });

  it('non-2xx → retries up to 3 attempts, then ledger failed, returns error', async () => {
    modalResponder = () => new Response('nope', { status: 503 });
    const status = await fireRoutineRun('space_1', 'instr');
    expect(status).toBe('error');
    // Three attempts were made (the run never started, so retry is safe).
    expect(modalCallCount).toBe(3);
    expect(markInFlightMock).not.toHaveBeenCalled();
    expect(markFailedMock).toHaveBeenCalledTimes(1);
    expect(markFailedMock.mock.calls[0][0]).toBe('run-test-id');
    expect(markFailedMock.mock.calls[0][1]).toContain('503');
  });

  it('non-2xx that recovers on a later attempt → in_flight, ok', async () => {
    let n = 0;
    modalResponder = () => {
      n++;
      return n < 2
        ? new Response('first fails', { status: 500 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const status = await fireRoutineRun('space_1', 'instr');
    expect(status).toBe('ok');
    expect(modalCallCount).toBe(2);
    expect(markInFlightMock).toHaveBeenCalledWith('run-test-id');
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  it('timeout (AbortError) → ledger in_flight, returns ok, and does NOT retry', async () => {
    // The run is presumed live on a timeout — retrying would double-run.
    modalResponder = () => {
      throw abortError();
    };
    const status = await fireRoutineRun('space_1', 'instr');
    expect(status).toBe('ok');
    expect(markInFlightMock).toHaveBeenCalledWith('run-test-id');
    expect(markFailedMock).not.toHaveBeenCalled();
    // Critical: only ONE POST — a timed-out run must never be retried.
    expect(modalCallCount).toBe(1);
  });

  it('non-timeout network error → retried, then ledger failed (run never landed)', async () => {
    modalResponder = () => {
      throw new Error('ECONNRESET');
    };
    const status = await fireRoutineRun('space_1', 'instr');
    expect(status).toBe('error');
    expect(modalCallCount).toBe(3);
    expect(markFailedMock).toHaveBeenCalledTimes(1);
    expect(markFailedMock.mock.calls[0][1]).toContain('ECONNRESET');
  });

  it('missing Modal env → runs in-process, ledger in_flight, returns ok', async () => {
    // Modal-free fallback: no POST is made; the instruction runs in-process and
    // the ledger records the run honestly.
    delete process.env.MODAL_WEBHOOK_URL;
    const status = await fireRoutineRun('space_1', 'instr');
    expect(status).toBe('ok');
    expect(modalCallCount).toBe(0);
    expect(runAutonomousInstructionMock).toHaveBeenCalledWith({
      spaceId: 'space_1',
      instruction: 'instr',
    });
    expect(recordDispatchMock).toHaveBeenCalledWith('space_1', 'routine');
    expect(markInFlightMock).toHaveBeenCalledWith('run-test-id');
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  it('missing Modal env + in-process run fails → ledger failed, returns error', async () => {
    delete process.env.MODAL_WEBHOOK_URL;
    runAutonomousInstructionMock.mockResolvedValue({ ok: false, ran: false, error: 'space not found' });
    const status = await fireRoutineRun('space_1', 'instr');
    expect(status).toBe('error');
    expect(modalCallCount).toBe(0);
    expect(markFailedMock).toHaveBeenCalledTimes(1);
    expect(markFailedMock.mock.calls[0][1]).toContain('space not found');
  });

  it('passes a non-default trigger through to the ledger', async () => {
    await fireRoutineRun('space_1', 'instr', undefined, undefined, 'run_now');
    expect(recordDispatchMock).toHaveBeenCalledWith('space_1', 'run_now');
  });
});
