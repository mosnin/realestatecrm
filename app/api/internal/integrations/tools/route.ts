/**
 * POST /api/internal/integrations/tools — internal endpoint for the Chippi
 * agent (Modal/Python). Authed by AGENT_INTERNAL_SECRET.
 *
 * Returns the raw Composio tool specs for a (spaceId, userId) so the Python
 * side can build FunctionTool wrappers that execute via the sibling
 * /execute endpoint. We proxy because Composio's API key has an IP
 * allowlist that includes Vercel's range but not Modal's — direct calls
 * from Modal hit `10401 HTTP_Unauthorized: This API key is not authorized
 * from the current IP address` and every realtor loses access to every
 * connected toolkit on the first chat turn after deploy.
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

  let body: { spaceId?: unknown; userId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!spaceId || !userId) {
    return NextResponse.json({ error: 'spaceId and userId are required' }, { status: 400 });
  }

  // Per-space hourly cap — the bearer secret authenticates Modal, but a
  // compromised secret or a runaway agent loop must not be able to fan
  // out unlimited Composio list calls (each one hits Composio's pricing).
  const rl = await checkRateLimit(`integrations:list:${spaceId}`, 120, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many tool list calls' }, { status: 429 });
  }

  let toolkits: string[];
  try {
    toolkits = await activeToolkits({ spaceId, userId });
  } catch (err) {
    logger.warn('[integrations.tools] activeToolkits lookup failed', {
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
  const collected: Array<{
    slug: string;
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    toolkit: string;
  }> = [];

  for (const toolkit of toolkits) {
    try {
      const raw = (await composio.tools.getRawComposioTools({
        toolkits: [toolkit],
        // Fetch a generous-but-bounded set per toolkit. Composio returns
        // tools in priority order (their relevance signal) so taking the
        // top 200 catches every action a realtor would realistically use
        // without dragging in long-tail admin actions. We then re-cap
        // per-toolkit below to stay under xAI's hard 200-tool ceiling on
        // the model side; even a small connected toolkit set (gmail +
        // hubspot + slack) used to ship 500+ tools to the model and 400.
        limit: 200,
      })) as RawComposioTool[];

      // Two-stage sort + cap. xAI rejects requests whose tool list >200;
      // OpenAI/Anthropic let it through but the prompt-token cost is
      // brutal and the model gets distracted by long-tail admin actions
      // (archive_batch, association_*) that no realtor uses. Score each
      // action by verb relevance, take the top MAX_TOOLS_PER_TOOLKIT.
      const scored = raw
        .filter((t) => t.slug)
        .map((t) => ({ tool: t, score: scoreActionPriority(t.slug) }));
      scored.sort((a, b) => b.score - a.score);
      const capped = scored.slice(0, MAX_TOOLS_PER_TOOLKIT).map((s) => s.tool);

      for (const t of capped) {
        collected.push({
          slug: t.slug,
          name: (t.name || t.slug).slice(0, 64),
          description: (t.description || t.slug).slice(0, 1024),
          parameters: t.inputParameters || { type: 'object', properties: {} },
          toolkit,
        });
      }
    } catch (err) {
      // Per-toolkit isolation — a single dead connection mustn't poison
      // the whole batch. Caller's reconcile path on the Python side
      // decides whether to flip a row to 'expired' (it doesn't, anymore —
      // see agent/integrations.py:_is_auth_like_error, which now refuses
      // to expire user connections on platform-level 401s).
      logger.warn('[integrations.tools] toolkit fetch failed — skipping', {
        spaceId,
        userId,
        toolkit,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Hard total cap. Native Chippi tools eat ~30 slots; xAI's per-request
  // ceiling is 200. Leaving 160 for integrations keeps a comfortable
  // margin if the native catalog grows. If the per-toolkit caps were
  // tight enough this is a no-op, but the floor catches the case where
  // the realtor has 10+ toolkits connected.
  const capped = collected.slice(0, MAX_TOTAL_INTEGRATION_TOOLS);
  if (capped.length < collected.length) {
    logger.warn('[integrations.tools] hit total tool cap — truncating', {
      spaceId,
      userId,
      requested: collected.length,
      kept: capped.length,
      cap: MAX_TOTAL_INTEGRATION_TOOLS,
    });
  }

  return NextResponse.json({ tools: capped });
}

// xAI's Chat Completions hard limit is 200 functions per request. Native
// Chippi has ~30; reserve a margin so the integration tools never push us
// over even as the native catalog grows.
const MAX_TOTAL_INTEGRATION_TOOLS = 160;
// Per-toolkit cap. HubSpot alone ships 100+ raw actions (CRUD across every
// object type, batch ops, association management); a realtor uses 5-10.
// 25 lets us cover the realistic surface — send/read/list/search/create/
// update across the toolkit's core objects — without burning the model's
// attention on long-tail admin verbs.
const MAX_TOOLS_PER_TOOLKIT = 25;

// Priority verbs the agent actually needs, scored highest first. Anything
// not matched falls through to score 0 — still selectable, just last in
// line. Matched against the lowercased slug.
const VERB_SCORES: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /(^|_)(send|reply|post|publish)(_|$)/, score: 100 }, // outbound action
  { pattern: /(^|_)(draft|compose)(_|$)/, score: 95 },
  { pattern: /(^|_)(read|fetch|get|list|search|find|view)(_|$)/, score: 80 }, // inbound
  { pattern: /(^|_)(create|add|insert)(_|$)/, score: 60 },
  { pattern: /(^|_)(update|edit|patch|modify|set)(_|$)/, score: 55 },
  { pattern: /(^|_)(delete|remove|archive)(_|$)/, score: 30 }, // destructive — keep but low
  { pattern: /(^|_)(batch|bulk)(_|$)/, score: -20 }, // long-tail admin
  { pattern: /(^|_)(association|associations)(_|$)/, score: -30 }, // hubspot junk
];

function scoreActionPriority(slug: string): number {
  const s = slug.toLowerCase();
  let total = 0;
  for (const { pattern, score } of VERB_SCORES) {
    if (pattern.test(s)) total += score;
  }
  return total;
}
