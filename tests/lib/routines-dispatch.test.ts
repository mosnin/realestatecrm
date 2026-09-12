vi.mock('@/lib/agent/routine-budget', () => ({ claimRoutineSlot: vi.fn().mockResolvedValue({ recordUsage: vi.fn(), release: vi.fn().mockResolvedValue(undefined) }) }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const ledger = vi.hoisted(() => ({ recordDispatch: vi.fn(), markConfirmed: vi.fn(), markFailed: vi.fn(), markInFlight: vi.fn() }));
const runner = vi.hoisted(() => vi.fn());
vi.mock('@/lib/agent/run-ledger', () => ledger);
vi.mock('@/lib/agent/run-instruction', () => ({ runAutonomousInstruction: runner }));
vi.mock('@/lib/agent/routine-policy', () => ({ resolveRoutinePolicy: vi.fn().mockResolvedValue({ executionMode: 'review' }) }));
import { resolveRoutinePolicy } from '@/lib/agent/routine-policy';
import { fireRoutineRun } from '@/lib/routines';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MODAL_WEBHOOK_URL', 'https://worker.test/run');
  vi.stubEnv('AGENT_INTERNAL_SECRET', 'secret');
  ledger.recordDispatch.mockResolvedValue('run-1');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function respond(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal('fetch', fetch); return fetch;
}
describe('routine execution receipts', () => {
  it('confirms only an explicit receipt for this run', async () => {
    const fetch = respond({ ok: true, run_id: 'run-1' });
    expect(await fireRoutineRun('space-1', 'Review pipeline')).toBe('ok');
    expect(ledger.markConfirmed).toHaveBeenCalledWith('run-1');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ space_id: 'space-1', run_id: 'run-1' });
  });
  it('rejects errors inside HTTP 200', async () => {
    const fetch = respond({ error: 'space_id required' });
    expect(await fireRoutineRun('space-1', 'Review pipeline')).toBe('error');
    expect(ledger.markFailed).toHaveBeenCalledWith('run-1', 'space_id required');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([{ ok: true }, { ok: true, run_id: 'another-run' }])('keeps uncorrelated receipts unresolved: %j', async body => {
    respond(body);
    expect(await fireRoutineRun('space-1', 'Review pipeline')).toBe('error');
    expect(ledger.markConfirmed).not.toHaveBeenCalled();
    expect(ledger.markInFlight).toHaveBeenCalledWith('run-1');
  });
  it.each([new Error('connection reset'), new DOMException('timed out', 'AbortError')])('never replays an uncertain request', async error => {
    const fetch = vi.fn().mockRejectedValue(error); vi.stubGlobal('fetch', fetch);
    expect(await fireRoutineRun('space-1', 'Review pipeline')).toBe('error');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ledger.markInFlight).toHaveBeenCalledWith('run-1');
    expect(ledger.markFailed).not.toHaveBeenCalled();
  });
  it('does not retry a proxy failure that might follow execution', async () => {
    const fetch = respond({}, 502);
    await fireRoutineRun('space-1', 'Review pipeline');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ledger.markConfirmed).not.toHaveBeenCalled();
  });
  it('records actual in-process completion as terminal', async () => {
    vi.stubEnv('MODAL_WEBHOOK_URL', '');
    runner.mockResolvedValue({ ok: true, ran: true });
    expect(await fireRoutineRun('space-1', 'Review pipeline')).toBe('ok');
    expect(ledger.markConfirmed).toHaveBeenCalledWith('run-1');
    expect(ledger.markInFlight).not.toHaveBeenCalled();
  });
  it('uses automatic native execution even when Modal is configured', async () => {
    vi.mocked(resolveRoutinePolicy).mockResolvedValue({ executionMode: 'autonomous', authorizedInstruction: 'Send the update', dailyTokenBudget: 50000 });
    runner.mockResolvedValue({ ok: true, ran: true });
    const fetch = respond({ ok: true, run_id: 'run-1' });
    expect(await fireRoutineRun('space-1', 'Send the update')).toBe('ok');
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'space-1', instruction: 'Send the update', executionMode: 'autonomous', authorizedInstruction: 'Send the update' }));
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(resolveRoutinePolicy).mockResolvedValue({ executionMode: 'review', authorizedInstruction: undefined, dailyTokenBudget: 50000 });
  });

});
