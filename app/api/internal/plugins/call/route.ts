/**
 * POST /api/internal/plugins/call — the Modal/Python agent's door into custom
 * plugins. Authed by AGENT_INTERNAL_SECRET (same contract as the other
 * /api/internal routes). Delegates to lib/plugins/call.ts — the exact same
 * execution path (SSRF guard, timeouts, caps, auth-header attach) as the TS
 * chat tool, so the two runtimes can never drift.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { callCustomPlugin } from '@/lib/plugins/call';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { spaceId?: unknown; plugin?: unknown; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
  const plugin = typeof body.plugin === 'string' ? body.plugin : '';
  const input = typeof body.input === 'string' ? body.input : undefined;
  if (!spaceId || !plugin) {
    return NextResponse.json({ error: 'spaceId and plugin are required' }, { status: 400 });
  }

  const rl = await checkRateLimit(`plugins:internal:call:${spaceId}`, 30, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many plugin calls this hour.' }, { status: 429 });
  }

  const result = await callCustomPlugin(spaceId, plugin, input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json(result);
}
