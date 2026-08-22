/**
 * Default realtor pipelines + idempotent bootstrap.
 *
 * Space creation used to insert orphan DealStage rows (no pipelineId /
 * pipelineType). The deals board then rendered empty until a later
 * GET /api/pipelines visit back-filled pipelines. Both paths now share
 * this helper so a brand-new workspace has Rental + Buyer boards on
 * first paint.
 */

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import type { Pipeline } from '@/lib/types';

export const DEFAULT_PIPELINES = [
  {
    name: 'Rental Pipeline',
    color: '#6366f1',
    emoji: null as string | null,
    pipelineType: 'rental',
    defaultStages: [
      { name: 'New Inquiry', color: '#6b7280', position: 0 },
      { name: 'Screening', color: '#3b82f6', position: 1 },
      { name: 'Showing', color: '#8b5cf6', position: 2 },
      { name: 'Application', color: '#f59e0b', position: 3 },
      { name: 'Approved', color: '#10b981', position: 4 },
    ],
  },
  {
    name: 'Buyer Pipeline',
    color: '#f97316',
    emoji: null as string | null,
    pipelineType: 'buyer',
    defaultStages: [
      { name: 'New Lead', color: '#6b7280', position: 0 },
      { name: 'Pre-Approved', color: '#3b82f6', position: 1 },
      { name: 'Showings', color: '#8b5cf6', position: 2 },
      { name: 'Offer Made', color: '#f59e0b', position: 3 },
      { name: 'Under Contract', color: '#f97316', position: 4 },
      { name: 'Closing', color: '#10b981', position: 5 },
    ],
  },
] as const;

/**
 * Return existing pipelines, or create the default Rental + Buyer boards
 * (and attach or seed their stages). Idempotent: a second call for a
 * space that already has pipelines is a no-op read.
 */
export async function ensureDefaultPipelines(spaceId: string): Promise<Pipeline[]> {
  const { data: existing, error: fetchError } = await tenantTable(supabase, 'Pipeline', { spaceId })
    .select('*')
    .order('position', { ascending: true });
  if (fetchError) throw fetchError;

  if (existing && existing.length > 0) {
    return existing as Pipeline[];
  }

  const pipelines: Pipeline[] = [];

  for (let i = 0; i < DEFAULT_PIPELINES.length; i++) {
    const def = DEFAULT_PIPELINES[i];
    const pipelineId = crypto.randomUUID();

    const { data: pipeline, error: insertError } = await tenantTable(supabase, 'Pipeline', { spaceId })
      .insert({
        id: pipelineId,
        spaceId,
        name: def.name,
        color: def.color,
        emoji: def.emoji,
        position: i,
      })
      .select()
      .single();
    if (insertError) throw insertError;
    pipelines.push(pipeline as Pipeline);

    const { data: matchingStages, error: stagesError } = await tenantTable(supabase, 'DealStage', {
      spaceId,
    })
      .select('id')
      .eq('pipelineType', def.pipelineType)
      .is('pipelineId', null);
    if (stagesError) throw stagesError;

    if (matchingStages && matchingStages.length > 0) {
      const { error: updateError } = await tenantTable(supabase, 'DealStage', { spaceId })
        .update({ pipelineId })
        .in(
          'id',
          matchingStages.map((s: { id: string }) => s.id),
        );
      if (updateError) throw updateError;
    } else {
      const inserts = def.defaultStages.map((s) => ({
        id: crypto.randomUUID(),
        spaceId,
        name: s.name,
        color: s.color,
        position: s.position,
        pipelineType: def.pipelineType,
        pipelineId,
      }));
      const { error: seedError } = await tenantTable(supabase, 'DealStage', { spaceId }).insert(inserts);
      if (seedError) throw seedError;
    }
  }

  return pipelines;
}
