/**
 * `update_contact` — patch a Contact's editable fields.
 *
 * Approval-gated: the user should see what fields are being changed before
 * we touch the record. Name, email, and status changes especially deserve
 * a "are you sure?" since they ripple into search, outbound email envelope,
 * and the Today inbox grouping.
 *
 * Mirrors the validation surface of the PATCH /api/contacts/[id] route
 * so the two paths stay consistent — if we loosen a rule there, loosen it
 * here too. The route is the source of truth for the column list.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncContact } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import type { Contact } from '@/lib/types';

/** The subset of mutable Contact fields the model can change. */
const parameters = z
  .object({
    contactId: z.string().min(1).describe('The Contact.id to update.'),
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().max(254).nullable().optional(),
    phone: z.string().max(20).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    notes: z.string().max(5000).nullable().optional().describe('Freeform notes (replaces the existing notes).'),
    preferences: z.string().max(5000).nullable().optional(),
    sourceLabel: z.string().max(200).nullable().optional(),
    referralSource: z.string().max(200).nullable().optional(),
    budget: z.number().nonnegative().nullable().optional(),
    type: z
      .enum(['QUALIFICATION', 'TOUR', 'APPLICATION'])
      .optional()
      .describe('Contact pipeline stage.'),
    tags: z.array(z.string().max(60)).max(20).optional(),
    properties: z.array(z.string().max(200)).max(20).optional(),
    followUpAt: z.string().datetime().nullable().optional(),
    lastContactedAt: z.string().datetime().nullable().optional(),
    snoozedUntil: z.string().datetime().nullable().optional(),
  })
  .refine(
    (v) => {
      // Require at least one mutable field in addition to contactId.
      const { contactId: _id, ...rest } = v;
      void _id;
      return Object.values(rest).some((x) => x !== undefined);
    },
    { message: 'Provide at least one field to update.' },
  )
  .describe(
    "Update a contact's editable fields. Only include the fields you want to change; omit the rest.",
  );

interface UpdateContactResult {
  contactId: string;
  changed: string[];
}

export const updateContactTool = defineTool<typeof parameters, UpdateContactResult>({
  name: 'update_contact',
  description:
    "Update a contact's editable fields (name, email, phone, address, notes, tags, type, budget, follow-up, etc.). Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 100, windowSeconds: 3600 },
  summariseCall(args) {
    const { contactId: _c, ...rest } = args;
    void _c;
    const fields = Object.entries(rest)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k);
    if (fields.length === 0) return `Update contact ${args.contactId.slice(0, 8)}`;
    if (fields.length <= 3) {
      return `Update contact ${args.contactId.slice(0, 8)}: ${fields.join(', ')}`;
    }
    return `Update contact ${args.contactId.slice(0, 8)}: ${fields.slice(0, 3).join(', ')} + ${fields.length - 3} more`;
  },

  async handler(args, ctx) {
    const { contactId, ...rest } = args;

    const { data: existing, error: fetchErr } = await supabase
      .from('Contact')
      .select('id, type, name')
      .eq('id', contactId)
      .eq('spaceId', ctx.space.id)
      .is('brokerageId', null)
      .maybeSingle();
    if (fetchErr) {
      return { summary: `Contact lookup failed: ${fetchErr.message}`, display: 'error' };
    }
    if (!existing) {
      return {
        summary: `No contact with id "${contactId}" in this workspace.`,
        display: 'error',
      };
    }

    // Build the update payload from only the fields the model included.
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    const changed: string[] = [];
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) continue;
      updates[key] = value;
      changed.push(key);
    }
    if (rest.type !== undefined && rest.type !== existing.type) {
      updates.stageChangedAt = new Date().toISOString();
    }

    const { data: updated, error: updateErr } = await supabase
      .from('Contact')
      .update(updates)
      .eq('id', contactId)
      .eq('spaceId', ctx.space.id)
      .select()
      .single();
    if (updateErr) {
      logger.error(
        '[tools.update_contact] update failed',
        { spaceId: ctx.space.id, contactId },
        updateErr,
      );
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    // Reindex search — best-effort. A failure here shouldn't fail the tool
    // since the DB update already landed; the PATCH route takes the same
    // fire-and-forget stance.
    syncContact(updated as Contact).catch((err) =>
      logger.warn('[tools.update_contact] vector sync failed', { contactId }, err),
    );

    return {
      summary: `Updated ${existing.name || 'contact'}: changed ${changed.join(', ')}.`,
      data: { contactId, changed },
      display: 'success',
    };
  },
});
