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
      // limit:1000 mirrors the chat-path loader — without it Composio
      // returns only the first 20 actions per toolkit.
      const raw = (await composio.tools.getRawComposioTools({
        toolkits: [toolkit],
        limit: 1000,
      })) as RawComposioTool[];
      for (const t of raw) {
        if (!t.slug) continue;
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

  return NextResponse.json({ tools: collected });
}
