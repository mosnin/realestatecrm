/**
 * `list_deal_deadlines` — read a deal's contract-to-close deadlines.
 *
 * Read-only: lists the deal's `DealChecklistItem` rows ordered by due date,
 * flags anything overdue, and surfaces the next one up. By default it shows
 * only open items (the realtor asking "what's left on this deal?"); pass
 * `includeCompleted` to see the whole ladder.
 *
 * No approval — reads can't damage data.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { roleLabel } from '@/lib/deals/roles';
import type { DealContactRole } from '@/lib/types';
import { defineTool } from '../types';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to list deadlines for.'),
    includeCompleted: z
      .boolean()
      .default(false)
      .describe('Include already-completed deadlines. Defaults to open-only.'),
  })
  .describe("List a deal's contract-to-close deadlines, ordered by due date, with overdue flagged.");

interface DeadlineRow {
  id: string;
  kind: string;
  label: string;
  dueAt: string | null;
  completedAt: string | null;
  assignedRoles: string[];
  overdue: boolean;
  daysUntilDue: number | null;
}

interface ListDealDeadlinesResult {
  dealId: string;
  total: number;
  openCount: number;
  overdueCount: number;
  deadlines: DeadlineRow[];
}

function startOfTodayUTC(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export const listDealDeadlinesTool = defineTool<typeof parameters, ListDealDeadlinesResult>({
  name: 'list_deal_deadlines',
  riskLevel: 'safe',
  description:
    "List a deal's contract-to-close deadlines (checklist items) ordered by due date, flagging overdue ones. Read-only.",
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    // Deal must exist in this space.
    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .select('id, title')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (dealErr) {
      return { summary: `Deal lookup failed: ${dealErr.message}`, display: 'error' };
    }
    if (!deal) {
      return { summary: `No deal with id "${args.dealId}" in this workspace.`, display: 'error' };
    }

    let query = supabase
      .from('DealChecklistItem')
      .select('id, kind, label, dueAt, completedAt, assignedRoles, position')
      .eq('dealId', args.dealId)
      .eq('spaceId', ctx.space.id);
    if (!args.includeCompleted) query = query.is('completedAt', null);

    const { data, error } = await query;
    if (error) {
      logger.error('[tools.list_deal_deadlines] fetch failed', { dealId: args.dealId }, error);
      return { summary: `Failed to load deadlines: ${error.message}`, display: 'error' };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      kind: string;
      label: string;
      dueAt: string | null;
      completedAt: string | null;
      assignedRoles: string[] | null;
      position: number;
    }>;

    const todayMs = startOfTodayUTC();
    const MS_PER_DAY = 86_400_000;

    const deadlines: DeadlineRow[] = rows
      .map((r) => {
        const dueMs = r.dueAt ? new Date(r.dueAt).getTime() : null;
        const dueValid = dueMs != null && !isNaN(dueMs);
        const daysUntilDue = dueValid
          ? Math.round((Date.UTC(
              new Date(dueMs).getUTCFullYear(),
              new Date(dueMs).getUTCMonth(),
              new Date(dueMs).getUTCDate(),
            ) - todayMs) / MS_PER_DAY)
          : null;
        const overdue = !r.completedAt && dueValid && (dueMs as number) < todayMs;
        return {
          id: r.id,
          kind: r.kind,
          label: r.label,
          dueAt: r.dueAt,
          completedAt: r.completedAt,
          assignedRoles: r.assignedRoles ?? [],
          overdue,
          daysUntilDue,
        };
      })
      // Dated first, ascending by due date; undated items sink to the bottom
      // in stable position order.
      .sort((a, b) => {
        if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return 0;
      });

    const openCount = deadlines.filter((d) => !d.completedAt).length;
    const overdueCount = deadlines.filter((d) => d.overdue).length;

    // Build a compact model-facing summary: the next open dated item + an
    // overdue count when relevant.
    const nextOpen = deadlines.find((d) => !d.completedAt && d.dueAt);
    let summary: string;
    if (deadlines.length === 0) {
      summary = `No ${args.includeCompleted ? '' : 'open '}deadlines on "${deal.title}".`.replace('  ', ' ');
    } else {
      const parts: string[] = [`${openCount} open deadline${openCount === 1 ? '' : 's'} on "${deal.title}"`];
      if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
      if (nextOpen) {
        const when = nextOpen.daysUntilDue;
        const whenLabel =
          when == null
            ? ''
            : when < 0
              ? ` (${Math.abs(when)}d overdue)`
              : when === 0
                ? ' (due today)'
                : ` (in ${when}d)`;
        const who = nextOpen.assignedRoles
          .map((r) => roleLabel(r as DealContactRole))
          .filter(Boolean)
          .join(', ');
        parts.push(`next: ${nextOpen.label}${whenLabel}${who ? ` for ${who}` : ''}`);
      }
      summary = parts.join('. ') + '.';
    }

    return {
      summary,
      data: {
        dealId: args.dealId,
        total: deadlines.length,
        openCount,
        overdueCount,
        deadlines,
      },
      display: 'plain',
    };
  },
});
