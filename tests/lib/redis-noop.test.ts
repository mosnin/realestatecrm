/**
 * The redis export is a lazy Proxy that degrades to a no-op when Upstash env
 * vars are missing (local dev, preview deploys) so callers never crash on a
 * missing connection. The per-method return SHAPE is the contract that keeps
 * downstream code working: list/zset reads -> [] (safe to iterate), counters
 * -> 0 (safe for arithmetic + `count <= max`), everything else -> null
 * ("no row touched"). Pin it with the env vars cleared.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ORIG_URL = process.env.KV_REST_API_URL;
const ORIG_TOKEN = process.env.KV_REST_API_TOKEN;

beforeAll(() => {
  // Force the no-op path before the proxy lazily builds its client.
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});
afterAll(() => {
  if (ORIG_URL === undefined) delete process.env.KV_REST_API_URL;
  else process.env.KV_REST_API_URL = ORIG_URL;
  if (ORIG_TOKEN === undefined) delete process.env.KV_REST_API_TOKEN;
  else process.env.KV_REST_API_TOKEN = ORIG_TOKEN;
});

// Imported after the env guard above is declared; the proxy only reads env on
// first method access, which happens inside the tests.
import { redis } from '@/lib/redis';

describe('redis no-op proxy (no Upstash env)', () => {
  it('returns [] for list/zset reads (safe to iterate)', async () => {
    expect(await redis.lrange('k', 0, -1)).toEqual([]);
    expect(await redis.zrange('k', 0, -1)).toEqual([]);
    // zrangebyscore is in the no-op map but isn't on the typed Redis surface
    // (it's a zrange option), so reach it through a loose cast.
    const loose = redis as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    expect(await loose.zrangebyscore('k', 0, 100)).toEqual([]);
    expect(await redis.mget('a', 'b')).toEqual([]);
  });

  it('returns 0 for counters (safe for arithmetic + count <= max)', async () => {
    expect(await redis.incr('k')).toBe(0);
    expect(await redis.decr('k')).toBe(0);
    expect(await redis.zcard('k')).toBe(0);
    expect(await redis.llen('k')).toBe(0);
  });

  it('returns null for any other method ("no row touched")', async () => {
    expect(await redis.get('k')).toBeNull();
    expect(await redis.set('k', 'v')).toBeNull();
    expect(await redis.expire('k', 60)).toBeNull();
    expect(await redis.del('k')).toBeNull();
  });

  it('exposes every method as a callable returning a promise', () => {
    expect(typeof redis.incr).toBe('function');
    expect(redis.get('k')).toBeInstanceOf(Promise);
  });
});
