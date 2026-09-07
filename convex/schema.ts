import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
export const state = v.union(v.literal('queued'), v.literal('running'), v.literal('completed'), v.literal('failed'), v.literal('skipped'), v.literal('uncertain'));
// References only: customer records, instructions and permissions stay in Supabase.
export default defineSchema({
  followUpJobs: defineTable({
    spaceId: v.string(), routineId: v.string(), scheduledFor: v.string(),
    state, updatedAt: v.number(),
  }).index('by_spaceId_and_routineId_and_scheduledFor', ['spaceId', 'routineId', 'scheduledFor'])
    .index('by_spaceId', ['spaceId']),
});
