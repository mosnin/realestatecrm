/**
 * Shared semantic-ish search over a realtor's CONNECTED Composio actions.
 *
 * Powers the in-process TS chat meta-tool `find_integration_tool` (see
 * `agent-search-tools.ts`). The internal HTTP route
 * (`app/api/internal/integrations/search`, called by the Modal/Python
 * dispatcher) currently keeps a parallel copy of this scoring; converge the
 * two when the planned embedding-search upgrade lands so chat and autonomous
 * runs rank tools identically.
 *
 * Scoring today is keyword token-presence weighted by where the hit landed
 * (slug > name > toolkit > description). It is deliberately simple; the model
 * retries with better keywords if the first pass misses, which is cheap next
 * to loading every action into context. Real embedding search is the tracked
 * follow-up; this function is the seam it will slot into.
 */

import { getComposio, composioConfigured } from './composio';
import { activeToolkits } from './connections';
import { logger } from '@/lib/logger';

export interface IntegrationToolMatch {
  slug: string;
  name: string;
  description: string;
  parameters: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
  toolkit: string;
}

interface RawComposioTool {
  slug: string;
  name?: string;
  description?: string;
  inputParameters?: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
}

const PER_TOOLKIT_FETCH = 200;

function toMatch(tool: RawComposioTool, toolkit: string): IntegrationToolMatch {
  return {
    slug: tool.slug,
    name: (tool.name || tool.slug).slice(0, 64),
    description: (tool.description || tool.slug).slice(0, 1024),
    parameters: tool.inputParameters || { type: 'object', properties: {} },
    toolkit,
  };
}

/**
 * Find connected-toolkit actions matching `query` (or, when `slugs` is given,
 * fetch those exact actions — the curated/build-time path, no scoring).
 * Returns [] when Composio is unconfigured or the realtor has no active
 * toolkits. Per-toolkit failures are isolated (one dead connection doesn't
 * poison the batch).
 */
export async function searchIntegrationActions(args: {
  spaceId: string;
  userId: string;
  query?: string;
  limit?: number;
  slugs?: string[];
}): Promise<IntegrationToolMatch[]> {
  if (!composioConfigured()) return [];
  const { spaceId, userId } = args;
  const query = (args.query ?? '').trim();
  const limit = Math.max(1, Math.min(30, Math.floor(args.limit ?? 10)));
  const slugFilter = (args.slugs ?? [])
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .slice(0, 200);

  let toolkits: string[];
  try {
    toolkits = await activeToolkits({ spaceId, userId });
  } catch (err) {
    logger.warn('[integrations.search] activeToolkits lookup failed', {
      spaceId,
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  if (toolkits.length === 0) return [];

  const composio = getComposio();
  const perToolkit = await Promise.all(
    toolkits.map(async (toolkit) => {
      try {
        const raw = (await composio.tools.getRawComposioTools({
          toolkits: [toolkit],
          limit: PER_TOOLKIT_FETCH,
        })) as RawComposioTool[];
        return raw.map((t) => ({ tool: t, toolkit }));
      } catch (err) {
        logger.warn('[integrations.search] toolkit fetch failed — skipping', {
          spaceId,
          userId,
          toolkit,
          err: err instanceof Error ? err.message : String(err),
        });
        return [] as { tool: RawComposioTool; toolkit: string }[];
      }
    }),
  );
  const all = perToolkit.flat().filter((x) => x.tool.slug);

  // Exact-slug fetch (curated/build-time path) — no scoring, preserve order.
  if (slugFilter.length > 0) {
    const wanted = new Set(slugFilter.map((s) => s.toUpperCase()));
    const bySlug = new Map<string, { tool: RawComposioTool; toolkit: string }>();
    for (const entry of all) {
      const key = entry.tool.slug.toUpperCase();
      if (wanted.has(key) && !bySlug.has(key)) bySlug.set(key, entry);
    }
    return slugFilter
      .map((s) => bySlug.get(s.toUpperCase()))
      .filter((x): x is { tool: RawComposioTool; toolkit: string } => Boolean(x))
      .map(({ tool, toolkit }) => toMatch(tool, toolkit));
  }

  // Natural-language scoring: token presence, weighted by where it hit.
  const q = query.toLowerCase();
  const qTokens = q.split(/\s+/).filter(Boolean);
  const scored = all.map(({ tool, toolkit }) => {
    let score = 0;
    if (q) {
      const slug = tool.slug.toLowerCase();
      const name = (tool.name || '').toLowerCase();
      const desc = (tool.description || '').toLowerCase();
      const tk = toolkit.toLowerCase();
      if (slug.includes(q)) score += 200;
      if (name.includes(q)) score += 150;
      if (tk.includes(q)) score += 80;
      if (desc.includes(q)) score += 40;
      for (const tok of qTokens) {
        if (slug.includes(tok)) score += 60;
        if (name.includes(tok)) score += 40;
        if (desc.includes(tok)) score += 20;
      }
    }
    return { tool, toolkit, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ tool, toolkit }) => toMatch(tool, toolkit));
}
