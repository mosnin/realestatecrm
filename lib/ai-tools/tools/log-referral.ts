/**
 * `log_referral` — record that we asked a contact for a referral, or that a
 * referral came in from them.
 *
 * Approval-gated: this writes to the contact's audit trail and, on 'asked',
 * stamps Contact.referralAskedAt — which rate-limits how often the After-Close
 * engine will ask the same person again. The realtor signs off so we don't
 * double-ask their sphere.
 *
 * Logs a ContactActivity. The row is type 'note' (the ContactActivity CHECK
 * constraint only allows note/call/email/meeting/follow_up); the referral
 * action + any referred name ride in metadata.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id this referral is about.'),
    action: z
      .enum(['asked', 'received'])
      .describe("'asked' = we requested a referral; 'received' = a referral came in from them."),
    details: z
      .string()
      .max(500)
      .optional()
      .describe('What was said or who was referred. Becomes the activity-log line.'),
    referredName: z
      .string()
      .max(120)
      .optional()
      .describe("On 'received', the name of the person they referred."),
  })
  .describe('Log a referral ask or a referral received from a contact.');

interface LogReferralResult {
  contactId: string;
  action: 'asked' | 'received';
}

export const logReferralTool = defineTool<typeof parameters, LogReferralResult>({
  name: 'log_referral',
  riskLevel: 'low',
  description:
    "Record a referral ask or a referral received from a contact. On 'asked', stamps the rate-limit on future asks. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 200, windowSeconds: 3600 },
  summariseCall(args) {
    const verb = args.action === 'received' ? 'Log referral received from' : 'Log referral ask to';
    return `${verb} contact ${args.personId.slice(0, 8)}`;
  },

  async handler(args, ctx) {
    const { data: contact, error: lookupErr } = await supabase
      .from('Contact')
      .select('id, name')
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id)
      .is('brokerageId', null)
      .maybeSingle();
    if (lookupErr) {
      return { summary: `Contact lookup failed: ${lookupErr.message}`, display: 'error' };
    }
    if (!contact) {
      return {
        summary: `No contact with id "${args.personId}" in this workspace.`,
        display: 'error',
      };
    }

    // On 'asked', stamp referralAskedAt so the After-Close engine won't
    // re-ask this person for a cool-down window. 'received' is a positive
    // event — it doesn't gate future asks, so we leave the stamp alone.
    const now = new Date().toISOString();
    if (args.action === 'asked') {
      const { error: updateErr } = await supabase
        .from('Contact')
        .update({ referralAskedAt: now, updatedAt: now })
        .eq('id', args.personId)
        .eq('spaceId', ctx.space.id);
      if (updateErr) {
        logger.error(
          '[tools.log_referral] update failed',
          { contactId: args.personId },
          updateErr,
        );
        return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
      }
    }

    const fallback =
      args.action === 'received'
        ? `Referral received${args.referredName ? `: ${args.referredName}` : ''}.`
        : 'Asked for a referral.';
    const content = args.details ?? fallback;
    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      contactId: args.personId,
      spaceId: ctx.space.id,
      type: 'note',
      content,
      metadata: {
        referralAction: args.action,
        referredName: args.referredName ?? null,
        via: 'on_demand_agent',
      },
    });
    if (activityErr) {
      logger.warn(
        '[tools.log_referral] activity insert failed',
        { contactId: args.personId },
        activityErr,
      );
    }

    const summary =
      args.action === 'received'
        ? `Logged referral received from ${contact.name || 'contact'}${args.referredName ? ` (${args.referredName})` : ''}.`
        : `Logged referral ask to ${contact.name || 'contact'}.`;

    return {
      summary,
      data: { contactId: args.personId, action: args.action },
      display: 'success',
    };
  },
});
