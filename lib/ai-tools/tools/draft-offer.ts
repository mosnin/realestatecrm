/**
 * `draft_offer` — draft an offer-presentation summary for a deal.
 *
 * What this is: a REVIEWABLE communication + structured term summary the
 * realtor reads, edits, and decides what to do with. It is NOT an
 * auto-send and NOT a binding purchase agreement — it is the realtor's
 * talking-points / cover note for presenting an offer.
 *
 * Pipeline: lands in the realtor's approval inbox as an `AgentDraft` row
 * (status='pending', channel='note') tied to the deal (`dealId`) and the
 * deal's primary contact (`contactId`, best-effort via DealContact). This
 * is the SAME draft pipeline the Python `draft_message` tool and the
 * morning/sweep flows use — the realtor's inbox renders pending drafts and
 * the realtor approves / edits / dismisses. We use the `note` channel (not
 * `email`/`sms`) because the artifact is a term summary for the realtor to
 * review, not a message we'd ever auto-dispatch.
 *
 * Approval: YES. Creating an inbox draft is a state mutation, so it routes
 * through the approval gate like the other mutating tools. It is reversible
 * (the realtor can dismiss the draft), hence riskLevel='low'.
 *
 * Space-scoping: the deal is resolved with `.eq('spaceId', ctx.space.id)`.
 * A deal in another space simply isn't found → clean refusal. The handler
 * never trusts a spaceId from args.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import {
  DRAFT_EXPIRY_DAYS,
  fmtMoney,
  resolvePrimaryContactId,
} from './offer-draft-shared';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to draft the offer presentation for.'),
    price: z
      .number()
      .nonnegative()
      .optional()
      .describe('Proposed offer price in dollars. Defaults to the deal value when omitted.'),
    closingDate: z
      .string()
      .max(40)
      .optional()
      .describe('Target closing date, free-text (e.g. "2026-08-15" or "in 45 days").'),
    contingencies: z
      .array(z.string().min(1).max(200))
      .max(12)
      .optional()
      .describe('Contingencies to call out (e.g. "inspection", "financing", "appraisal").'),
    notes: z
      .string()
      .max(2000)
      .optional()
      .describe('Free-text context to fold into the draft (concessions, timeline, motivation).'),
  })
  .describe(
    'Draft a reviewable offer-presentation summary for a deal. Lands in the approval inbox as a note tied to the deal. Not a binding contract; not auto-sent.',
  );

interface DraftOfferResult {
  draftId: string;
  dealId: string;
  contactId: string | null;
  channel: 'note';
  status: 'pending';
}

export const draftOfferTool = defineTool<typeof parameters, DraftOfferResult>({
  name: 'draft_offer',
  riskLevel: 'low',
  description:
    'Draft a reviewable offer-presentation summary for a deal (lands in the approval inbox as a note). Prompts for approval first. Not a binding contract; never auto-sent.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 30, windowSeconds: 3600 },
  summariseCall(args) {
    const slug =
      typeof args?.dealId === 'string' && args.dealId.length > 0 ? args.dealId.slice(0, 8) : 'deal';
    const price = typeof args?.price === 'number' ? ` at ${fmtMoney(args.price)}` : '';
    return `Draft an offer presentation for deal ${slug}${price}`;
  },

  async handler(args, ctx) {
    // Space-scoped lookup. A deal outside the caller's space isn't found.
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
    const price = args.price ?? dealRow.value ?? null;

    // Compose the term summary. Plain prose the realtor can read top-to-
    // bottom, then edit. Deliberately framed as a presentation/cover note,
    // not contract language.
    const lines: string[] = [];
    lines.push(`Offer presentation — ${dealRow.title}`);
    if (dealRow.address) lines.push(`Property: ${dealRow.address}`);
    lines.push('');
    lines.push('Proposed terms:');
    lines.push(`• Offer price: ${price != null ? fmtMoney(price) : 'TBD — confirm with the buyer'}`);
    if (args.closingDate) lines.push(`• Target closing: ${args.closingDate}`);
    if (args.contingencies && args.contingencies.length > 0) {
      lines.push(`• Contingencies: ${args.contingencies.join(', ')}`);
    }
    if (args.notes) {
      lines.push('');
      lines.push('Notes:');
      lines.push(args.notes.trim());
    }
    lines.push('');
    lines.push('Review and edit before presenting — this is a draft summary, not a binding contract.');
    const content = lines.join('\n');

    const contactId = await resolvePrimaryContactId(args.dealId);

    const draftId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + DRAFT_EXPIRY_DAYS * 86_400_000).toISOString();
    const { error: insertErr } = await tenantTable(supabase, 'AgentDraft', { spaceId: ctx.space.id }).insert({
      id: draftId,
      spaceId: ctx.space.id,
      contactId,
      dealId: args.dealId,
      channel: 'note',
      subject: `Offer presentation — ${dealRow.title}`,
      content,
      reasoning: 'Drafted an offer presentation for real estate agent review (not sent, not binding).',
      priority: 0,
      status: 'pending',
      expiresAt,
    });
    if (insertErr) {
      logger.error('[tools.draft_offer] insert failed', { dealId: args.dealId }, insertErr);
      return { summary: `Couldn't save the draft: ${insertErr.message}`, display: 'error' };
    }

    return {
      summary: `Drafted an offer presentation for "${dealRow.title}" — review and edit it in your inbox before sending. Nothing was sent.`,
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
