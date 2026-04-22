/**
 * `search_contacts` — the first real tool in the registry.
 *
 * Read-only, auto-runs. Takes a free-text query plus optional filters and
 * returns a short list of matching contacts. Always scoped to the caller's
 * space via `ctx.space.id` — the handler never trusts any spaceId from
 * `args` because the model could have hallucinated one.
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
      .describe('Free-text search across name, email, phone, and preferences.'),
    scoreLabel: z
      .enum(['hot', 'warm', 'cold', 'unscored'])
      .optional()
      .describe('Filter by AI lead-score tier.'),
    leadType: z
      .enum(['rental', 'buyer'])
      .optional()
      .describe('Filter by lead type.'),
    hasOverdueFollowUp: z
      .boolean()
      .optional()
      .describe('Restrict to contacts with a follow-up date in the past.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .default(10)
      .describe('Maximum contacts to return. Hard cap 25 regardless of input.'),
  })
  .describe(
    'Search the caller\'s contacts. At least one of `query` / `scoreLabel` / `leadType` / `hasOverdueFollowUp` should be provided.',
  );

interface ContactSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadType: 'rental' | 'buyer';
  scoreLabel: string | null;
  leadScore: number | null;
  followUpAt: string | null;
}

export const searchContactsTool = defineTool<typeof parameters, { contacts: ContactSummary[] }>({
  name: 'search_contacts',
  description:
    'Find contacts (leads / clients) in the current workspace. Use for questions like "who are my hot leads" or "which contacts haven\'t been contacted in 2 weeks".',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    // Narrow the optional fields — zod defaults only apply when parseAsync is
    // called, and we're re-using `parameters.parse` inside the loop so it
    // should already be populated, but double-checking is cheap.
    const limit = Math.min(args.limit ?? 10, 25);

    let query = supabase
      .from('Contact')
      .select('id, name, email, phone, leadType, scoreLabel, leadScore, followUpAt')
      .eq('spaceId', ctx.space.id)
      // Broker-scoped contacts have their own surface; keep the on-demand
      // agent operating on the caller's personal pipeline.
      .is('brokerageId', null)
      .order('updatedAt', { ascending: false })
      .limit(limit);

    if (args.scoreLabel) {
      query = query.eq('scoreLabel', args.scoreLabel);
    }
    if (args.leadType) {
      query = query.eq('leadType', args.leadType);
    }
    if (args.hasOverdueFollowUp) {
      query = query.not('followUpAt', 'is', null).lte('followUpAt', new Date().toISOString());
    }
    if (args.query) {
      // Escape PostgREST ILIKE specials, strip filter-breaking commas/parens,
      // and wrap as a contains pattern across the relevant text columns.
      const escaped = args.query
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/[,()]/g, '');
      const pat = `%${escaped}%`;
      query = query.or(
        `name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat},preferences.ilike.${pat}`,
      );
    }

    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) {
      return {
        summary: `Search failed: ${error.message}`,
        data: { contacts: [] },
        display: 'error',
      };
    }

    const contacts = (data ?? []) as ContactSummary[];

    if (contacts.length === 0) {
      return {
        summary: 'No contacts matched the search.',
        data: { contacts: [] },
        display: 'contacts',
      };
    }

    // Human-readable summary for the model. Keep it compact; structured
    // data goes to the UI via `data`.
    const lines = contacts
      .slice(0, 10)
      .map((c) => {
        const score = c.scoreLabel && c.leadScore != null ? ` · ${c.scoreLabel} ${Math.round(c.leadScore)}` : '';
        const overdue =
          c.followUpAt && new Date(c.followUpAt) < new Date() ? ' · follow-up overdue' : '';
        return `• ${c.name}${score}${overdue}`;
      })
      .join('\n');

    const moreNote = contacts.length > 10 ? `\n…and ${contacts.length - 10} more.` : '';

    return {
      summary: `Found ${contacts.length} contact${contacts.length === 1 ? '' : 's'}:\n${lines}${moreNote}`,
      data: { contacts },
      display: 'contacts',
    };
  },
});
