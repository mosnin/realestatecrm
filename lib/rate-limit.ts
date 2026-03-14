import { redis } from '@/lib/redis';

/**
 * Increment a sliding-window counter in Redis.
 * Returns { allowed: true } if under the limit, { allowed: false } if over.
 * Fails open (returns allowed: true) if Redis is unavailable.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean }> {
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return { allowed: count <= max };
  } catch {
    // Redis unavailable — fail open to preserve availability
    return { allowed: true };
  }
}
