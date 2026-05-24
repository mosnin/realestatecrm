/**
 * POST /api/internal/integrations/search — internal endpoint the Chippi
 * agent's `find_integration_tool` calls when it needs to discover what
 * Composio actions are available for the realtor's connected toolkits.
 * Authed by AGENT_INTERNAL_SECRET.
 *
 * Why a search endpoint instead of front-loading every tool: a realtor
 * with Gmail + HubSpot + Slack + Instagram connected can have 500+
 * actions across those toolkits. Front-loading them all blows xAI's
 * 200-tool ceiling and burns thousands of prompt tokens per turn even
 * on chats that never touch an integration. The dispatcher pattern
 * (find → execute) keeps the model's working set small and lets it
 * fetch the exact tool it needs only when it needs it.
 *
 * Body: { spaceId, userId, query, limit? }
 * Returns: { tools: [{slug, name, description, parameters, toolkit}] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getComposio, composioConfigured } from '@/lib/integrations/composio';
import { activeToolkits } from '@/lib/integrations/connections';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface RawComposioTool {
  slug: string;
  name?: string;
  description?: string;
  inputParameters?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;
const PER_TOOLKIT_FETCH = 200;

export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!composioConfigured()) {
    return NextResponse.json({ tools: [] });
  }

  let body: { spaceId?: unknown; userId?: unknown; query?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const limitRaw = typeof body.limit === 'number' ? body.limit : DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)));
  if (!spaceId || !userId) {
    return NextResponse.json({ error: 'spaceId and userId are required' }, { status: 400 });
  }

  // Per-space cap — a runaway agent that keeps calling find_integration_tool
  // could rack up real Composio API spend. 60/hour gives roughly one search
  // per chat minute, well above any legitimate use.
  const rl = await checkRateLimit(`integrations:search:${spaceId}`, 60, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many tool searches' }, { status: 429 });
  }

  let toolkits: string[];
  try {
    toolkits = await activeToolkits({ spaceId, userId });
  } catch (err) {
    logger.warn('[integrations.search] activeToolkits lookup failed', {
      spaceId,
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ tools: [] });
  }
  if (toolkits.length === 0) {
    return NextResponse.json({ tools: [] });
  }

  const composio = getComposio();

  // Fetch each toolkit's actions in parallel — by the time we're searching
  // the realtor has already triggered the chat turn, so latency here is
  // user-perceptible. Per-toolkit isolation means one dead connection
  // doesn't poison the batch.
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
        return [];
      }
    }),
  );

  const all = perToolkit.flat().filter((x) => x.tool.slug);

  // Score each tool against the query. Substring matches on slug, name,
  // and description; toolkit-name match boosts the relevance.
  const q = query.toLowerCase();
  const qTokens = q.split(/\s+/).filter(Boolean);
  const scored = all.map(({ tool, toolkit }) => {
    let score = scoreActionPriority(tool.slug);
    if (q) {
      const slug = tool.slug.toLowerCase();
      const name = (tool.name || '').toLowerCase();
      const desc = (tool.description || '').toLowerCase();
      const tk = toolkit.toLowerCase();
      // Whole-query substring is the strongest signal.
      if (slug.includes(q)) score += 200;
      if (name.includes(q)) score += 150;
      if (tk.includes(q)) score += 80;
      if (desc.includes(q)) score += 40;
      // Per-token bonus — handles multi-word queries like "send email" hitting
      // both `send` and `email` in slug.
      for (const tok of qTokens) {
        if (slug.includes(tok)) score += 30;
        if (name.includes(tok)) score += 20;
        if (desc.includes(tok)) score += 10;
      }
    }
    return { tool, toolkit, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).map(({ tool, toolkit }) => ({
    slug: tool.slug,
    name: (tool.name || tool.slug).slice(0, 64),
    description: (tool.description || tool.slug).slice(0, 1024),
    parameters: tool.inputParameters || { type: 'object', properties: {} },
    toolkit,
  }));

  return NextResponse.json({ tools: top });
}

// Verb-relevance scoring — when the query is empty (or weak) the natural
// language hits get tied, and we want common verbs (send, read, list, etc.)
// to win over long-tail admin (batch, association).
const VERB_SCORES: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /(^|_)(send|reply|post|publish)(_|$)/, score: 50 },
  { pattern: /(^|_)(draft|compose)(_|$)/, score: 45 },
  { pattern: /(^|_)(read|fetch|get|list|search|find|view)(_|$)/, score: 40 },
  { pattern: /(^|_)(create|add|insert)(_|$)/, score: 30 },
  { pattern: /(^|_)(update|edit|patch|modify|set)(_|$)/, score: 25 },
  { pattern: /(^|_)(delete|remove|archive)(_|$)/, score: 15 },
  { pattern: /(^|_)(batch|bulk)(_|$)/, score: -10 },
  { pattern: /(^|_)(association|associations)(_|$)/, score: -15 },
];

function scoreActionPriority(slug: string): number {
  const s = slug.toLowerCase();
  let total = 0;
  for (const { pattern, score } of VERB_SCORES) {
    if (pattern.test(s)) total += score;
  }
  return total;
}
