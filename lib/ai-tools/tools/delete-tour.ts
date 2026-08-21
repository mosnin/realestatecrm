/**
 * `delete_tour` — permanently delete a tour row.
 *
 * Approval-gated and DESTRUCTIVE. Unlike `cancel_tour` (which flips status to
 * 'cancelled' and keeps the audit trail), this removes the Tour row entirely.
 * Mirrors cancel_tour's Google Calendar cleanup so a deleted tour doesn't
 * leave a ghost slot on the realtor's calendar. There is no undo, so
 * `requiresApproval: true` is mandatory.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { dropTourCalendarArtifacts } from '@/lib/tours/calendar-propagate';
import { defineTool } from '../types';

const parameters = z
  .object({
    tourId: z.string().min(1).describe('The Tour.id to permanently delete.'),
    reason: z
      .string()
      .min(1)
      .max(500)
      .describe('Why this tour is being deleted (logged on the linked contact activity feed).'),
  })
  .describe('Permanently delete a tour (irreversible).');

interface DeleteTourResult {
  tourId: string;
  deleted: true;
}

export const deleteTourTool = defineTool<typeof parameters, DeleteTourResult>({
  name: 'delete_tour',
  riskLevel: 'destructive',
  description:
    'Permanently delete a tour. Irreversible — cancel it instead to keep history. Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    return `Permanently delete tour ${args.tourId.slice(0, 8)} — ${args.reason}`;
  },

  async handler(args, ctx) {
    const { data: tour, error: tourErr } = await supabase
      .from('Tour')
      .select('id, contactId, guestName, googleEventId')
      .eq('id', args.tourId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (tourErr) {
      return { summary: `Tour lookup failed: ${tourErr.message}`, display: 'error' };
    }
    if (!tour) {
      return { summary: `No tour with that id.`, display: 'error' };
    }

    // Log the deletion on the contact timeline BEFORE deleting the tour:
    // the Tour FK on ContactActivity isn't involved, and recording the
    // reason while the contactId is still in hand keeps the audit trail.
    if (tour.contactId) {
      const { error: activityErr } = await supabase.from('ContactActivity').insert({
        id: crypto.randomUUID(),
        spaceId: ctx.space.id,
        contactId: tour.contactId,
        type: 'note',
        content: `Tour deleted: ${args.reason}`,
        metadata: { tourId: args.tourId, via: 'on_demand_agent', delete: true },
      });
      if (activityErr) {
        logger.warn('[tools.delete_tour] activity insert failed', { tourId: args.tourId }, activityErr);
      }
    }

    const { error: deleteErr } = await supabase
      .from('Tour')
      .delete()
      .eq('id', args.tourId)
      .eq('spaceId', ctx.space.id);
    if (deleteErr) {
      logger.error('[tools.delete_tour] delete failed', { tourId: args.tourId }, deleteErr);
      return { summary: `Delete failed: ${deleteErr.message}`, display: 'error' };
    }

    // Drop BOTH calendar systems (legacy googleEventId + Composio mirror).
    // Fire-and-forget: the row is already gone; a hiccup orphans the event.
    void dropTourCalendarArtifacts({
      spaceId: ctx.space.id,
      tourId: args.tourId,
      googleEventId: (tour as { googleEventId?: string | null }).googleEventId,
    });

    const guest = (tour.guestName as string | null) || 'guest';
    return {
      summary: `Tour for ${guest} deleted.`,
      data: { tourId: args.tourId, deleted: true as const },
      display: 'success',
    };
  },
});
