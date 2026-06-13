/**
 * `update_relationship_stage` — move a contact along the relationship arc.
 *
 * Approval-gated: the stage drives which After-Close queue a contact sits in
 * (past_client → anniversary touches, dormant → re-engagement, referral_target
 * → referral asks). A wrong stage quietly mis-routes future autonomous work,
 * so the realtor confirms the move.
 *
 * Sets Contact.relationshipStage and logs a ContactActivity ('note' — the only
 * fitting type in the CHECK set), with the from/to transition in metadata.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import type { RelationshipStage } from '@/lib/types';

const STAGES = [
  'lead',
  'prospect',
  'client',
  'past_client',
  'referral_target',
  'dormant',
] as const satisfies readonly RelationshipStage[];

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id to restage.'),
    toStage: z
      .enum(STAGES)
      .describe(
        'New relationship stage: lead, prospect, client, past_client, referral_target, or dormant.',
      ),
    reason: z
      .string()
      .max(500)
      .optional()
      .describe('Why the stage changed. Becomes the activity-log line.'),
  })
  .describe('Update a contact relationship stage.');

interface UpdateRelationshipStageResult {
  contactId: string;
  fromStage: string | null;
  toStage: (typeof STAGES)[number];
}

const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  lead: 'lead',
  prospect: 'prospect',
  client: 'client',
  past_client: 'past client',
  referral_target: 'referral target',
  dormant: 'dormant',
};

export const updateRelationshipStageTool = defineTool<
  typeof parameters,
  UpdateRelationshipStageResult
>({
  name: 'update_relationship_stage',
  riskLevel: 'low',
  description:
    'Update a contact relationship stage (lead, prospect, client, past_client, referral_target, dormant). Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 200, windowSeconds: 3600 },
  summariseCall(args) {
    const label = args.toStage ? STAGE_LABEL[args.toStage] ?? args.toStage : 'stage';
    return `Set contact ${args.personId.slice(0, 8)} → ${label}`;
  },

  async handler(args, ctx) {
    const { data: contact, error: lookupErr } = await supabase
      .from('Contact')
      .select('id, name, relationshipStage')
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

    const fromStage = (contact as { relationshipStage: string | null }).relationshipStage ?? null;

    if (fromStage === args.toStage) {
      return {
        summary: `${contact.name || 'Contact'} is already a ${STAGE_LABEL[args.toStage]}.`,
        data: { contactId: args.personId, fromStage, toStage: args.toStage },
        display: 'warning',
      };
    }

    const { error: updateErr } = await supabase
      .from('Contact')
      .update({ relationshipStage: args.toStage, updatedAt: new Date().toISOString() })
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error(
        '[tools.update_relationship_stage] update failed',
        { contactId: args.personId },
        updateErr,
      );
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    const content =
      args.reason ?? `Relationship stage: ${STAGE_LABEL[args.toStage]}.`;
    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      contactId: args.personId,
      spaceId: ctx.space.id,
      type: 'note',
      content,
      metadata: { from: fromStage, to: args.toStage, via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn(
        '[tools.update_relationship_stage] activity insert failed',
        { contactId: args.personId },
        activityErr,
      );
    }

    return {
      summary: `${contact.name || 'Contact'} moved to ${STAGE_LABEL[args.toStage]}.`,
      data: { contactId: args.personId, fromStage, toStage: args.toStage },
      display: 'success',
    };
  },
});
