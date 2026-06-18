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
      .describe('Filter by buyer / rental / seller. Omit for all.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(50)
      .describe('Max contacts to return, newest first. Default 50.'),
  })
  .describe('List the contacts in this workspace, optionally filtered by score tier or lead type.');

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
    'List the contacts/leads in this workspace as cards, optionally filtered by score tier or lead type. Use for "who are my leads", "show my contacts", "my hot leads".',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const limit = Math.min(args.limit ?? 50, 100);

    let query = supabase
      .from('Contact')
      .select('id, name, email, phone, leadType, leadScore, scoreLabel, followUpAt')
      .eq('spaceId', ctx.space.id)
      .is('brokerageId', null)
      .order('updatedAt', { ascending: false })
      .limit(limit);

    if (args.scoreLabel) query = query.eq('scoreLabel', args.scoreLabel);
    if (args.leadType) query = query.eq('leadType', args.leadType);

    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) {
      return {
        summary: `Could not list contacts: ${error.message}`,
        data: { contacts: [] },
        display: 'error',
      };
    }

    const contacts = (data ?? []) as ContactRow[];
    const filterNote = [args.scoreLabel, args.leadType].filter(Boolean).join(' ');
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
