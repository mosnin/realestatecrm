/**
 * `delete_property` — permanently delete a property and its dependent rows.
 *
 * Approval-gated and DESTRUCTIVE. Removes the Property row outright; packet
 * rows cascade (ON DELETE CASCADE) and deal/contact propertyId references are
 * nulled (ON DELETE SET NULL). There is no undo, so `requiresApproval: true`
 * is mandatory.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    propertyId: z.string().min(1).describe('The Property.id to permanently delete.'),
    reason: z
      .string()
      .min(1)
      .max(500)
      .describe('Why this property is being deleted — recorded in the server log for audit.'),
  })
  .describe('Permanently delete a property (irreversible).');

interface DeletePropertyResult {
  propertyId: string;
  deleted: true;
}

export const deletePropertyTool = defineTool<typeof parameters, DeletePropertyResult>({
  name: 'delete_property',
  riskLevel: 'destructive',
  description:
    'Permanently delete a property listing. Irreversible — set status to off_market to keep the record. Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 20, windowSeconds: 3600 },
  summariseCall(args) {
    return `Permanently delete property ${args.propertyId.slice(0, 8)} — ${args.reason}`;
  },

  async handler(args, ctx) {
    const { data: property, error: lookupErr } = await supabase
      .from('Property')
      .select('id, address')
      .eq('id', args.propertyId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (lookupErr) {
      return { summary: `Property lookup failed: ${lookupErr.message}`, display: 'error' };
    }
    if (!property) {
      return {
        summary: `No property with id "${args.propertyId}" in this workspace.`,
        display: 'error',
      };
    }

    const { error: deleteErr } = await supabase
      .from('Property')
      .delete()
      .eq('id', args.propertyId)
      .eq('spaceId', ctx.space.id);
    if (deleteErr) {
      logger.error('[tools.delete_property] delete failed', { propertyId: args.propertyId }, deleteErr);
      return { summary: `Delete failed: ${deleteErr.message}`, display: 'error' };
    }

    logger.info('[tools.delete_property] deleted', {
      propertyId: args.propertyId,
      spaceId: ctx.space.id,
      reason: args.reason,
    });

    return {
      summary: `Deleted property ${property.address || args.propertyId.slice(0, 8)}.`,
      data: { propertyId: args.propertyId, deleted: true as const },
      display: 'success',
    };
  },
});
