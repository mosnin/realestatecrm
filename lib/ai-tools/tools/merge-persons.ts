/**
 * `merge_persons` — collapse two Contact rows into one.
 *
 * DESTRUCTIVE. Delegates to merge_contacts() so every FK is re-pointed, blank
 * fields are filled, tags/properties are unioned, and the duplicate is deleted
 * inside ONE transaction. The previous hand-rolled path only moved
 * ContactActivity / Tour / DealContact, then deleted the row — Postgres
 * cascaded the rest (application messages, client docs, inbox, drip
 * enrollments, drafts, …). A mid-step failure also left a partial merge.
 *
 * Approval-gated with an explicit summariseCall — the realtor sees
 * "Merge Sam Chen → keep Jane Chen (deletes Sam Chen)" before any row moves.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { deleteContactVector, syncContact } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import type { Contact } from '@/lib/types';

const parameters = z
  .object({
    keepId: z.string().min(1).describe('The Contact.id to keep.'),
    mergeId: z.string().min(1).describe('The Contact.id to merge into keepId, then delete.'),
  })
  .refine((v) => v.keepId !== v.mergeId, { message: 'keepId and mergeId must differ.' })
  .describe('Merge two contacts: move all activity/tours/deal links onto keepId, then delete mergeId.');

interface MergePersonsResult {
  keepId: string;
  mergedId: string;
  movedCounts: Record<string, number>;
}

export const mergePersonsTool = defineTool<typeof parameters, MergePersonsResult>({
  name: 'merge_persons',
  riskLevel: 'destructive',
  description:
    'Merge two contacts into one and delete the duplicate. Destructive — prompts for explicit approval.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 20, windowSeconds: 3600 },
  summariseCall(args) {
    return `Merge contact ${args.mergeId.slice(0, 8)} → keep ${args.keepId.slice(0, 8)} (deletes ${args.mergeId.slice(0, 8)})`;
  },

  async handler(args, ctx) {
    // Both contacts must exist in this space and not be brokerage rows.
    const [keepRes, mergeRes] = await Promise.all([
      supabase
        .from('Contact')
        .select('id, name')
        .eq('id', args.keepId)
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null)
        .maybeSingle(),
      supabase
        .from('Contact')
        .select('id, name')
        .eq('id', args.mergeId)
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null)
        .maybeSingle(),
    ]);
    if (keepRes.error) {
      return { summary: `Lookup failed: ${keepRes.error.message}`, display: 'error' };
    }
    if (mergeRes.error) {
      return { summary: `Lookup failed: ${mergeRes.error.message}`, display: 'error' };
    }
    if (!keepRes.data) {
      return { summary: `No contact with id "${args.keepId}" to keep.`, display: 'error' };
    }
    if (!mergeRes.data) {
      return { summary: `No contact with id "${args.mergeId}" to merge.`, display: 'error' };
    }

    const keepName = keepRes.data.name as string;
    const mergeName = mergeRes.data.name as string;

    const { data: rpcData, error: rpcError } = await supabase.rpc('merge_contacts', {
      p_survivor_id: args.keepId,
      p_duplicate_ids: [args.mergeId],
      p_space_id: ctx.space.id,
      p_actor_clerk_id: ctx.userId,
    });
    if (rpcError) {
      logger.error('[tools.merge_persons] rpc failed (no changes)', {
        keep: args.keepId,
        merge: args.mergeId,
      }, rpcError);
      return {
        summary: `Merge failed — no changes were made. ${rpcError.message}`,
        display: 'error',
      };
    }

    const result = (rpcData ?? {}) as {
      survivorId?: string;
      merged?: string[];
      repointed?: Record<string, number>;
      alreadyMerged?: boolean;
    };
    const mergedIds = result.merged ?? [];
    const repointed = result.repointed ?? {};

    if (mergedIds.length === 0) {
      return {
        summary: `"${mergeName}" was already merged into "${keepName}".`,
        data: {
          keepId: args.keepId,
          mergedId: args.mergeId,
          movedCounts: {},
        },
        display: 'success',
      };
    }

    // Timeline breadcrumb on the survivor (RPC writes AuditLog, not activity).
    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      spaceId: ctx.space.id,
      contactId: args.keepId,
      type: 'note',
      content: `Merged duplicate "${mergeName}" into this record.`,
      metadata: {
        mergedContactId: args.mergeId,
        repointed,
        via: 'on_demand_agent',
      },
    });
    if (activityErr) {
      logger.warn('[tools.merge_persons] audit insert failed', { keep: args.keepId }, activityErr);
    }

    deleteContactVector(ctx.space.id, args.mergeId).catch((err) =>
      logger.warn('[tools.merge_persons] vector delete failed', { merge: args.mergeId }, err),
    );
    const { data: survivor } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', args.keepId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (survivor) {
      syncContact(survivor as Contact).catch((err) =>
        logger.warn('[tools.merge_persons] vector sync failed', { keep: args.keepId }, err),
      );
    }

    const movedBits = Object.entries(repointed)
      .filter(([, n]) => typeof n === 'number' && n > 0)
      .map(([table, n]) => `${n} ${table}`);
    const movedText = movedBits.length > 0 ? ` Re-pointed ${movedBits.join(', ')}.` : '';

    return {
      summary: `Merged "${mergeName}" into "${keepName}".${movedText}`,
      data: {
        keepId: args.keepId,
        mergedId: args.mergeId,
        movedCounts: repointed,
      },
      display: 'success',
    };
  },
});
