/**
 * AreaReport store — the GLOBAL cache + persistence layer for Property IQ.
 *
 * Area intelligence is PUBLIC data: schools, prices, safety, and walkability for
 * a ZIP are identical for every workspace. So the cache is keyed on `areaKey`
 * ALONE (not per-space) — research an area once for the whole platform and every
 * space reads it. That removes the per-tenant redundancy that would have had
 * 10,000 realtors each pay to research the same ZIP.
 *
 * `getOrCreateAreaReport` is the single entry point every surface uses (the API
 * route, the agent tool, the auto-enrich hook, the precompute cron): it returns a
 * fresh cached report when one exists, otherwise runs the pipeline and upserts
 * the result. NEVER throws — every outcome is the discriminated `AreaReportOutcome`.
 */

import 'server-only';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { AreaReport, AreaIntelligence } from '@/lib/types';
import type { NormalizedArea } from '@/lib/areas';
import { analyzeArea, missingResearchKeys } from '@/lib/area-analysis';

/** Area data moves slowly; a month-old report is still useful. */
export const AREA_REPORT_TTL_DAYS = 30;
const TTL_MS = AREA_REPORT_TTL_DAYS * 24 * 60 * 60 * 1000;

const SELECT =
  'id, "spaceId", "areaKey", label, city, "stateRegion", "postalCode", intelligence, "generatedAt", "expiresAt"';

export type AreaReportOutcome =
  | { status: 'ok'; report: AreaReport; cached: boolean }
  | { status: 'not_configured'; missing: Array<'TAVILY_API_KEY' | 'FIRECRAWL_API_KEY'> }
  | { status: 'no_evidence'; generatedAt: string }
  | { status: 'error'; message: string };

/** A stored row is fresh when it has intelligence and hasn't passed expiresAt. */
function isFresh(row: AreaReport, now: number): boolean {
  if (!row.intelligence || !row.intelligence.summary) return false;
  if (!row.expiresAt) return true; // no expiry set → treat as fresh
  return new Date(row.expiresAt).getTime() > now;
}

/** Read the global report for an area, or null. */
export async function getAreaReport(areaKey: string): Promise<AreaReport | null> {
  const { data, error } = await supabase
    .from('AreaReport')
    .select(SELECT)
    .eq('areaKey', areaKey)
    .maybeSingle();
  if (error) {
    logger.warn('[area-store] read failed', { areaKey }, error);
    return null;
  }
  return (data as AreaReport | null) ?? null;
}

/**
 * Return a fresh area report, researching + persisting one if needed.
 *
 * - Fresh cached row (and not `forceRefresh`) → returns it, cached:true.
 * - Otherwise runs analyzeArea; on success upserts the row and returns it,
 *   cached:false. On not_configured / no_evidence / error, passes the outcome
 *   through without writing.
 */
export async function getOrCreateAreaReport(
  area: NormalizedArea,
  opts: { forceRefresh?: boolean; now?: number } = {},
): Promise<AreaReportOutcome> {
  const now = opts.now ?? Date.now();

  // Cheap gate first so an unconfigured deploy never pretends to research.
  const missing = missingResearchKeys();
  if (missing.length > 0) return { status: 'not_configured', missing };

  // 1) Reuse a fresh cached report.
  if (!opts.forceRefresh) {
    const existing = await getAreaReport(area.areaKey);
    if (existing && isFresh(existing, now)) {
      return { status: 'ok', report: existing, cached: true };
    }
  }

  // 2) Research.
  const outcome = await analyzeArea({
    label: area.label,
    city: area.city,
    stateRegion: area.stateRegion,
    postalCode: area.postalCode,
  });
  if (outcome.status !== 'ok') return outcome;

  // 3) Persist (upsert on the unique areaKey index).
  const report = await upsertReport(area, outcome.intelligence, now);
  if (!report) return { status: 'error', message: 'Failed to save the area report.' };
  return { status: 'ok', report, cached: false };
}

/** Upsert the researched intelligence. Returns the persisted projection or null. */
async function upsertReport(
  area: NormalizedArea,
  intelligence: AreaIntelligence,
  now: number,
): Promise<AreaReport | null> {
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + TTL_MS).toISOString();

  // Preserve a stable id across refreshes so links don't break: reuse the
  // existing row's id when present, else mint one.
  const existing = await getAreaReport(area.areaKey);
  const id = existing?.id ?? crypto.randomUUID();

  const row = {
    id,
    // Global cache row — not owned by any workspace (so a deleted space can't
    // cascade-delete shared area data).
    spaceId: null,
    areaKey: area.areaKey,
    label: area.label,
    city: area.city,
    stateRegion: area.stateRegion,
    postalCode: area.postalCode,
    intelligence: intelligence as unknown as Record<string, unknown>,
    generatedAt: intelligence.generatedAt ?? nowIso,
    expiresAt,
    updatedAt: nowIso,
  };

  const { data, error } = await supabase
    .from('AreaReport')
    .upsert(row, { onConflict: 'areaKey' })
    .select(SELECT)
    .single();

  if (error) {
    logger.error('[area-store] upsert failed', { areaKey: area.areaKey }, error);
    return null;
  }
  return data as unknown as AreaReport;
}
