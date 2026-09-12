import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { internal } from '../../convex/_generated/api';
// Execute the actual functions through Convex's transactional test runtime.
const modules = {
  '../../convex/followUps.ts': () => import('../../convex/followUps'),
  '../../convex/http.ts': () => import('../../convex/http'),
  '../../convex/_generated/server.ts': () => import('../../convex/_generated/server'),
};
const ref = { spaceId: 'space-a', routineId: 'routine-a', scheduledFor: '2026-09-07T09:00:00.000Z' };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('Convex follow-up coordinator', () => {
  it('deduplicates the same tenant/routine/slot and isolates other tenants', async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(internal.followUps.enqueue, ref);
    expect(await t.mutation(internal.followUps.enqueue, ref)).toEqual(a);
    const b = await t.mutation(internal.followUps.enqueue, { ...ref, spaceId: 'space-b' });
    expect(b.jobId).not.toBe(a.jobId);
    const rows = await t.query(internal.followUps.list, { spaceId: 'space-a' });
    expect(rows.map(r => r.jobId)).toEqual([a.jobId]);
  });
  it('allows only one execution claim and refuses mismatched references', async () => {
    const t = convexTest(schema, modules);
    const { jobId } = await t.mutation(internal.followUps.enqueue, ref);
    expect(await t.mutation(internal.followUps.claim, { ...ref, jobId, spaceId: 'wrong' })).toBe(false);
    expect(await t.mutation(internal.followUps.claim, { ...ref, jobId })).toBe(true);
    expect(await t.mutation(internal.followUps.claim, { ...ref, jobId })).toBe(false);
  });
  it('holds stale execution as uncertain and never overwrites it with late success', async () => {
    const t = convexTest(schema, modules);
    const { jobId } = await t.mutation(internal.followUps.enqueue, ref);
    await t.mutation(internal.followUps.claim, { ...ref, jobId });
    await t.mutation(internal.followUps.expire, { jobId });
    await t.mutation(internal.followUps.finish, { jobId, state: 'completed' });
    expect((await t.query(internal.followUps.get, { jobId }))?.state).toBe('uncertain');
    expect(await t.mutation(internal.followUps.claim, { ...ref, jobId })).toBe(false);
  });
  it('does not dispatch again after completion', async () => {
    const t = convexTest(schema, modules);
    const { jobId } = await t.mutation(internal.followUps.enqueue, ref);
    await t.mutation(internal.followUps.finish, { jobId, state: 'completed' });
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await t.action(internal.followUps.dispatch, { jobId });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requires a correlated receipt and does not retry a lost response', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('CHIPPI_APP_ORIGIN', 'https://chippi.example'); vi.stubEnv('CHIPPI_CALLBACK_SECRET', 'test');
    const fetch = vi.fn().mockRejectedValue(new Error('connection lost')); vi.stubGlobal('fetch', fetch);
    const { jobId } = await t.mutation(internal.followUps.enqueue, ref);
    await t.action(internal.followUps.dispatch, { jobId });
    await t.action(internal.followUps.dispatch, { jobId });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await t.query(internal.followUps.get, { jobId }))?.state).toBe('uncertain');
  });
  it('rejects unauthenticated HTTP access', async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch('/follow-ups/list', { method: 'POST', body: JSON.stringify({ spaceId: 'space-a' }) });
    expect(response.status).toBe(401);
  });
});
