/**
 * POST /api/internal/integrations/execute — internal endpoint for the
 * Chippi agent (Modal/Python). Authed by AGENT_INTERNAL_SECRET.
 *
 * Executes ONE Composio action by slug for a (spaceId, userId). Paired
 * with /api/internal/integrations/tools — same reason both exist:
 * Composio's IP allowlist accepts Vercel and rejects Modal, so the agent
 * proxies every Composio touch through Next.js.
 *
 * Response shape: { ok: boolean, data?: unknown, error?: string }.
 * Mirrors the ResultOut shape the rest of the codebase uses; the Python
 * side passes the JSON straight back to the model as the tool result.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeToolForEntity, composioConfigured } from '@/lib/integrations/composio';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!composioConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Integrations are not configured.' },
      { status: 503 },
    );
  }

  let body: {
    spaceId?: unknown;
    userId?: unknown;
    slug?: unknown;
    arguments?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const args =
    body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
      ? (body.arguments as Record<string, unknown>)
      : {};
  if (!spaceId || !userId || !slug) {
    return NextResponse.json(
      { ok: false, error: 'spaceId, userId, and slug are required' },
      { status: 400 },
    );
  }

  // Per-space cap — the bearer secret authenticates Modal, but a runaway
  // agent loop firing send/post actions has real cost (Twilio SMS, fal
  // generation, etc. each charge per call). 300/hour is well above any
  // legitimate chat session (a busy agent runs 20-30 tool calls per turn,
  // 10-15 turns per chat = ~300 calls per hour at maximum).
  const rl = await checkRateLimit(`integrations:execute:${spaceId}`, 300, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many tool executions for this workspace.' },
      { status: 429 },
    );
  }

  let result: unknown;
  try {
    result = await executeToolForEntity({
      entityId: userId,
      slug,
      arguments: args,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[integrations.execute] tool execution threw', {
      spaceId,
      userId,
      slug,
      err: msg,
    });
    return NextResponse.json(
      { ok: false, error: `${slug} failed: ${msg.slice(0, 500)}` },
      { status: 200 }, // 200 + ok:false so the agent can surface a clean error to the model
    );
  }

  // Composio's ToolExecuteResponse shape: { successful, error, data, ... }
  // Normalize to { ok, data, error } before returning.
  const r = (result || {}) as { successful?: boolean; error?: unknown; data?: unknown };
  const ok = r.successful !== false;
  const errMsg = r.error ? String(r.error).slice(0, 500) : undefined;
  return NextResponse.json({
    ok,
    data: r.data ?? result,
    error: ok ? undefined : errMsg || `${slug} failed`,
  });
}
