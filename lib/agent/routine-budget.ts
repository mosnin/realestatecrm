import { isRedisConfigured, redis } from '@/lib/redis';

/** Same lock and daily token counter as the Python worker. */
export async function claimRoutineSlot(spaceId: string, runId: string, dailyLimit: number) {
  if (!isRedisConfigured()) throw new Error('Background execution requires its shared run lock');
  const key = `agent:runlock:${spaceId}`;
  const budgetKey = `agent:budget:${spaceId}:${new Date().toISOString().slice(0, 10)}`;
  if (!(await redis.set(key, runId, { nx: true, ex: 660 }))) throw new Error('Another background run is in progress');
  const release = async () => {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", [key], [runId]);
  };
  try {
    const used = Number(await redis.get(budgetKey) ?? 0);
    if (!Number.isFinite(used) || used >= dailyLimit) throw new Error('Daily token budget exhausted');
  } catch (error) { await release(); throw error; }
  return {
    release,
    recordUsage: async (tokens: number) => {
      if (tokens > 0) {
        await redis.incrby(budgetKey, tokens);
        await redis.expire(budgetKey, 172800);
      }
    },
  };
}
