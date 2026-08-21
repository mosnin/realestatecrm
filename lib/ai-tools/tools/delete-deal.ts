/**
 * `delete_deal` — permanently delete a deal and its dependent rows.
 *
 * Approval-gated and DESTRUCTIVE. This removes the Deal row outright;
 * dependent rows (checklist items, documents, commission splits, review
 * requests) cascade per the FK ON DELETE rules, while the commission ledger
 * is retained (its FK is ON DELETE SET NULL). There is no undo, so
 * `requiresApproval: true` is mandatory.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to permanently delete.'),
    reason: z
      .string()
      .min(1)
      .max(500)
      .describe('Why this deal is being deleted — recorded in the server log for audit.'),
  })
  .describe('Permanently delete a deal (irreversible).');

interface DeleteDealResult {
  dealId: string;
  deleted: true;
}

export const deleteDealTool = defineTool<typeof parameters, DeleteDealResult>({
  name: 'delete_deal',
  riskLevel: 'destructive',
  description:
    'Permanently delete a deal and its checklist/documents. Irreversible — mark it lost to keep history. Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 20, windowSeconds: 3600 },
  summariseCall(args) {
    return `Permanently delete deal ${args.dealId.slice(0, 8)} — ${args.reason}`;
  },

  async handler(args, ctx) {
    const { data: deal, error: lookupErr } = await tenantTable(supabase, 'Deal', { spaceId: ctx.space.id })
      .select('id, title')
      .eq('id', args.dealId)
      .maybeSingle();
    if (lookupErr) {
      return { summary: `Deal lookup failed: ${lookupErr.message}`, display: 'error' };
    }
    if (!deal) {
      return {
        summary: `No deal with id "${args.dealId}" in this workspace.`,
        display: 'error',
      };
    }

    const { error: deleteErr } = await tenantTable(supabase, 'Deal', { spaceId: ctx.space.id })
      .delete()
      .eq('id', args.dealId);
    if (deleteErr) {
      logger.error('[tools.delete_deal] delete failed', { dealId: args.dealId }, deleteErr);
      return { summary: `Delete failed: ${deleteErr.message}`, display: 'error' };
    }

    logger.info('[tools.delete_deal] deleted', {
      dealId: args.dealId,
      spaceId: ctx.space.id,
      reason: args.reason,
    });

    return {
      summary: `Deleted deal ${deal.title || args.dealId.slice(0, 8)}.`,
      data: { dealId: args.dealId, deleted: true as const },
      display: 'success',
    };
  },
});
