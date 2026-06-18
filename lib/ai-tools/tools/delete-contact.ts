/**
 * `delete_contact` — permanently delete a contact and its dependent rows.
 *
 * Approval-gated and DESTRUCTIVE. Unlike `archive_person` (which only sets
 * snoozedUntil and is reversible), this removes the Contact row outright.
 * The DB cascades dependent rows (ContactActivity, AgentDraft, tours'
 * contactId → SET NULL, etc.) via the FK ON DELETE rules. There is no undo,
 * so `requiresApproval: true` is mandatory — the realtor must confirm before
 * the row is gone.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id to permanently delete.'),
    reason: z
      .string()
      .min(1)
      .max(500)
      .describe('Why this contact is being deleted — recorded in the server log for audit.'),
  })
  .describe('Permanently delete a contact (irreversible).');

interface DeleteContactResult {
  contactId: string;
  deleted: true;
}

export const deleteContactTool = defineTool<typeof parameters, DeleteContactResult>({
  name: 'delete_contact',
  riskLevel: 'destructive',
  description:
    'Permanently delete a contact and its activity. Irreversible — use archive to merely hide. Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 20, windowSeconds: 3600 },
  summariseCall(args) {
    return `Permanently delete contact ${args.personId.slice(0, 8)} — ${args.reason}`;
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

    const { error: deleteErr } = await supabase
      .from('Contact')
      .delete()
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id);
    if (deleteErr) {
      logger.error('[tools.delete_contact] delete failed', { contactId: args.personId }, deleteErr);
      return { summary: `Delete failed: ${deleteErr.message}`, display: 'error' };
    }

    logger.info('[tools.delete_contact] deleted', {
      contactId: args.personId,
      spaceId: ctx.space.id,
      reason: args.reason,
    });

    return {
      summary: `Deleted ${contact.name || 'contact'}.`,
      data: { contactId: args.personId, deleted: true as const },
      display: 'success',
    };
  },
});
