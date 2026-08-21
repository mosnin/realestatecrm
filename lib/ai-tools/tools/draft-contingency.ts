/**
 * `draft_contingency` — draft a contingency-related summary for a deal.
 *
 * What this is: a REVIEWABLE communication / term summary about a specific
 * contingency (inspection / financing / appraisal / sale-of-home / title /
 * other) the realtor reads, edits, and decides what to do with. NOT an
 * auto-send, NOT a binding addendum.
 *
 * Pipeline: same `AgentDraft` path as the sibling offer tools
 * (status='pending', channel='note') tied to the deal (`dealId`) and the
 * deal's primary contact (`contactId`, best-effort via DealContact).
 *
 * Approval: YES (reversible inbox mutation → riskLevel='low').
 *
 * Space-scoping: the deal is resolved with `.eq('spaceId', ctx.space.id)`;
 * a deal in another space isn't found → clean refusal.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import { DRAFT_EXPIRY_DAYS, resolvePrimaryContactId } from './offer-draft-shared';

const CONTINGENCY_TYPES = [
  'inspection',
  'financing',
  'appraisal',
  'sale_of_home',
  'title',
  'other',
] as const;

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to draft the contingency note for.'),
    contingencyType: z
      .enum(CONTINGENCY_TYPES)
      .describe('Which contingency this is about (inspection, financing, appraisal, etc.).'),
    deadline: z
      .string()
      .max(40)
      .optional()
      .describe('Contingency deadline, free-text (e.g. "2026-07-10" or "10 days from acceptance").'),
    terms: z
      .string()
      .max(2000)
      .optional()
      .describe('Specifics of the contingency (scope, amounts, conditions) to fold into the draft.'),
    notes: z
      .string()
      .max(2000)
      .optional()
      .describe('Free-text context (rationale, next steps, who to notify).'),
  })
  .describe(
    'Draft a reviewable contingency summary for a deal. Lands in the approval inbox as a note tied to the deal. Not a binding addendum; not auto-sent.',
  );

interface DraftContingencyResult {
  draftId: string;
  dealId: string;
  contactId: string | null;
  contingencyType: (typeof CONTINGENCY_TYPES)[number];
  channel: 'note';
  status: 'pending';
}

/** "sale_of_home" → "Sale Of Home" for the human-facing label. */
function labelFor(type: (typeof CONTINGENCY_TYPES)[number]): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const draftContingencyTool = defineTool<typeof parameters, DraftContingencyResult>({
  name: 'draft_contingency',
  riskLevel: 'low',
  description:
    'Draft a reviewable contingency summary for a deal (inspection / financing / appraisal / etc.). Lands in the approval inbox as a note. Prompts for approval first. Not a binding addendum; never auto-sent.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 30, windowSeconds: 3600 },
  summariseCall(args) {
    const slug =
      typeof args?.dealId === 'string' && args.dealId.length > 0 ? args.dealId.slice(0, 8) : 'deal';
    const type =
      typeof args?.contingencyType === 'string' ? labelFor(args.contingencyType) : 'contingency';
    return `Draft a ${type} contingency note for deal ${slug}`;
  },

  async handler(args, ctx) {
    const { data: deal, error: dealErr } = await tenantTable(supabase, 'Deal', { spaceId: ctx.space.id })
      .select('id, title, address')
      .eq('id', args.dealId)
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

    const dealRow = deal as { id: string; title: string; address: string | null };
    const typeLabel = labelFor(args.contingencyType);

    const lines: string[] = [];
    lines.push(`${typeLabel} contingency — ${dealRow.title}`);
    if (dealRow.address) lines.push(`Property: ${dealRow.address}`);
    lines.push('');
    if (args.deadline) lines.push(`Deadline: ${args.deadline}`);
    if (args.terms) {
      lines.push('');
      lines.push('Terms:');
      lines.push(args.terms.trim());
    }
    if (args.notes) {
      lines.push('');
      lines.push('Notes:');
      lines.push(args.notes.trim());
    }
    lines.push('');
    lines.push('Review and edit before sending — this is a draft summary, not a binding addendum.');
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
      subject: `${typeLabel} contingency — ${dealRow.title}`,
      content,
      reasoning: `Drafted a ${typeLabel.toLowerCase()} contingency summary for real estate agent review (not sent, not binding).`,
      priority: 0,
      status: 'pending',
      expiresAt,
    });
    if (insertErr) {
      logger.error('[tools.draft_contingency] insert failed', { dealId: args.dealId }, insertErr);
      return { summary: `Couldn't save the draft: ${insertErr.message}`, display: 'error' };
    }

    return {
      summary: `Drafted a ${typeLabel.toLowerCase()} contingency note for "${dealRow.title}" — review and edit it in your inbox before sending. Nothing was sent.`,
      data: {
        draftId,
        dealId: args.dealId,
        contactId,
        contingencyType: args.contingencyType,
        channel: 'note' as const,
        status: 'pending' as const,
      },
      display: 'success',
    };
  },
});
