import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIncr = vi.fn();
const mockExpire = vi.fn();

vi.mock('@/lib/redis', () => ({
  redis: {
    incr: (...args: unknown[]) => mockIncr(...args),
    expire: (...args: unknown[]) => mockExpire(...args),
  },
}));

import { checkRateLimit } from '@/lib/rate-limit';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkRateLimit', () => {
  it('allows first request and sets expiry', async () => {
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(true);

    const result = await checkRateLimit('test-key', 10, 3600);
    expect(result.allowed).toBe(true);
    expect(mockIncr).toHaveBeenCalledWith('test-key');
    expect(mockExpire).toHaveBeenCalledWith('test-key', 3600);
  });

  it('allows requests under the limit', async () => {
    mockIncr.mockResolvedValue(5);

    const result = await checkRateLimit('test-key', 10, 3600);
    expect(result.allowed).toBe(true);
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it('allows requests at exactly the limit', async () => {
    mockIncr.mockResolvedValue(10);

    const result = await checkRateLimit('test-key', 10, 3600);
    expect(result.allowed).toBe(true);
  });

  it('rejects requests over the limit', async () => {
    mockIncr.mockResolvedValue(11);

    const result = await checkRateLimit('test-key', 10, 3600);
    expect(result.allowed).toBe(false);
  });

  it('fails open when Redis throws', async () => {
    mockIncr.mockRejectedValue(new Error('Redis connection failed'));

    const result = await checkRateLimit('test-key', 10, 3600);
    expect(result.allowed).toBe(true);
  });
});
