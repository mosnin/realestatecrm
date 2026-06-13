/**
 * `enroll_in_play` — put a contact on a nurture play.
 *
 * A play is a fixed multi-step nurture sequence (speed_to_lead, long_term_drip,
 * post_tour, dormant_winback). Enrolling creates an AgentGoal the advancement
 * cron walks: each step DRAFTS an email or text into the approval inbox on its
 * due date. Nothing sends unattended — the realtor approves every message.
 *
 * Approval-gated because it commits the contact to a sequence of outbound
 * drafts over days/weeks; the realtor wants to see which play, on whom.
 *
 * Idempotent: if the contact already has an active enrollment in the same play,
 * the handler reports that rather than stacking a second sequence.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';
import { enrollInPlay } from '@/lib/plays/enroll';
import { ALL_PLAYS, getPlay, PLAY_KINDS } from '@/lib/plays/definitions';

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id to enroll on a play.'),
    playKind: z
      .enum(PLAY_KINDS)
      .describe(
        'Which play to run: speed_to_lead (new lead), long_term_drip (months out), post_tour (after a tour), dormant_winback (gone quiet).',
      ),
  })
  .describe('Enroll a contact on a multi-step nurture play.');

interface EnrollResult {
  contactId: string;
  playKind: string;
  goalId?: string;
}

export const enrollInPlayTool = defineTool<typeof parameters, EnrollResult>({
  name: 'enroll_in_play',
  riskLevel: 'low',
  description:
    'Enroll a contact on a nurture play (speed_to_lead, long_term_drip, post_tour, dormant_winback). Each step drafts a message into the inbox for approval. Prompts before enrolling.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 100, windowSeconds: 3600 },
  summariseCall(args) {
    const play = getPlay(args.playKind);
    const label = play?.name ?? args.playKind;
    return `Enroll contact ${args.personId.slice(0, 8)} on the "${label}" play`;
  },

  async handler(args, ctx) {
    const play = getPlay(args.playKind);
    if (!play) {
      const names = ALL_PLAYS.map((p) => p.kind).join(', ');
      return {
        summary: `"${args.playKind}" is not a play. Pick one of: ${names}.`,
        display: 'error',
      };
    }

    // Confirm the contact is in this workspace (and not a brokerage-routed row).
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

    const outcome = await enrollInPlay(ctx.space.id, args.personId, play.kind, {
      enrolledBy: 'chat_tool',
    });

    if (!outcome.enrolled) {
      if (outcome.reason === 'already_enrolled') {
        return {
          summary: `${contact.name || 'That contact'} is already on the ${play.name} play.`,
          data: { contactId: args.personId, playKind: play.kind },
          display: 'warning',
        };
      }
      return {
        summary: `Couldn't enroll ${contact.name || 'that contact'} on ${play.name}. Try again.`,
        display: 'error',
      };
    }

    const firstStep = play.steps[0];
    const when = firstStep.delayDays === 0 ? 'today' : `in ${firstStep.delayDays} day${firstStep.delayDays === 1 ? '' : 's'}`;
    return {
      summary: `${contact.name || 'Contact'} enrolled on ${play.name}. First draft lands ${when}.`,
      data: { contactId: args.personId, playKind: play.kind, goalId: outcome.goalId },
      display: 'success',
    };
  },
});
