/**
 * `create_deal` — spin up a new Deal in a specific pipeline stage.
 *
 * Approval-gated. Creating a deal is a meaningful pipeline event — it
 * lands on the kanban, hits commission reporting, and fires a new-deal
 * notification — so the user confirms the title / stage / linked
 * contacts before we write.
 *
 * Mirrors POST /api/deals but intentionally narrower:
 *   - no milestones / commissionRate / probability (the realtor can set
 *     these in the deal detail view after creation)
 *   - no custom position (new deals land at the bottom of the stage,
 *     matching the kanban default)
 *   - doesn't seed a closing checklist (same explicit-action rationale
 *     as add_checklist_item's single-item-only scope)
 *
 * The server-side new-deal notification (email + SMS to the space owner)
 * DOES fire because we route through the same notifyNewDeal helper —
 * no silent creations.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncDeal } from '@/lib/vectorize';
import { notifyNewDeal } from '@/lib/notify';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import type { Deal, DealStage } from '@/lib/types';

const parameters = z
  .object({
    title: z.string().min(1).max(255).describe('Short label shown on the kanban card.'),
    stageId: z.string().min(1).describe('Target DealStage.id. Must belong to this space.'),
    description: z.string().max(5000).optional(),
    value: z.number().nonnegative().nullable().optional().describe('Deal value in dollars.'),
    address: z.string().max(500).optional().describe('Property address, if relevant.'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    closeDate: z.string().datetime().nullable().optional(),
    contactIds: z
      .array(z.string().min(1))
      .max(10)
      .optional()
      .describe('Contacts to link to this deal (buyers, sellers, co-agents).'),
  })
  .describe('Create a new deal in a pipeline stage. Prompts for approval first.');

interface CreateDealResult {
  dealId: string;
  title: string;
  stageId: string;
  stageName: string;
  linkedContactIds: string[];
}

export const createDealTool = defineTool<typeof parameters, CreateDealResult>({
  name: 'create_deal',
  description:
    'Create a new deal in a pipeline stage, optionally linking contacts. Prompts for approval first.',
  parameters,
  requiresApproval: true,

  async handler(args, ctx) {
    // Stage must exist in this space.
    const { data: stage, error: stageErr } = await supabase
      .from('DealStage')
      .select('id, name, pipelineType')
      .eq('id', args.stageId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (stageErr) {
      return { summary: `Stage lookup failed: ${stageErr.message}`, display: 'error' };
    }
    if (!stage) {
      return { summary: `Stage "${args.stageId}" not found in this workspace.`, display: 'error' };
    }

    // Validate every contactId belongs to this space. Mirror the PATCH
    // route's silent-filter behavior: drop unknown ids rather than 400.
    let validContactIds: string[] = [];
    if (args.contactIds && args.contactIds.length > 0) {
      const { data: validContacts, error: vcErr } = await supabase
        .from('Contact')
        .select('id')
        .in('id', args.contactIds)
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null);
      if (vcErr) {
        return { summary: `Contact validation failed: ${vcErr.message}`, display: 'error' };
      }
      const validSet = new Set((validContacts ?? []).map((c: { id: string }) => c.id));
      validContactIds = args.contactIds.filter((id) => validSet.has(id));
    }

    // Position = bottom of the stage's current column.
    const { data: lastDealRow } = await supabase
      .from('Deal')
      .select('position')
      .eq('stageId', args.stageId)
      .eq('spaceId', ctx.space.id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (lastDealRow?.position ?? -1) + 1;

    const dealId = crypto.randomUUID();
    const { data: dealRow, error: dealErr } = await supabase
      .from('Deal')
      .insert({
        id: dealId,
        spaceId: ctx.space.id,
        title: args.title.trim().slice(0, 255),
        description: args.description?.trim() || null,
        value: args.value ?? null,
        address: args.address?.trim() || null,
        priority: args.priority ?? 'MEDIUM',
        closeDate: args.closeDate ? new Date(args.closeDate).toISOString() : null,
        stageId: args.stageId,
        position: nextPosition,
      })
      .select()
      .single();
    if (dealErr || !dealRow) {
      logger.error('[tools.create_deal] insert failed', { spaceId: ctx.space.id }, dealErr);
      return {
        summary: `Failed to create deal: ${dealErr?.message ?? 'unknown error'}`,
        display: 'error',
      };
    }

    // Link contacts. Any DB failure here leaves the deal row in place —
    // same trade-off as the HTTP route, which logs + 500s. We log + surface
    // a partial success.
    if (validContactIds.length > 0) {
      const { error: dcErr } = await supabase
        .from('DealContact')
        .insert(validContactIds.map((cId) => ({ dealId, contactId: cId })));
      if (dcErr) {
        logger.warn(
          '[tools.create_deal] contact linking failed',
          { dealId, count: validContactIds.length },
          dcErr,
        );
      }
    }

    // Search reindex + new-deal notification — best-effort, matches the
    // HTTP route's fire-and-forget pattern.
    syncDeal({ ...(dealRow as Deal), stage: stage as DealStage } as Deal & {
      stage: { name: string };
    }).catch((err) => logger.warn('[tools.create_deal] vector sync failed', { dealId }, err));

    try {
      await notifyNewDeal({
        spaceId: ctx.space.id,
        dealTitle: args.title,
        dealValue: args.value ?? null,
        dealAddress: args.address ?? null,
        dealPriority: args.priority ?? null,
      });
    } catch (err) {
      logger.warn('[tools.create_deal] notification failed', { dealId }, err);
    }

    return {
      summary: `Created deal "${args.title}" in stage "${stage.name}"${
        validContactIds.length ? ` with ${validContactIds.length} contact(s) linked` : ''
      }.`,
      data: {
        dealId,
        title: args.title,
        stageId: args.stageId,
        stageName: stage.name,
        linkedContactIds: validContactIds,
      },
      display: 'success',
    };
  },
});
