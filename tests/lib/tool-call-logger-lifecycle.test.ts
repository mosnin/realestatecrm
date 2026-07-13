import { beforeEach, describe, expect, it, vi } from 'vitest';

const { afterMock, eqMock, fromMock, insertMock, updateMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  eqMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('next/server', () => ({ after: afterMock }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }));

import {
  logToolCallComplete,
  logToolCallError,
  logToolCallStart,
} from '@/lib/agent/tool-call-logger';

beforeEach(() => {
  afterMock.mockReset();
  eqMock.mockReset().mockResolvedValue({ error: null });
  insertMock.mockReset().mockResolvedValue({ error: null });
  updateMock.mockReset().mockReturnValue({ eq: eqMock });
  fromMock.mockReset().mockReturnValue({ insert: insertMock, update: updateMock });
});

describe('tool-call execution ledger lifecycle', () => {
  it('retains start and completion writes', async () => {
    const stepId = await logToolCallStart('space_1', 'search_contacts', { query: 'Sam' });
    await logToolCallComplete(stepId, 'Found one contact');

    expect(afterMock).toHaveBeenCalledTimes(2);
    expect(afterMock.mock.calls.every(([callback]) => typeof callback === 'function')).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      id: stepId,
      spaceId: 'space_1',
      status: 'running',
    }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(eqMock).toHaveBeenCalledWith('id', stepId);
  });

  it('retains the failed terminal write', async () => {
    const stepId = await logToolCallStart('space_1', 'create_deal', {});
    await logToolCallError(stepId, 'Provider unavailable');

    expect(afterMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      errorMessage: 'Provider unavailable',
    }));
  });
});
