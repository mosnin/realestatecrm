/**
 * `draft_counter_offer` — draft a counter-offer summary for a deal.
 *
 * What this is: a REVIEWABLE communication + structured term comparison
 * (current terms → proposed changes) the realtor reads, edits, and decides
 * what to do with. NOT an auto-send, NOT a binding counter. Think "here's
 * how I'd frame the counter," not "generate the signed addendum."
 *
 * Pipeline: same as `draft_offer` — an `AgentDraft` row (status='pending',
 * channel='note') tied to the deal (`dealId`) and the deal's primary contact
 * (`contactId`, best-effort via DealContact). The realtor's inbox renders
 * pending drafts; the realtor approves / edits / dismisses.
 *
 * Approval: YES (reversible inbox mutation → riskLevel='low').
 *
 * Space-scoping: the deal is resolved with `.eq('spaceId', ctx.space.id)`;
 * a deal in another space isn't found → clean refusal.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import {
  DRAFT_EXPIRY_DAYS,
  fmtMoney,
  resolvePrimaryContactId,
} from './offer-draft-shared';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to draft the counter-offer for.'),
    currentOfferPrice: z
      .number()
      .nonnegative()
      .optional()
      .describe('The price currently on the table (the offer being countered).'),
    counterPrice: z
      .number()
      .nonnegative()
      .optional()
      .describe('The price to counter with, in dollars.'),
    proposedChanges: z
      .array(z.string().min(1).max(200))
      .max(12)
      .optional()
      .describe('Proposed changes to terms (e.g. "close 2 weeks earlier", "seller covers $5k closing").'),
    notes: z
      .string()
      .max(2000)
      .optional()
      .describe('Free-text context to fold into the draft (rationale, leverage, deadlines).'),
  })
  .refine((v) => v.counterPrice != null || (v.proposedChanges?.length ?? 0) > 0 || !!v.notes, {
    message: 'Provide at least one of: counterPrice, proposedChanges, or notes.',
  })
  .describe(
    'Draft a reviewable counter-offer summary for a deal. Lands in the approval inbox as a note tied to the deal. Not a binding counter; not auto-sent.',
  );

interface DraftCounterOfferResult {
  draftId: string;
  dealId: string;
  contactId: string | null;
  channel: 'note';
  status: 'pending';
}

export const draftCounterOfferTool = defineTool<typeof parameters, DraftCounterOfferResult>({
  name: 'draft_counter_offer',
  riskLevel: 'low',
  description:
    'Draft a reviewable counter-offer summary for a deal (lands in the approval inbox as a note). Prompts for approval first. Not a binding counter; never auto-sent.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 30, windowSeconds: 3600 },
  summariseCall(args) {
    const slug =
      typeof args?.dealId === 'string' && args.dealId.length > 0 ? args.dealId.slice(0, 8) : 'deal';
    const price = typeof args?.counterPrice === 'number' ? ` at ${fmtMoney(args.counterPrice)}` : '';
    return `Draft a counter-offer for deal ${slug}${price}`;
  },

  async handler(args, ctx) {
    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .select('id, title, value, address')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (dealErr) {
      return { summary: `Deal lookup failed: ${dealErr.message}`, display: 'error' };
    }
    if (!deal) {
      return {
        summary: `No deal with id "${args.dealId}" in this workspace.`,
        display: 'error',
      };
    }

    const dealRow = deal as { id: string; title: string; value: number | null; address: string | null };
    const current = args.currentOfferPrice ?? dealRow.value ?? null;

    const lines: string[] = [];
    lines.push(`Counter-offer — ${dealRow.title}`);
    if (dealRow.address) lines.push(`Property: ${dealRow.address}`);
    lines.push('');
    if (current != null) lines.push(`Current offer on the table: ${fmtMoney(current)}`);
    if (args.counterPrice != null) lines.push(`Proposed counter: ${fmtMoney(args.counterPrice)}`);
    if (current != null && args.counterPrice != null) {
      const delta = args.counterPrice - current;
      const sign = delta >= 0 ? '+' : '−';
      lines.push(`Delta: ${sign}${fmtMoney(Math.abs(delta))}`);
    }
    if (args.proposedChanges && args.proposedChanges.length > 0) {
      lines.push('');
      lines.push('Proposed changes:');
      for (const c of args.proposedChanges) lines.push(`• ${c}`);
    }
    if (args.notes) {
      lines.push('');
      lines.push('Notes:');
      lines.push(args.notes.trim());
    }
    lines.push('');
    lines.push('Review and edit before countering — this is a draft summary, not a binding counter.');
    const content = lines.join('\n');

    const contactId = await resolvePrimaryContactId(args.dealId);

    const draftId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + DRAFT_EXPIRY_DAYS * 86_400_000).toISOString();
    const { error: insertErr } = await supabase.from('AgentDraft').insert({
      id: draftId,
      spaceId: ctx.space.id,
      contactId,
      dealId: args.dealId,
      channel: 'note',
      subject: `Counter-offer — ${dealRow.title}`,
      content,
      reasoning: 'Drafted a counter-offer summary for realtor review (not sent, not binding).',
      priority: 0,
      status: 'pending',
      expiresAt,
    });
    if (insertErr) {
      logger.error('[tools.draft_counter_offer] insert failed', { dealId: args.dealId }, insertErr);
      return { summary: `Couldn't save the draft: ${insertErr.message}`, display: 'error' };
    }

    return {
      summary: `Drafted a counter-offer for "${dealRow.title}" — review and edit it in your inbox before sending. Nothing was sent.`,
      data: {
        draftId,
        dealId: args.dealId,
        contactId,
        channel: 'note' as const,
        status: 'pending' as const,
      },
      display: 'success',
    };
  },
});
