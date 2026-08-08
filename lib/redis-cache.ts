/**
 * Redis cache-aside helpers (server-only). Shares the worker's Redis
 * (REDIS_URL) for read-through caching of expensive lookups.
 *
 * Inert without REDIS_URL: get returns null (miss), set/del are no-ops — a
 * cold cache is always a correct cache, so callers never need to branch on
 * whether Redis is configured.
 *
 * Key discipline: ALWAYS include the tenant scope in the key
 * (`cacheKey('leads-summary', spaceId)`) — a cache shared across tenants
 * without scoped keys would be a data leak, same rule as the DB.
 */

import IORedis from 'ioredis';

let client: IORedis | null | undefined;

function getRedis(): IORedis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return client;
  }
  client = new IORedis(url, { maxRetriesPerRequest: 1, connectTimeout: 3_000 });
  client.on('error', () => {
    /* keep the app alive through Redis blips; ops see it via logs below */
  });
  return client;
}

/** Namespaced, tenant-scoped cache key. */
export function cacheKey(name: string, ...scope: (string | number)[]): string {
  return ['chippi', 'cache', name, ...scope].join(':');
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // a failing cache is a miss, never an error
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    console.warn('[cache] set failed:', err);
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    /* best-effort */
  }
}
