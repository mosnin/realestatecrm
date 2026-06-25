/**
 * Property IQ precompute — warm the global area cache for high-traffic metros
 * off the critical path, so the common lookups are instant and the research
 * cost is amortized to a nightly batch instead of paid on a realtor's click.
 *
 * Because the cache is global (one row per areaKey for the whole platform),
 * researching a metro once here serves every realtor in it forever (until the
 * 30-day TTL lapses). The runner is bounded per invocation and skips areas that
 * are already fresh, so repeated cron ticks rotate coverage cheaply.
 */

import 'server-only';
import { logger } from '@/lib/logger';
import { normalizeArea, type NormalizedArea } from '@/lib/areas';
import { getAreaReport, getOrCreateAreaReport } from '@/lib/area-report-store';

/**
 * Seed metros — high-listing-volume US areas. Kept as city+state (ZIP-less) so
 * each is one shared report per metro; extend freely. Deliberately a curated
 * short list, not all 30k ZIPs: we warm where the listings actually are.
 */
export const SEED_AREAS: Array<{ city: string; stateRegion: string }> = [
  { city: 'Austin', stateRegion: 'TX' },
  { city: 'Dallas', stateRegion: 'TX' },
  { city: 'Houston', stateRegion: 'TX' },
  { city: 'San Antonio', stateRegion: 'TX' },
  { city: 'Phoenix', stateRegion: 'AZ' },
  { city: 'Denver', stateRegion: 'CO' },
  { city: 'Atlanta', stateRegion: 'GA' },
  { city: 'Charlotte', stateRegion: 'NC' },
  { city: 'Raleigh', stateRegion: 'NC' },
  { city: 'Nashville', stateRegion: 'TN' },
  { city: 'Tampa', stateRegion: 'FL' },
  { city: 'Orlando', stateRegion: 'FL' },
  { city: 'Miami', stateRegion: 'FL' },
  { city: 'Jacksonville', stateRegion: 'FL' },
  { city: 'Las Vegas', stateRegion: 'NV' },
  { city: 'Seattle', stateRegion: 'WA' },
  { city: 'Portland', stateRegion: 'OR' },
  { city: 'Sacramento', stateRegion: 'CA' },
  { city: 'San Diego', stateRegion: 'CA' },
  { city: 'Columbus', stateRegion: 'OH' },
];

export interface PrecomputeResult {
  considered: number;
  researched: number;
  skippedFresh: number;
  failed: number;
}

/**
 * Warm up to `limit` not-yet-fresh seed areas. Sequential by design — area
 * research is heavy (web fan-out + LLM) and this runs in the background; we'd
 * rather take longer than spike upstream rate limits. Best-effort: a failure on
 * one area never stops the batch.
 */
export async function precomputeSeedAreas(opts: {
  limit?: number;
  now?: number;
} = {}): Promise<PrecomputeResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 5, SEED_AREAS.length));
  const now = opts.now ?? Date.now();

  const result: PrecomputeResult = { considered: 0, researched: 0, skippedFresh: 0, failed: 0 };

  for (const seed of SEED_AREAS) {
    if (result.researched >= limit) break;
    const area: NormalizedArea | null = normalizeArea(seed);
    if (!area) continue;
    result.considered += 1;

    // Skip areas already fresh so each tick spends its budget on cold ones.
    try {
      const existing = await getAreaReport(area.areaKey);
      if (existing?.expiresAt && new Date(existing.expiresAt).getTime() > now) {
        result.skippedFresh += 1;
        continue;
      }
    } catch {
      /* fall through to research */
    }

    try {
      const outcome = await getOrCreateAreaReport(area, { now });
      if (outcome.status === 'ok') {
        result.researched += 1;
      } else if (outcome.status === 'not_configured') {
        // No keys — nothing to do; stop early, the whole batch would no-op.
        logger.info('[area-precompute] research not configured; stopping');
        break;
      } else {
        result.failed += 1;
      }
    } catch (err) {
      result.failed += 1;
      logger.warn('[area-precompute] area failed', { area: area.areaKey }, err);
    }
  }

  logger.info('[area-precompute] done', { ...result });
  return result;
}
