/**
 * `complete_deal_deadline` — mark a contract-to-close deadline done.
 *
 * Sets `completedAt` on a `DealChecklistItem`. Ticking a box is low-stakes
 * and reversible (the checklist UI can untick it), so this auto-approves in
 * the common case. It only pauses for approval when the realtor attaches a
 * substantive note — a longer note usually means context worth a glance
 * before it lands on the deal's record.
 *
 * `requiresApproval: 'maybe'` with `shouldApprove`:
 *   - no note, or a short note (<= 80 chars) → auto-run.
 *   - a longer note                          → prompt.
 *
 * The note (when present) is appended to the row's label as a parenthetical
 * so it shows up inline in the checklist — we don't write a separate activity
 * row here; the cron + checklist surfaces read the item, not an audit log.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

/** Notes at or under this length are routine; longer notes prompt. */
const SHORT_NOTE_MAX = 80;

const parameters = z
  .object({
    deadlineId: z.string().min(1).describe('The DealChecklistItem.id to mark complete.'),
    note: z
      .string()
      .max(500)
      .optional()
      .describe('Optional short note on how it was completed (e.g. "wired, confirmed by title").'),
  })
  .describe('Mark a contract-to-close deadline complete. Auto-approves for a routine completion.');

interface CompleteDealDeadlineResult {
  itemId: string;
  dealId: string;
  label: string;
  completedAt: string;
}

export const completeDealDeadlineTool = defineTool<typeof parameters, CompleteDealDeadlineResult>({
  name: 'complete_deal_deadline',
  riskLevel: 'low',
  description:
    'Mark a deal deadline (a checklist item) complete. Auto-approves for a routine completion; prompts only when a longer note is attached.',
  parameters,
  requiresApproval: 'maybe',
  shouldApprove(args) {
    // Prompt only when there's a substantive note; a bare tick or a short
    // note runs without interrupting the realtor.
    const note = args.note?.trim() ?? '';
    return note.length > SHORT_NOTE_MAX;
  },
  rateLimit: { max: 200, windowSeconds: 3600 },
  summariseCall(args) {
    const note = args.note?.trim();
    const tail = note ? `, note "${note.slice(0, 60)}${note.length > 60 ? '…' : ''}"` : '';
    return `Mark deadline ${args.deadlineId.slice(0, 8)} complete${tail}`;
  },

  async handler(args, ctx) {
    // Item must exist in this space. Scope by spaceId so a stale id from
    // another workspace can't be ticked.
    const { data: item, error: lookupErr } = await supabase
      .from('DealChecklistItem')
      .select('id, dealId, label, completedAt')
      .eq('id', args.deadlineId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (lookupErr) {
      return { summary: `Deadline lookup failed: ${lookupErr.message}`, display: 'error' };
    }
    if (!item) {
      return { summary: `No deadline with id "${args.deadlineId}" in this workspace.`, display: 'error' };
    }

    if (item.completedAt) {
      return {
        summary: `"${item.label}" is already marked complete.`,
        data: {
          itemId: item.id,
          dealId: item.dealId,
          label: item.label,
          completedAt: item.completedAt as string,
        },
        display: 'plain',
      };
    }

    const completedAt = new Date().toISOString();
    const note = args.note?.trim();
    // Fold a note into the label so it reads inline on the checklist. Cap the
    // combined length at the column's 200-char budget.
    const nextLabel = note ? `${item.label} (${note})`.slice(0, 200) : item.label;

    const { error: updErr } = await supabase
      .from('DealChecklistItem')
      .update({ completedAt, label: nextLabel, updatedAt: completedAt })
      .eq('id', item.id)
      .eq('spaceId', ctx.space.id);
    if (updErr) {
      logger.error('[tools.complete_deal_deadline] update failed', { itemId: item.id }, updErr);
      return { summary: `Update failed: ${updErr.message}`, display: 'error' };
    }

    return {
      summary: `Marked "${nextLabel}" complete.`,
      data: {
        itemId: item.id,
        dealId: item.dealId,
        label: nextLabel,
        completedAt,
      },
      display: 'success',
    };
  },
});
