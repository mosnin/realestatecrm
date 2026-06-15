/**
 * Normalizers that flatten the two result shapes deal/property tools emit into
 * a single array the tool-ui dispatch can render.
 *
 *   - find_deal      → `{ match, deal }` (single) | `{ match, deals }` (shortlist)
 *   - find_stuck_deals / list views → `{ deals: [...] }`
 *   - find_property  → `{ match, property }` | `{ match, properties }`
 *
 * Pure + framework-free so they're unit-testable and shared by both
 * tool-call-block-view and tool-group-block-view.
 */

import type { DealRowInput, PropertyItemInput } from './tool-ui-mappers';

/** Pull a flat deal array out of whatever shape the deal tool returned. */
export function normalizeDealRows(data: unknown): DealRowInput[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as { deals?: unknown; deal?: unknown };
  if (Array.isArray(d.deals)) return d.deals as DealRowInput[];
  if (d.deal && typeof d.deal === 'object') return [d.deal as DealRowInput];
  return [];
}

/** Pull a flat property array out of whatever shape the property tool returned. */
export function normalizePropertyRows(data: unknown): PropertyItemInput[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as { properties?: unknown; property?: unknown };
  if (Array.isArray(d.properties)) return d.properties as PropertyItemInput[];
  if (d.property && typeof d.property === 'object') return [d.property as PropertyItemInput];
  return [];
}
