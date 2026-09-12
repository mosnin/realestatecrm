import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ configured: vi.fn(), set: vi.fn(), get: vi.fn(), eval: vi.fn(), incrby: vi.fn(), expire: vi.fn() }));
vi.mock('@/lib/redis', () => ({ isRedisConfigured: mocks.configured, redis: mocks }));
import { claimRoutineSlot } from '@/lib/agent/routine-budget';
beforeEach(() => { vi.clearAllMocks(); mocks.configured.mockReturnValue(true); mocks.set.mockResolvedValue('OK'); mocks.get.mockResolvedValue(10); mocks.eval.mockResolvedValue(1); });
describe('shared background execution coordination', () => {
  it('refuses when the lock cannot be acquired', async () => {
    mocks.set.mockResolvedValue(null);
    await expect(claimRoutineSlot('s','run',100)).rejects.toThrow('in progress');
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('refuses missing coordination instead of running unbounded', async () => {
    mocks.configured.mockReturnValue(false);
    await expect(claimRoutineSlot('s','run',100)).rejects.toThrow('shared run lock');
  });
  it('releases its lock when the daily budget is exhausted', async () => {
    mocks.get.mockResolvedValue(100);
    await expect(claimRoutineSlot('s','run',100)).rejects.toThrow('budget exhausted');
    expect(mocks.eval).toHaveBeenCalledWith(expect.any(String), ['agent:runlock:s'], ['run']);
  });
  it('uses the worker token counter and owner-conditional release', async () => {
    const slot = await claimRoutineSlot('s','run',100);
    await slot.recordUsage(25); await slot.release();
    expect(mocks.set).toHaveBeenCalledWith('agent:runlock:s','run',{ nx:true, ex:660 });
    expect(mocks.incrby).toHaveBeenCalledWith(expect.stringMatching(/^agent:budget:s:/),25);
    expect(mocks.expire).toHaveBeenCalledWith(expect.any(String),172800);
    expect(mocks.eval).toHaveBeenCalledWith(expect.any(String), ['agent:runlock:s'], ['run']);
  });
});
