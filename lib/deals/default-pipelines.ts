/**
 * Default boards every workspace should have: rental, buyer, and seller.
 *
 * GET /api/pipelines used to seed only rental + buyer, and only when the
 * space had zero Pipeline rows. Seller contacts then had nowhere to land.
 * This helper is idempotent: missing types are created; existing boards
 * are left alone. Drag / custom stages stay the realtor's.
 *
 * Contract spine is the realtor. We are not an MLS member and do not
 * ingest listing data. We are not an e-sign vendor and do not treat a
 * DocuSign envelope as offer-accepted. Under Contract moves when the
 * realtor accepts an offer (or drags the card). Lender LOS is not faked.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { DealStageKind } from '@/lib/types';

/**
 * Who may declare a contract. `'realtor'` = offer accept / drag / dates
 * they typed. Not MLS. Not e-sign. Not a lender LOS.
 */
export const CONTRACT_SPINE = 'realtor' as const;

export type DefaultPipelineType = 'rental' | 'buyer' | 'seller';

export interface DefaultStageDef {
  name: string;
  color: string;
  position: number;
  kind: DealStageKind;
}

export interface DefaultPipelineDef {
  name: string;
  color: string;
  pipelineType: DefaultPipelineType;
  defaultStages: DefaultStageDef[];
}

export const DEFAULT_PIPELINE_DEFS: DefaultPipelineDef[] = [
  {
    name: 'Rental Pipeline',
    color: '#6366f1',
    pipelineType: 'rental',
    defaultStages: [
      { name: 'New Inquiry', color: '#6b7280', position: 0, kind: 'lead' },
      { name: 'Screening', color: '#3b82f6', position: 1, kind: 'qualified' },
      { name: 'Showing', color: '#8b5cf6', position: 2, kind: 'active' },
      { name: 'Application', color: '#f59e0b', position: 3, kind: 'active' },
      { name: 'Approved', color: '#10b981', position: 4, kind: 'closing' },
    ],
  },
  {
    name: 'Buyer Pipeline',
    color: '#f97316',
    pipelineType: 'buyer',
    defaultStages: [
      { name: 'New Lead', color: '#6b7280', position: 0, kind: 'lead' },
      { name: 'Pre-Approved', color: '#3b82f6', position: 1, kind: 'qualified' },
      { name: 'Showings', color: '#8b5cf6', position: 2, kind: 'active' },
      { name: 'Offer Made', color: '#f59e0b', position: 3, kind: 'active' },
      { name: 'Under Contract', color: '#f97316', position: 4, kind: 'under_contract' },
      { name: 'Closing', color: '#10b981', position: 5, kind: 'closing' },
    ],
  },
  {
    name: 'Seller Pipeline',
    color: '#0f766e',
    pipelineType: 'seller',
    defaultStages: [
      { name: 'New Seller', color: '#6b7280', position: 0, kind: 'lead' },
      { name: 'Listing Prep', color: '#3b82f6', position: 1, kind: 'qualified' },
      // CRM marketing status — not an MLS listing feed.
      { name: 'On Market', color: '#8b5cf6', position: 2, kind: 'active' },
      { name: 'Under Contract', color: '#f97316', position: 3, kind: 'under_contract' },
      { name: 'Closing', color: '#10b981', position: 4, kind: 'closing' },
    ],
  },
];

export interface EnsurePipelinesResult {
  created: DefaultPipelineType[];
}

/**
 * Create any missing default boards for this space. Tenant-scoped.
 * Never throws — callers treat this as best-effort board hygiene.
 */
export async function ensureDefaultPipelines(spaceId: string): Promise<EnsurePipelinesResult> {
  const created: DefaultPipelineType[] = [];

  const { data: pipelineRows, error: pipeErr } = await supabase
    .from('Pipeline')
    .select('id, name, position')
    .eq('spaceId', spaceId)
    .order('position', { ascending: true });
  if (pipeErr) {
    logger.warn('[deals.pipelines] pipeline lookup failed', { spaceId, err: pipeErr.message });
    return { created };
  }

  const { data: stageRows, error: stageErr } = await supabase
    .from('DealStage')
    .select('id, pipelineType, pipelineId')
    .eq('spaceId', spaceId);
  if (stageErr) {
    logger.warn('[deals.pipelines] stage lookup failed', { spaceId, err: stageErr.message });
    return { created };
  }

  const pipelines = (pipelineRows ?? []) as Array<{ id: string; name: string; position: number }>;
  const stages = (stageRows ?? []) as Array<{
    id: string;
    pipelineType: string | null;
    pipelineId: string | null;
  }>;

  let nextPosition =
    pipelines.reduce((max, p) => (p.position > max ? p.position : max), -1) + 1;

  for (const def of DEFAULT_PIPELINE_DEFS) {
    const typed = stages.filter((s) => s.pipelineType === def.pipelineType);
    if (typed.length > 0) {
      const attached = typed.find((s) => s.pipelineId);
      const orphans = typed.filter((s) => !s.pipelineId);
      if (orphans.length > 0 && !attached) {
        const pipelineId = crypto.randomUUID();
        const { error: insertErr } = await supabase.from('Pipeline').insert({
          id: pipelineId,
          spaceId,
          name: def.name,
          color: def.color,
          emoji: null,
          position: nextPosition,
        });
        if (insertErr) {
          logger.warn('[deals.pipelines] attach insert failed', {
            spaceId,
            type: def.pipelineType,
            err: insertErr.message,
          });
          continue;
        }
        nextPosition += 1;
        const { error: updateErr } = await supabase
          .from('DealStage')
          .update({ pipelineId })
          .in('id', orphans.map((s) => s.id))
          .eq('spaceId', spaceId);
        if (updateErr) {
          logger.warn('[deals.pipelines] orphan backfill failed', {
            spaceId,
            type: def.pipelineType,
            err: updateErr.message,
          });
        } else {
          created.push(def.pipelineType);
        }
      }
      continue;
    }

    const pipelineId = crypto.randomUUID();
    const { error: insertErr } = await supabase.from('Pipeline').insert({
      id: pipelineId,
      spaceId,
      name: def.name,
      color: def.color,
      emoji: null,
      position: nextPosition,
    });
    if (insertErr) {
      logger.warn('[deals.pipelines] seed insert failed', {
        spaceId,
        type: def.pipelineType,
        err: insertErr.message,
      });
      continue;
    }
    nextPosition += 1;

    const inserts = def.defaultStages.map((s) => ({
      id: crypto.randomUUID(),
      spaceId,
      name: s.name,
      color: s.color,
      position: s.position,
      kind: s.kind,
      pipelineType: def.pipelineType,
      pipelineId,
    }));
    const { error: seedErr } = await supabase.from('DealStage').insert(inserts);
    if (seedErr) {
      logger.warn('[deals.pipelines] stage seed failed', {
        spaceId,
        type: def.pipelineType,
        err: seedErr.message,
      });
      continue;
    }
    created.push(def.pipelineType);
  }

  return { created };
}
