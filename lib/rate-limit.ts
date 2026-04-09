import { redis } from '@/lib/redis';

/**
 * In-memory fallback rate limiter (bounded LRU).
 * Used when Redis is unavailable. Tracks last N IPs.
 */
// In-memory fallback only — Redis should be the primary rate limiter in production.
// 10 000 entries is enough to resist trivial eviction attacks while keeping memory bounded.
const MEM_MAX_ENTRIES = 10_000;
const memStore = new Map<string, { count: number; expiresAt: number }>();
let redisFailCount = 0;

function memIncr(key: string, windowSeconds: number): number {
  const now = Date.now();
  // Evict expired entries periodically
  if (memStore.size > MEM_MAX_ENTRIES) {
    for (const [k, v] of memStore) {
      if (v.expiresAt < now) memStore.delete(k);
      if (memStore.size <= MEM_MAX_ENTRIES * 0.8) break;
    }
  }
  const entry = memStore.get(key);
  if (entry && entry.expiresAt > now) {
    entry.count++;
    return entry.count;
  }
  memStore.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
  return 1;
}

/**
 * Increment a sliding-window counter in Redis.
 * Returns { allowed: true } if under the limit, { allowed: false } if over.
 * Falls back to in-memory counter if Redis is unavailable.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean }> {
  // If Redis has failed repeatedly, use in-memory directly
  if (redisFailCount >= 3) {
    const count = memIncr(key, windowSeconds);
    return { allowed: count <= max };
  }

  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    redisFailCount = 0; // Reset on success
    return { allowed: count <= max };
  } catch {
    redisFailCount++;
    // Fall back to in-memory rate limiting
    const count = memIncr(key, windowSeconds);
    return { allowed: count <= max };
  }
}
