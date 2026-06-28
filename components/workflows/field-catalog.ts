/**
 * FIELD CATALOG — per-trigger suggested condition fields.
 *
 * The condition rows in the builder let the realtor compare a dotted path
 * (e.g. 'lead.score') against a value. Free-text field entry is always
 * allowed, but most workflows reach for the same handful of fields per
 * trigger — so we suggest those as a datalist. This keeps the IF step
 * scannable without locking the realtor out of an arbitrary path.
 *
 * Pure data. No schema import beyond the trigger-type union so this stays a
 * cheap, testable lookup the builder consumes.
 */

import type { TriggerType } from '@/lib/workflows/schema';

/**
 * Suggested condition fields per trigger. The builder renders these as a
 * <datalist> behind the field input — the realtor can pick one or type their
 * own dotted path. A trigger absent from this map falls back to the shared
 * COMMON_FIELDS.
 */
export const FIELD_CATALOG: Partial<Record<TriggerType, string[]>> = {
  lead_created: ['lead.score', 'lead.source', 'lead.name', 'lead.email'],
  lead_score_threshold: ['lead.score', 'lead.source', 'lead.name', 'lead.email'],
  inbound_message: ['message.body', 'message.channel', 'contact.name'],
  tour_completed: ['deal.stage', 'contact.name', 'lead.score'],
  deal_stage_changed: ['deal.stage', 'event.toStage', 'contact.name'],
  integration_event: ['event.toolkit', 'event.name', 'contact.name'],
  schedule: ['event.type'],
};

/** Fields worth suggesting regardless of trigger. */
const COMMON_FIELDS = ['contact.name', 'lead.score', 'lead.source'];

/**
 * Suggested fields for a trigger, de-duplicated and merged with the common
 * set. The catalog entry comes first so the most relevant fields lead.
 */
export function fieldsForTrigger(triggerType: TriggerType): string[] {
  const specific = FIELD_CATALOG[triggerType] ?? [];
  const merged = [...specific];
  for (const f of COMMON_FIELDS) {
    if (!merged.includes(f)) merged.push(f);
  }
  return merged;
}
