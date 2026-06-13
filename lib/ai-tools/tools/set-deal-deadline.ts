/**
 * `set_deal_deadline` — create or update a contract-to-close deadline.
 *
 * A "deadline" is just a `DealChecklistItem` that carries a reminder: a
 * `dueAt`, the deal-contact `assignedRoles` to nudge before it lands, and a
 * `reminderLeadDays` lead time. The deal-deadlines cron drafts a reminder
 * (an AgentDraft, never a send) to those roles `reminderLeadDays` before the
 * due date.
 *
 * We REUSE the existing checklist row rather than inventing a parallel
 * deadline table — the checklist already renders on the deal card and the
 * Tasks tab, so a deadline IS a dated checklist item the realtor can see and
 * tick off.
 *
 * Match-by-kind upsert: a deal has at most one canonical row per kind
 * (one `inspection`, one `closing`). Calling this twice for the same
 * non-custom kind updates the existing row instead of stacking duplicates.
 * `custom` always inserts — there can be many custom items.
 *
 * Approval-gated: it writes a dated, role-targeted reminder that the agent
 * will later act on, so the realtor sees the kind + due date + roles first.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { isValidRole } from '@/lib/deals/roles';
import { defineTool } from '../types';

const CHECKLIST_KINDS = [
  'earnest_money',
  'inspection',
  'appraisal',
  'loan_commitment',
  'clear_to_close',
  'final_walkthrough',
  'closing',
  'custom',
] as const;

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id the deadline belongs to.'),
    kind: z
      .enum(CHECKLIST_KINDS)
      .describe(
        'Deadline category. Non-custom kinds upsert (one inspection, one closing per deal); "custom" always adds a new row.',
      ),
    label: z.string().min(1).max(200).describe('One-line description (e.g. "Inspection period ends").'),
    dueAt: z.string().datetime().describe('When the deadline lands (ISO datetime).'),
    assignedRoles: z
      .array(z.string())
      .max(12)
      .optional()
      .describe(
        'Deal-contact roles to remind before the due date (e.g. ["lender","title"]). Unknown roles are dropped.',
      ),
    reminderLeadDays: z
      .number()
      .int()
      .min(0)
      .max(60)
      .default(3)
      .describe('Draft a reminder this many days before dueAt. Defaults to 3.'),
  })
  .describe('Create or update a contract-to-close deadline on a deal, carrying a role-targeted reminder.');

interface SetDealDeadlineResult {
  itemId: string;
  dealId: string;
  kind: string;
  label: string;
  dueAt: string;
  assignedRoles: string[];
  reminderLeadDays: number;
  created: boolean;
}

export const setDealDeadlineTool = defineTool<typeof parameters, SetDealDeadlineResult>({
  name: 'set_deal_deadline',
  riskLevel: 'low',
  description:
    'Set a contract-to-close deadline on a deal (inspection, appraisal, closing, etc.) with a due date and a reminder for the assigned roles. Prompts for approval.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 120, windowSeconds: 3600 },
  summariseCall(args) {
    const due = new Date(args.dueAt);
    const dueLabel = isNaN(due.getTime()) ? args.dueAt : due.toISOString().slice(0, 10);
    const roles = (args.assignedRoles ?? []).filter(isValidRole);
    const who = roles.length ? ` · remind ${roles.join(', ')}` : '';
    return `Set deadline "${args.label}" (due ${dueLabel}) on deal ${args.dealId.slice(0, 8)}${who}`;
  },

  async handler(args, ctx) {
    // Deal must exist in this space — an out-of-space dealId would still
    // satisfy the FK, so we don't take the FK's word for it.
    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .select('id, title')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (dealErr) {
      return { summary: `Deal lookup failed: ${dealErr.message}`, display: 'error' };
    }
    if (!deal) {
      return { summary: `No deal with id "${args.dealId}" in this workspace.`, display: 'error' };
    }

    const dueIso = new Date(args.dueAt).toISOString();
    // Drop roles that aren't in the canonical catalogue — a typo'd role would
    // silently never match a DealContact, so we keep only valid ones.
    const roles = Array.from(new Set((args.assignedRoles ?? []).filter(isValidRole)));
    const label = args.label.trim().slice(0, 200);

    // Upsert by kind for canonical kinds; custom always inserts. We changed
    // the dueAt (and possibly the roles/lead), so reset reminderSentAt to null
    // — a moved deadline earns a fresh reminder.
    let existing: { id: string } | null = null;
    if (args.kind !== 'custom') {
      const { data } = await supabase
        .from('DealChecklistItem')
        .select('id')
        .eq('dealId', args.dealId)
        .eq('spaceId', ctx.space.id)
        .eq('kind', args.kind)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();
      existing = (data as { id: string } | null) ?? null;
    }

    if (existing) {
      const { data: updated, error: updErr } = await supabase
        .from('DealChecklistItem')
        .update({
          label,
          dueAt: dueIso,
          assignedRoles: roles,
          reminderLeadDays: args.reminderLeadDays,
          reminderSentAt: null,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('spaceId', ctx.space.id)
        .select('id, dealId, kind, label, dueAt, assignedRoles, reminderLeadDays')
        .single();
      if (updErr || !updated) {
        logger.error('[tools.set_deal_deadline] update failed', { dealId: args.dealId, kind: args.kind }, updErr);
        return { summary: `Failed to update deadline: ${updErr?.message ?? 'unknown error'}`, display: 'error' };
      }
      return {
        summary: `Updated "${updated.label}" on "${deal.title}", due ${fmt(updated.dueAt)}.`,
        data: {
          itemId: updated.id,
          dealId: updated.dealId,
          kind: updated.kind,
          label: updated.label,
          dueAt: updated.dueAt,
          assignedRoles: (updated.assignedRoles as string[]) ?? [],
          reminderLeadDays: (updated.reminderLeadDays as number) ?? args.reminderLeadDays,
          created: false,
        },
        display: 'success',
      };
    }

    // New row — append at the bottom. Position = current max + 1, same as
    // POST /api/deals/[id]/checklist and add_checklist_item.
    const { data: maxRow } = await supabase
      .from('DealChecklistItem')
      .select('position')
      .eq('dealId', args.dealId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (maxRow?.position ?? -1) + 1;

    const itemId = crypto.randomUUID();
    const { data: inserted, error: insErr } = await supabase
      .from('DealChecklistItem')
      .insert({
        id: itemId,
        dealId: args.dealId,
        spaceId: ctx.space.id,
        kind: args.kind,
        label,
        dueAt: dueIso,
        assignedRoles: roles,
        reminderLeadDays: args.reminderLeadDays,
        position: nextPosition,
      })
      .select('id, dealId, kind, label, dueAt, assignedRoles, reminderLeadDays')
      .single();
    if (insErr || !inserted) {
      logger.error('[tools.set_deal_deadline] insert failed', { dealId: args.dealId }, insErr);
      return { summary: `Failed to set deadline: ${insErr?.message ?? 'unknown error'}`, display: 'error' };
    }

    return {
      summary: `Set "${inserted.label}" on "${deal.title}", due ${fmt(inserted.dueAt)}.`,
      data: {
        itemId: inserted.id,
        dealId: inserted.dealId,
        kind: inserted.kind,
        label: inserted.label,
        dueAt: inserted.dueAt,
        assignedRoles: (inserted.assignedRoles as string[]) ?? [],
        reminderLeadDays: (inserted.reminderLeadDays as number) ?? args.reminderLeadDays,
        created: true,
      },
      display: 'success',
    };
  },
});

function fmt(iso: string | null): string {
  if (!iso) return 'no date';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? 'no date'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
