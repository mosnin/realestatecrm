/**
 * `get_contact` — fetch a single contact with the fields the assistant
 * most often needs when drafting a next step: score, follow-up state,
 * linked deals, recent tours.
 *
 * Read-only. If the id doesn't exist (or isn't in this space), returns a
 * structured not-found instead of throwing — the model can explain to the
 * user and ask for clarification.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    contactId: z.string().min(1).describe('Exact Contact.id of the person to fetch.'),
  })
  .describe(
    'Fetch one contact by id. Pair with search_contacts when you only have a name.',
  );

interface ContactDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadType: 'rental' | 'buyer';
  scoreLabel: string | null;
  leadScore: number | null;
  scoreSummary: string | null;
  followUpAt: string | null;
  lastContactedAt: string | null;
  sourceLabel: string | null;
  referralSource: string | null;
  budget: number | null;
  preferences: string | null;
  notes: string | null;
  tags: string[];
  snoozedUntil: string | null;
  deals: Array<{ id: string; title: string; status: string; value: number | null }>;
  recentTours: Array<{ id: string; startsAt: string; status: string; propertyAddress: string | null }>;
}

export const getContactTool = defineTool<typeof parameters, { contact: ContactDetail | null }>({
  name: 'get_contact',
  description:
    'Fetch detailed info for one contact by id: score, follow-up state, linked deals, recent tours. Use before drafting outreach.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const { data: contact, error } = await supabase
      .from('Contact')
      .select(
        'id, name, email, phone, leadType, scoreLabel, leadScore, scoreSummary, followUpAt, lastContactedAt, sourceLabel, referralSource, budget, preferences, notes, tags, snoozedUntil',
      )
      .eq('id', args.contactId)
      .eq('spaceId', ctx.space.id)
      .is('brokerageId', null)
      .abortSignal(ctx.signal)
      .maybeSingle();

    if (error) {
      return {
        summary: `Lookup failed: ${error.message}`,
        data: { contact: null },
        display: 'error',
      };
    }
    if (!contact) {
      return {
        summary: `No contact with id "${args.contactId}" in this workspace.`,
        data: { contact: null },
        display: 'plain',
      };
    }

    // Linked deals (via DealContact) and recent tours — small side queries.
    const [dealJoin, toursRes] = await Promise.all([
      supabase
        .from('DealContact')
        .select('Deal(id, title, status, value)')
        .eq('contactId', args.contactId),
      supabase
        .from('Tour')
        .select('id, startsAt, status, propertyAddress')
        .eq('contactId', args.contactId)
        .eq('spaceId', ctx.space.id)
        .order('startsAt', { ascending: false })
        .limit(5),
    ]);

    const deals =
      ((dealJoin.data ?? []) as unknown as Array<{ Deal: { id: string; title: string; status: string; value: number | null } | null }>)
        .map((r) => r.Deal)
        .filter((d): d is NonNullable<typeof d> => Boolean(d));

    const detail: ContactDetail = {
      ...(contact as Omit<ContactDetail, 'deals' | 'recentTours'>),
      deals,
      recentTours: (toursRes.data ?? []) as ContactDetail['recentTours'],
    };

    const score =
      detail.scoreLabel && detail.leadScore != null
        ? `${detail.scoreLabel} ${Math.round(detail.leadScore)}`
        : 'unscored';
    const followUp = detail.followUpAt
      ? new Date(detail.followUpAt) < new Date()
        ? 'follow-up overdue'
        : `follow-up on ${new Date(detail.followUpAt).toLocaleDateString()}`
      : 'no follow-up set';
    const dealsLine = detail.deals.length
      ? `${detail.deals.length} linked deal${detail.deals.length === 1 ? '' : 's'}`
      : 'no linked deals';
    const tourLine = detail.recentTours.length
      ? `${detail.recentTours.length} recent tour${detail.recentTours.length === 1 ? '' : 's'}`
      : 'no tours yet';

    return {
      summary: `${detail.name} · ${score} · ${followUp} · ${dealsLine} · ${tourLine}.`,
      data: { contact: detail },
      display: 'contacts',
    };
  },
});
