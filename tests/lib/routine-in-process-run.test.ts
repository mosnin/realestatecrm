/**
 * End-to-end proof for the Modal-free routine → run wiring (the background path
 * that "never worked"). This is the in-process fallback in lib/routines'
 * `fireInProcessRun`: when MODAL_WEBHOOK_URL is UNSET, fireRoutineRun must drive
 * the headless agent via runAutonomousInstruction and book the run on the ledger.
 *
 * The LLM boundary is the only thing mocked: '@/lib/agent/run-instruction' is
 * stubbed so the agent never actually runs. Everything else (the dispatch
 * branching, the ledger lifecycle calls) is the real code path.
 *
 * Asserts the two outcomes precisely:
 *   ok run    → returns 'ok',    runAutonomousInstruction got {spaceId,instruction},
 *               ledger recordDispatch fired THEN markInFlight (recorded → in_flight).
 *   failed run → returns 'error', ledger markFailed fired with the reason.
 *
 * vi.hoisted holds the factory-referenced mocks so the vi.mock factories can
 * close over them (mocks are hoisted above the imports).
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

// ── LLM boundary mock ─────────────────────────────────────────────────────────
// The only mock that stands in for real work: the headless agent runner. We
// resolve its result shape and assert fireRoutineRun acts on it correctly.
const { runAutonomousInstructionMock } = vi.hoisted(() => ({
  runAutonomousInstructionMock: vi.fn<
    (input: { spaceId: string; instruction: string }) => Promise<{ ok: boolean; ran: boolean; error?: string }>
  >(),
}));

vi.mock('@/lib/agent/run-instruction', () => ({
  runAutonomousInstruction: runAutonomousInstructionMock,
}));

import { fireRoutineRun } from '@/lib/routines';

const ENV_KEYS = ['MODAL_WEBHOOK_URL', 'AGENT_INTERNAL_SECRET'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  // The whole point: Modal is NOT configured, so fireRoutineRun takes the
  // in-process fallback instead of POSTing to a webhook.
  delete process.env.MODAL_WEBHOOK_URL;
  delete process.env.AGENT_INTERNAL_SECRET;

  recordDispatchMock.mockResolvedValue('run-inproc-id');
  markInFlightMock.mockResolvedValue(undefined);
  markFailedMock.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('fireRoutineRun — in-process run (Modal unset)', () => {
  it('drives the headless agent and books the run: ok → in_flight', async () => {
    runAutonomousInstructionMock.mockResolvedValue({ ok: true, ran: true });

    const status = await fireRoutineRun('space_42', 'check on quiet deals');

    // (a) the dispatch succeeded.
    expect(status).toBe('ok');

    // (b) the agent ran with the right space + instruction.
    expect(runAutonomousInstructionMock).toHaveBeenCalledTimes(1);
    expect(runAutonomousInstructionMock).toHaveBeenCalledWith({
      spaceId: 'space_42',
      instruction: 'check on quiet deals',
    });

    // (c) the ledger recorded the dispatch, then marked it in_flight — in that
    // order — keyed by the runId recordDispatch returned. A failed run was NOT
    // recorded.
    expect(recordDispatchMock).toHaveBeenCalledWith('space_42', 'routine');
    expect(markInFlightMock).toHaveBeenCalledWith('run-inproc-id');
    expect(markFailedMock).not.toHaveBeenCalled();
    expect(recordDispatchMock.mock.invocationCallOrder[0]).toBeLessThan(
      markInFlightMock.mock.invocationCallOrder[0],
    );
  });

  it('records an honest failure: run reports ok:false → error → markFailed', async () => {
    runAutonomousInstructionMock.mockResolvedValue({
      ok: false,
      ran: false,
      error: 'space or owner not found',
    });

    const status = await fireRoutineRun('space_42', 'check on quiet deals');

    expect(status).toBe('error');
    // The run still got recorded up front; only the terminal mark differs.
    expect(recordDispatchMock).toHaveBeenCalledWith('space_42', 'routine');
    expect(markInFlightMock).not.toHaveBeenCalled();
    expect(markFailedMock).toHaveBeenCalledTimes(1);
    expect(markFailedMock.mock.calls[0][0]).toBe('run-inproc-id');
    expect(markFailedMock.mock.calls[0][1]).toContain('space or owner not found');
  });
});
