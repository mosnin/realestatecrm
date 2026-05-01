/**
 * `recall_history` — search ContactActivity / DealActivity for matching content.
 *
 * Read-only. Honest about HOW it searches: we set `searchKind: 'keyword'`
 * because there is no activity-content vector index in `lib/vectorize.ts` —
 * that file vectorises Contacts and Deals, not activity entries. ILIKE is the
 * right tool until that index exists; pretending otherwise would mislead the
 * model.
 *
 * Filters: optional personId / dealId scope the lookup. With neither set, both
 * tables are searched workspace-wide.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    personId: z.string().min(1).optional().describe('Restrict to one Contact.'),
    dealId: z.string().min(1).optional().describe('Restrict to one Deal.'),
    query: z.string().trim().min(1).max(200).describe('Text to match in activity content.'),
  })
  .describe('Search activity feeds (notes, calls, emails, meetings) for a phrase.');

interface ActivityHit {
  source: 'contact' | 'deal';
  id: string;
  type: string;
  date: string; // ISO
  excerpt: string;
}

interface RecallResult {
  searchKind: 'semantic' | 'keyword';
  hits: ActivityHit[];
}

const EXCERPT_MAX = 120;

function makeExcerpt(content: string | null): string {
  const v = (content ?? '').trim().replace(/\s+/g, ' ');
  if (v.length <= EXCERPT_MAX) return v;
  return v.slice(0, EXCERPT_MAX - 1) + '…';
}

export const recallHistoryTool = defineTool<typeof parameters, RecallResult>({
  name: 'recall_history',
  description:
    'Search activity history (notes, calls, emails, meetings) for a phrase. Keyword search only.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const escaped = args.query
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .replace(/[,()]/g, '');
    const pat = `%${escaped}%`;

    // Contact activities
    let contactQ = supabase
      .from('ContactActivity')
      .select('id, contactId, type, content, createdAt')
      .eq('spaceId', ctx.space.id)
      .ilike('content', pat)
      .order('createdAt', { ascending: false })
      .limit(10);
    if (args.personId) contactQ = contactQ.eq('contactId', args.personId);

    // Deal activities
    let dealQ = supabase
      .from('DealActivity')
      .select('id, dealId, type, content, createdAt')
      .eq('spaceId', ctx.space.id)
      .ilike('content', pat)
      .order('createdAt', { ascending: false })
      .limit(10);
    if (args.dealId) dealQ = dealQ.eq('dealId', args.dealId);

    // If personId is set, deal search is irrelevant; same for dealId.
    const [cRes, dRes] = await Promise.all([
      args.dealId ? Promise.resolve({ data: [], error: null }) : contactQ.abortSignal(ctx.signal),
      args.personId ? Promise.resolve({ data: [], error: null }) : dealQ.abortSignal(ctx.signal),
    ]);

    const cRows = (cRes.data ?? []) as Array<{
      id: string;
      contactId: string;
      type: string;
      content: string | null;
      createdAt: string;
    }>;
    const dRows = (dRes.data ?? []) as Array<{
      id: string;
      dealId: string;
      type: string;
      content: string | null;
      createdAt: string;
    }>;

    const hits: ActivityHit[] = [
      ...cRows.map((r) => ({
        source: 'contact' as const,
        id: r.id,
        type: r.type,
        date: r.createdAt,
        excerpt: makeExcerpt(r.content),
      })),
      ...dRows.map((r) => ({
        source: 'deal' as const,
        id: r.id,
        type: r.type,
        date: r.createdAt,
        excerpt: makeExcerpt(r.content),
      })),
    ]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 10);

    return {
      summary:
        hits.length === 0
          ? `No activity matched "${args.query}" (keyword search).`
          : `${hits.length} activit${hits.length === 1 ? 'y' : 'ies'} matched "${args.query}" (keyword search).`,
      data: { searchKind: 'keyword' as const, hits },
      display: 'plain',
    };
  },
});
