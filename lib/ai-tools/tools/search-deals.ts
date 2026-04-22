/**
 * `search_deals` — find deals in the caller's space by text + filters.
 *
 * Read-only. Returns a compact summary for the model and a structured list
 * for the UI to render as a deal-card strip (Phase 4).
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    query: z
      .string()
      .trim()
      .max(120)
      .optional()
      .describe('Free-text search across deal title, address, and description.'),
    status: z
      .enum(['active', 'won', 'lost', 'on_hold'])
      .optional()
      .describe('Filter by deal status.'),
    stageName: z
      .string()
      .trim()
      .max(60)
      .optional()
      .describe('Filter by stage name (e.g. "Under Contract").'),
    closingBeforeDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe('Return deals with expectedCloseDate within this many days.'),
    limit: z.number().int().min(1).max(25).optional().default(10),
  })
  .describe(
    'Search deals in the current workspace. Provide at least one filter; empty queries return the most recently updated deals.',
  );

interface DealSummary {
  id: string;
  title: string;
  address: string | null;
  value: number | null;
  status: string;
  priority: string;
  stageId: string;
  closeDate: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  updatedAt: string;
}

export const searchDealsTool = defineTool<typeof parameters, { deals: DealSummary[] }>({
  name: 'search_deals',
  description:
    'Find deals in the current workspace. Use for "which deals are closing this month", "what\'s stuck", "show me active buyer deals".',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const limit = Math.min(args.limit ?? 10, 25);

    let query = supabase
      .from('Deal')
      .select(
        'id, title, address, value, status, priority, stageId, closeDate, nextAction, nextActionDueAt, updatedAt',
      )
      .eq('spaceId', ctx.space.id)
      .order('updatedAt', { ascending: false })
      .limit(limit);

    if (args.status) query = query.eq('status', args.status);

    if (args.stageName) {
      // Resolve the stage id within this space; keep the round-trip small.
      const { data: stageRow } = await supabase
        .from('DealStage')
        .select('id')
        .eq('spaceId', ctx.space.id)
        .ilike('name', args.stageName)
        .maybeSingle();
      if (stageRow?.id) {
        query = query.eq('stageId', stageRow.id);
      } else {
        return {
          summary: `No stage named "${args.stageName}" in this workspace.`,
          data: { deals: [] },
          display: 'plain',
        };
      }
    }

    if (args.closingBeforeDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + args.closingBeforeDays);
      query = query.not('closeDate', 'is', null).lte('closeDate', cutoff.toISOString());
    }

    if (args.query) {
      const escaped = args.query
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/[,()]/g, '');
      const pat = `%${escaped}%`;
      query = query.or(`title.ilike.${pat},address.ilike.${pat},description.ilike.${pat}`);
    }

    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) {
      return {
        summary: `Search failed: ${error.message}`,
        data: { deals: [] },
        display: 'error',
      };
    }

    const deals = (data ?? []) as DealSummary[];
    if (deals.length === 0) {
      return {
        summary: 'No deals matched the search.',
        data: { deals: [] },
        display: 'deals',
      };
    }

    const fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });

    const lines = deals
      .slice(0, 10)
      .map((d) => {
        const val = d.value != null ? ` · ${fmt.format(d.value)}` : '';
        const close = d.closeDate
          ? ` · closes ${new Date(d.closeDate).toLocaleDateString()}`
          : '';
        const next = d.nextAction ? ` · next: ${d.nextAction}` : '';
        return `• ${d.title}${val}${close}${next}`;
      })
      .join('\n');

    const moreNote = deals.length > 10 ? `\n…and ${deals.length - 10} more.` : '';

    return {
      summary: `Found ${deals.length} deal${deals.length === 1 ? '' : 's'}:\n${lines}${moreNote}`,
      data: { deals },
      display: 'deals',
    };
  },
});
