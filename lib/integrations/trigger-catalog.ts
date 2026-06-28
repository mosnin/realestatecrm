/**
 * Trigger CATALOG for the workflow builder — turns a space's CONNECTED apps
 * into the picker surface a realtor chooses from when authoring an
 * `integration_event` workflow.
 *
 * Two pieces compose here:
 *   - CURATED_TRIGGERS (lib/integrations/triggers.ts) — toolkit → trigger slugs
 *     we actually register at connect time. The picker only ever offers slugs
 *     from this map, so a realtor can never key a workflow to an event Composio
 *     won't deliver.
 *   - EXTRACTORS (same module) — keyed by slug; each carries a human `frame`
 *     headline ("A new email just arrived in my Gmail"). We reuse that as the
 *     event's label so the picker reads in plain language, falling back to a
 *     humanized slug when a slug has no extractor (or its extractor needs a
 *     payload to produce a frame).
 *
 * `listAvailableTriggerEvents` is the data behind the picker: for each ACTIVE
 * connection in the space, look up its curated triggers and label each one.
 * Toolkits with no curated triggers are skipped (nothing to pick), and a
 * toolkit connected twice collapses to one entry (the picker keys on toolkit,
 * not connection).
 */

import { listConnections } from './connections';
import { CURATED_TRIGGERS, EXTRACTORS } from './triggers';

/**
 * Fallback label for a trigger slug with no (usable) EXTRACTORS frame.
 * 'GMAIL_NEW_GMAIL_MESSAGE' → 'New gmail message': drop the leading toolkit
 * token, lowercase the rest, drop a trailing 'TRIGGER', and sentence-case.
 */
export function humanizeTriggerSlug(slug: string): string {
  const parts = slug.split('_').filter(Boolean);
  // Drop the leading toolkit prefix (GMAIL_, SLACK_, GOOGLECALENDAR_, …) — it's
  // redundant under the app the realtor already picked.
  if (parts.length > 1) parts.shift();
  // Drop a trailing TRIGGER token (most slugs carry it; some, like ASANA_*,
  // don't — see CURATED_TRIGGERS).
  if (parts.length > 1 && parts[parts.length - 1] === 'TRIGGER') parts.pop();
  const words = parts.map((w) => w.toLowerCase()).join(' ').trim();
  if (!words) return slug;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Human label for a trigger slug. Prefers the EXTRACTORS[slug] frame (a
 * realtor-voice headline) when the extractor yields one from an empty payload;
 * otherwise falls back to a humanized slug. Some extractors return null on an
 * empty payload (they need message text to build their frame) — those fall
 * through to the humanized slug, which is the stable label the picker wants.
 */
export function triggerLabel(slug: string): string {
  const extract = EXTRACTORS[slug];
  if (extract) {
    try {
      const result = extract({});
      if (result?.frame) return result.frame;
    } catch {
      // An extractor that throws on an empty payload still gets a clean label.
    }
  }
  return humanizeTriggerSlug(slug);
}

export interface TriggerEventOption {
  slug: string;
  label: string;
}

export interface TriggerAppOption {
  toolkit: string;
  /** The connection's display label (connected account email), or the toolkit. */
  label: string;
  connectionId: string;
  events: TriggerEventOption[];
}

/**
 * The picker's data: one entry per ACTIVE connection whose toolkit has curated
 * triggers, each carrying that toolkit's events with human labels. Connections
 * are deduped by toolkit (first active wins). Toolkits with an empty curated
 * list are skipped — there's nothing to trigger on.
 */
export async function listAvailableTriggerEvents(
  spaceId: string,
): Promise<TriggerAppOption[]> {
  const connections = await listConnections(spaceId);
  const seen = new Set<string>();
  const out: TriggerAppOption[] = [];

  for (const conn of connections) {
    if (conn.status !== 'active') continue;
    if (seen.has(conn.toolkit)) continue; // dedupe by toolkit — first wins
    const slugs = CURATED_TRIGGERS[conn.toolkit];
    if (!slugs || slugs.length === 0) continue; // no triggers to pick

    seen.add(conn.toolkit);
    out.push({
      toolkit: conn.toolkit,
      label: conn.label ?? conn.toolkit,
      connectionId: conn.id,
      events: slugs.map((slug) => ({ slug, label: triggerLabel(slug) })),
    });
  }

  return out;
}
