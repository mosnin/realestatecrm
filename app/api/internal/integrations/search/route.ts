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

  // Score each tool against the query. The ranker is deliberately simple:
  // token-presence + query-expanded synonyms. The earlier version layered
  // a static verb-priority over the query match, which over-weighted any
  // slug that happened to contain a high-priority verb regardless of
  // whether it was relevant — "read recent emails" surfaced
  // `SLACK_SET_READ_CURSOR_IN_A_CONVERSATION` (matched `set` AND `read`)
  // ahead of `GMAIL_FETCH_EMAILS` (only matched `emails`). Now the ranker
  // just measures intent overlap.
  const q = query.toLowerCase();
  const qTokens = q.split(/\s+/).filter(Boolean);
  // Expand each query token with common synonyms so a search for "read"
  // also boosts slugs containing "fetch", "list", "get", "view", etc.
  // Composio's APP_VERB_NOUN convention means the verb is the high-signal
  // segment; if the realtor's word matches a verb synonym we want a hit.
  const expandedTokens = new Set<string>();
  for (const tok of qTokens) {
    expandedTokens.add(tok);
    for (const syn of QUERY_SYNONYMS[tok] ?? []) {
      expandedTokens.add(syn);
    }
  }
  const scored = all.map(({ tool, toolkit }) => {
    let score = 0;
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
      // Per-token (expanded) — slug match dominates, then name, then desc.
      // We boost expanded tokens slightly less than the original tokens so
      // a slug with the exact word still beats a slug with a synonym.
      for (const tok of qTokens) {
        if (slug.includes(tok)) score += 60;
        if (name.includes(tok)) score += 40;
        if (desc.includes(tok)) score += 20;
      }
      for (const tok of expandedTokens) {
        if (qTokens.includes(tok)) continue; // already scored
        if (slug.includes(tok)) score += 35;
        if (name.includes(tok)) score += 20;
        if (desc.includes(tok)) score += 8;
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

// Query-expansion synonyms. Each user-facing verb (the way a realtor
// would phrase a request) maps to the verbs Composio actually uses in
// its slug catalog. Bi-directional within each cluster — searching
// "fetch" also finds "read" tools. Tuned for the toolkits Chippi
// actually integrates with (Gmail, HubSpot, Slack, LinkedIn, Calendar).
const QUERY_SYNONYMS: Record<string, string[]> = {
  // Inbound
  read: ['fetch', 'list', 'get', 'view', 'search'],
  fetch: ['read', 'list', 'get', 'view'],
  list: ['fetch', 'get', 'read', 'view'],
  get: ['fetch', 'list', 'read', 'retrieve'],
  view: ['read', 'fetch', 'get', 'list'],
  search: ['find', 'query', 'list', 'fetch'],
  find: ['search', 'list', 'fetch'],
  // Outbound
  send: ['post', 'publish', 'create', 'deliver'],
  post: ['send', 'publish', 'create'],
  publish: ['post', 'send'],
  message: ['email', 'dm', 'chat', 'thread'],
  email: ['message', 'mail', 'inbox', 'thread'],
  inbox: ['email', 'mail', 'messages'],
  // Mutations
  create: ['add', 'new', 'insert'],
  add: ['create', 'insert'],
  update: ['edit', 'modify', 'patch'],
  edit: ['update', 'modify'],
  delete: ['remove', 'archive'],
  remove: ['delete', 'archive'],
  // Domain
  contact: ['lead', 'person', 'customer'],
  lead: ['contact', 'prospect'],
  meeting: ['event', 'calendar', 'appointment'],
  event: ['meeting', 'calendar'],
  channel: ['conversation', 'room'],
};
