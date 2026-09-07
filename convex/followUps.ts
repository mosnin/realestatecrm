import { v } from 'convex/values';
import { internalMutation, internalQuery, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { state } from './schema';
const reference = { spaceId: v.string(), routineId: v.string(), scheduledFor: v.string() };
export const enqueue = internalMutation({
  args: reference, returns: v.object({ jobId: v.id('followUpJobs'), state }),
  handler: async (ctx, args) => {
    if (!args.spaceId || !args.routineId || !Number.isFinite(Date.parse(args.scheduledFor))) throw new Error('Invalid job reference');
    const existing = await ctx.db.query('followUpJobs').withIndex('by_spaceId_and_routineId_and_scheduledFor', q => q.eq('spaceId', args.spaceId).eq('routineId', args.routineId).eq('scheduledFor', args.scheduledFor)).unique();
    if (existing) return { jobId: existing._id, state: existing.state };
    const jobId = await ctx.db.insert('followUpJobs', { ...args, state: 'queued', updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.followUps.dispatch, { jobId });
    await ctx.scheduler.runAfter(6 * 60_000, internal.followUps.expire, { jobId });
    return { jobId, state: 'queued' as const };
  },
});
export const claim = internalMutation({
  args: { jobId: v.id('followUpJobs'), ...reference }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.state !== 'queued' || job.spaceId !== args.spaceId || job.routineId !== args.routineId || job.scheduledFor !== args.scheduledFor) return false;
    await ctx.db.patch(job._id, { state: 'running', updatedAt: Date.now() });
    return true;
  },
});
export const finish = internalMutation({
  args: { jobId: v.id('followUpJobs'), state: v.union(v.literal('completed'), v.literal('failed'), v.literal('skipped'), v.literal('uncertain')) }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job && (job.state === 'queued' || job.state === 'running')) await ctx.db.patch(args.jobId, { state: args.state, updatedAt: Date.now() });
    return null;
  },
});
export const expire = internalMutation({
  args: { jobId: v.id('followUpJobs') }, returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (job && (job.state === 'queued' || job.state === 'running')) await ctx.db.patch(jobId, { state: 'uncertain', updatedAt: Date.now() });
    return null;
  },
});
export const get = internalQuery({
  args: { jobId: v.id('followUpJobs') }, returns: v.union(v.null(), v.object({ ...reference, state })),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    return job ? { spaceId: job.spaceId, routineId: job.routineId, scheduledFor: job.scheduledFor, state: job.state } : null;
  },
});
export const list = internalQuery({
  args: { spaceId: v.string() }, returns: v.array(v.object({ jobId: v.id('followUpJobs'), routineId: v.string(), scheduledFor: v.string(), state, updatedAt: v.number() })),
  handler: async (ctx, { spaceId }) => (await ctx.db.query('followUpJobs').withIndex('by_spaceId', q => q.eq('spaceId', spaceId)).order('desc').take(50)).map(j => ({ jobId: j._id, routineId: j.routineId, scheduledFor: j.scheduledFor, state: j.state, updatedAt: j.updatedAt })),
});
export const dispatch = internalAction({
  args: { jobId: v.id('followUpJobs') }, returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.runQuery(internal.followUps.get, { jobId });
    if (!job || job.state !== 'queued') return null;
    const origin = process.env.CHIPPI_APP_ORIGIN;
    const secret = process.env.CHIPPI_CALLBACK_SECRET;
    if (!origin || !origin.startsWith('https://') || !secret) {
      await ctx.runMutation(internal.followUps.finish, { jobId, state: 'failed' });
      return null;
    }
    try {
      const response = await fetch(new URL('/api/internal/convex-follow-up', origin), {
        method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, spaceId: job.spaceId, routineId: job.routineId, scheduledFor: job.scheduledFor }),
        signal: AbortSignal.timeout(280_000), redirect: 'error',
      });
      const receipt = await response.json();
      if (response.ok && receipt.jobId === jobId && receipt.state === 'duplicate') return null;
      // An HTTP success alone does not prove execution; require the exact job receipt.
      if (!response.ok || receipt.jobId !== jobId || !['completed', 'failed', 'skipped'].includes(receipt.state)) throw new Error('Unresolved execution');
      await ctx.runMutation(internal.followUps.finish, { jobId, state: receipt.state });
    } catch {
      await ctx.runMutation(internal.followUps.finish, { jobId, state: 'uncertain' });
    }
    return null;
  },
});
