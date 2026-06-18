/**
 * Unit tests for lib/agent/run-ledger.ts — the AgentRunLedger lifecycle helper.
 *
 * Contract: every function is BEST-EFFORT and never throws (ledger bookkeeping
 * must not break the dispatch/money path). recordDispatch returns a runId even
 * when the insert fails so the caller can still dispatch + transition.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { insertMock, updateMock, eqMock, fromMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const updateMock = vi.fn();
  const eqMock = vi.fn();
  const fromMock = vi.fn();
  return { insertMock, updateMock, eqMock, fromMock };
});

vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }));

import { recordDispatch, markInFlight, markFailed, markConfirmed } from '@/lib/agent/run-ledger';

beforeEach(() => {
  vi.clearAllMocks();
  insertMock.mockResolvedValue({ error: null });
  // update(...).eq(...) chain → resolves to {error}.
  eqMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ insert: insertMock, update: updateMock });
});

describe('run-ledger helper', () => {
  it('recordDispatch inserts a dispatched row and returns a runId', async () => {
    const runId = await recordDispatch('space_1', 'sweep');
    expect(typeof runId).toBe('string');
    expect(runId.length).toBeGreaterThan(0);
    expect(fromMock).toHaveBeenCalledWith('AgentRunLedger');
    const row = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ runId, spaceId: 'space_1', trigger: 'sweep', status: 'dispatched' });
    expect(typeof row.dispatchedAt).toBe('string');
  });

  it('recordDispatch honors a caller-provided runId (keeps wire body + ledger in sync)', async () => {
    const runId = await recordDispatch('space_1', 'routine', 'fixed-run-id');
    expect(runId).toBe('fixed-run-id');
    expect((insertMock.mock.calls[0][0] as { runId: string }).runId).toBe('fixed-run-id');
  });

  it('recordDispatch still returns the runId when the insert errors (best-effort)', async () => {
    insertMock.mockResolvedValue({ error: { message: 'boom' } });
    const runId = await recordDispatch('space_1', 'sweep', 'rid');
    expect(runId).toBe('rid'); // dispatch + later marks must still proceed
  });

  it('recordDispatch never throws even if supabase.from throws', async () => {
    fromMock.mockImplementation(() => {
      throw new Error('client exploded');
    });
    await expect(recordDispatch('space_1', 'sweep', 'rid')).resolves.toBe('rid');
  });

  it('markInFlight sets status=in_flight on the matching runId', async () => {
    await markInFlight('rid');
    expect(updateMock.mock.calls[0][0]).toMatchObject({ status: 'in_flight' });
    expect(eqMock).toHaveBeenCalledWith('runId', 'rid');
  });

  it('markFailed sets status=failed with a (truncated) reason', async () => {
    await markFailed('rid', 'x'.repeat(600));
    const fields = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(fields.status).toBe('failed');
    expect((fields.failureReason as string).length).toBe(500); // truncated
  });

  it('markConfirmed sets status=confirmed and stamps confirmedAt', async () => {
    await markConfirmed('rid', '2026-06-18T00:00:00.000Z');
    const fields = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(fields.status).toBe('confirmed');
    expect(fields.confirmedAt).toBe('2026-06-18T00:00:00.000Z');
  });

  it('mark* never throw on a DB error', async () => {
    eqMock.mockResolvedValue({ error: { message: 'db down' } });
    await expect(markInFlight('rid')).resolves.toBeUndefined();
    await expect(markFailed('rid', 'r')).resolves.toBeUndefined();
    await expect(markConfirmed('rid')).resolves.toBeUndefined();
  });
});
