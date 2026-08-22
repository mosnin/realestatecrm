/**
 * `list_contacts` — list the realtor's own contacts as clickable cards.
 *
 * The "show me my leads / who are my people" tool. It exists because
 * `find_person` needs a search term and the score-filtered finders return a
 * `{ people }` shape the card UI can't render. `list_contacts` returns the
 * `{ contacts }` shape the inline `ContactsResult` renderer expects, so a
 * plain "who are my leads" resolves in ONE tool call and renders real cards
 * instead of looping across three searches and answering with a count.
 *
 * Read-only. Scoped to `ctx.space.id` AND `brokerageId IS NULL` — the
 * realtor's personal book only, never the brokerage-intake pool. That keeps a
 * broker-owner's personal leads separate from the brokerage queue.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { applyLeadOrgFilters, type LeadOrgFilters } from '@/lib/leads/org-filters';
import { defineTool } from '../types';

const parameters = z
  .object({
    view: z
      .enum(['all', 'hot', 'warm', 'cold', 'unscored', 'rentals', 'buyers', 'sellers'])
      .describe('Which newest contacts to list. Use all when the user did not ask for a filter.'),
  })
  .describe('List the newest workspace contacts as cards using one explicit view.');

interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadType: 'rental' | 'buyer' | 'seller' | null;
  leadScore: number | null;
  scoreLabel: string | null;
  followUpAt: string | null;
}

export const listContactsTool = defineTool<typeof parameters, { contacts: ContactRow[] }>({
  name: 'list_contacts',
  riskLevel: 'safe',
  description:
    'List the newest workspace contacts as cards. Pass exactly one view: all, hot, warm, cold, unscored, rentals, buyers, or sellers.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const scoreLabel = ['hot', 'warm', 'cold', 'unscored'].includes(args.view)
      ? args.view as 'hot' | 'warm' | 'cold' | 'unscored'
      : undefined;
    const segment = args.view === 'rentals'
      ? 'rental'
      : args.view === 'buyers'
        ? 'buyer'
        : args.view === 'sellers'
          ? 'seller'
          : undefined;
    const org: LeadOrgFilters = { scoreLabel, segment };

    let query = applyLeadOrgFilters(
      supabase
        .from('Contact')
        .select('id, name, email, phone, leadType, leadScore, scoreLabel, followUpAt')
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null),
      org,
      { spaceId: ctx.space.id, ownerId: ctx.space.ownerId },
    )
      .order('updatedAt', { ascending: false })
      .limit(50);

    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) {
      return {
        summary: `Could not list contacts: ${error.message}`,
        data: { contacts: [] },
        display: 'error',
      };
    }

    const contacts = (data ?? []) as ContactRow[];
    const prefix = args.view === 'all' ? '' : `${args.view} `;
    const noun = contacts.length === 1 ? 'contact' : 'contacts';
    return {
      summary:
        contacts.length === 0
          ? `No ${prefix}contacts found.`
          : `${contacts.length} ${prefix}${noun}.`,
      data: { contacts },
      display: 'contacts',
    };
  },
});
