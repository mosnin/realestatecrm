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
    scoreLabel: z
      .enum(['hot', 'warm', 'cold', 'unscored'])
      .optional()
      .describe('Filter to one AI lead-score tier. Omit to list every tier.'),
    leadType: z
      .enum(['rental', 'buyer', 'seller'])
      .optional()
      .describe('Segment: buyer / rental / seller. Alias of segment. Omit for all.'),
    segment: z
      .enum(['rental', 'buyer', 'seller'])
      .optional()
      .describe('Same as leadType — Contact.leadType segment.'),
    stage: z
      .enum(['QUALIFICATION', 'TOUR', 'APPLICATION'])
      .optional()
      .describe('Pipeline stage stored on Contact.type.'),
    tag: z.string().max(100).optional().describe('Contacts whose tags[] contain this tag.'),
    source: z
      .enum(['web_form', 'brokerage_form', 'api', 'import', 'referral', 'manual', 'agent', 'other'])
      .optional()
      .describe('Structured lead source on Contact.source.'),
    status: z
      .enum(['active', 'snoozed', 'archived', 'all'])
      .optional()
      .describe('Derived from Contact.snoozedUntil. Default lists every status.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(50)
      .describe('Max contacts to return, newest first. Default 50.'),
  })
  .describe('List workspace contacts as cards. Filter by segment, stage, tag, source, status, or score.');

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
    'List workspace contacts as cards. Filter by segment, stage, tag, source, status, or score. Use for "who are my leads", "my hot buyers".',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const limit = Math.min(args.limit ?? 50, 100);

    const org: LeadOrgFilters = {
      scoreLabel: args.scoreLabel,
      segment: args.segment ?? args.leadType,
      stage: args.stage,
      tag: args.tag?.trim() || undefined,
      source: args.source,
      status: args.status,
    };

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
      .limit(limit);

    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) {
      return {
        summary: `Could not list contacts: ${error.message}`,
        data: { contacts: [] },
        display: 'error',
      };
    }

    const contacts = (data ?? []) as ContactRow[];
    const filterNote = [
      args.scoreLabel,
      args.segment ?? args.leadType,
      args.stage,
      args.tag,
      args.source,
      args.status,
    ]
      .filter(Boolean)
      .join(' ');
    const prefix = filterNote ? `${filterNote} ` : '';
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
