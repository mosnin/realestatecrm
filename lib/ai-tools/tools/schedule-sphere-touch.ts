/**
 * `schedule_sphere_touch` — put a future retention/sphere touch on a contact.
 *
 * Approval-gated: this schedules outreach the realtor's name will go on later.
 * Setting nextTouchAt moves the contact into the After-Close queue and the
 * sphere sweep will draft an email for it when the date comes due — so the
 * realtor signs off on the intent first.
 *
 * Writes Contact.nextTouchAt + logs a ContactActivity. The activity row is
 * type 'note' (the ContactActivity CHECK constraint only allows
 * note/call/email/meeting/follow_up); the real touch kind rides in metadata
 * so the audit trail stays honest without a schema change.
 *
 * Accepts the same date inputs as set_followup — ISO-8601 or a relative
 * phrase ("Friday", "next Tuesday") — via the shared resolveWhen. Silent
 * date-guessing is how retention touches get lost, so an unparseable phrase
 * errors out instead of defaulting.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import { resolveWhen } from './set-followup';

const TOUCH_KINDS = ['anniversary', 'quarterly_checkin', 'market_update', 'sphere_outreach'] as const;

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id to schedule a touch on.'),
    touchKind: z
      .enum(TOUCH_KINDS)
      .describe(
        "Why we're reaching out: anniversary (closing date), quarterly_checkin, market_update, or sphere_outreach.",
      ),
    when: z
      .string()
      .min(1)
      .max(60)
      .describe(
        'ISO date ("2026-05-08") or relative phrase ("today", "tomorrow", "Friday", "next Tuesday").',
      ),
    note: z
      .string()
      .max(500)
      .optional()
      .describe('Optional context for the touch. Becomes the activity-log line.'),
  })
  .describe('Schedule a sphere / retention touch on a past client or sphere contact.');

interface ScheduleSphereTouchResult {
  contactId: string;
  nextTouchAt: string;
  touchKind: (typeof TOUCH_KINDS)[number];
}

const TOUCH_LABEL: Record<(typeof TOUCH_KINDS)[number], string> = {
  anniversary: 'closing anniversary',
  quarterly_checkin: 'quarterly check-in',
  market_update: 'market update',
  sphere_outreach: 'sphere outreach',
};

export const scheduleSphereTouchTool = defineTool<typeof parameters, ScheduleSphereTouchResult>({
  name: 'schedule_sphere_touch',
  riskLevel: 'low',
  description:
    "Schedule a sphere or retention touch on a contact. Accepts ISO date or 'today'/'tomorrow'/weekday/'next <weekday>'. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 200, windowSeconds: 3600 },
  summariseCall(args) {
    const kind = args.touchKind ? TOUCH_LABEL[args.touchKind] ?? args.touchKind : 'touch';
    return `Schedule ${kind} on contact ${args.personId.slice(0, 8)} → ${args.when}`;
  },

  async handler(args, ctx) {
    const iso = resolveWhen(args.when);
    if (!iso) {
      return {
        summary: `Couldn't parse "${args.when}" as a date. Use ISO ("2026-05-08") or a phrase like "Friday" or "next Tuesday".`,
        display: 'error',
      };
    }

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

    const { error: updateErr } = await supabase
      .from('Contact')
      .update({ nextTouchAt: iso, updatedAt: new Date().toISOString() })
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error(
        '[tools.schedule_sphere_touch] update failed',
        { contactId: args.personId },
        updateErr,
      );
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    const label = TOUCH_LABEL[args.touchKind];
    const content = args.note ?? `Scheduled ${label} for ${iso.slice(0, 10)}.`;
    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      contactId: args.personId,
      spaceId: ctx.space.id,
      type: 'note',
      content,
      metadata: { nextTouchAt: iso, touchKind: args.touchKind, via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn(
        '[tools.schedule_sphere_touch] activity insert failed',
        { contactId: args.personId },
        activityErr,
      );
    }

    return {
      summary: `${label} scheduled for ${contact.name || 'contact'} → ${iso.slice(0, 10)}.`,
      data: { contactId: args.personId, nextTouchAt: iso, touchKind: args.touchKind },
      display: 'success',
    };
  },
});
