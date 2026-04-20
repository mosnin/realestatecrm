/**
 * POST /api/agent/events
 *
 * Receives real-time event updates FROM the Modal agent and stores them
 * in an Upstash Redis list per space. The browser SSE endpoint reads
 * from these lists to stream live progress to the UI.
 *
 * Secured with AGENT_INTERNAL_SECRET — only trusted agent infrastructure
 * should call this endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';

function eventKey(spaceId: string, runId: string): string {
  return `agent:stream:${spaceId}:${runId}`;
}

export async function POST(req: NextRequest) {
  // Authenticate the call — only the Modal agent should hit this
  const auth = req.headers.get('authorization');
  if (!AGENT_INTERNAL_SECRET || auth !== `Bearer ${AGENT_INTERNAL_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { spaceId, runId, type, message, agentType, metadata } = body;

  if (!spaceId || !runId || !type || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const event = JSON.stringify({
    type,       // 'info' | 'action' | 'draft' | 'complete' | 'error'
    message,    // human-readable description of what the agent is doing
    agentType,
    metadata: metadata ?? {},
    ts: Date.now(),
  });

  const key = eventKey(spaceId, runId);

  // Push event to a capped list. Expires after 2 hours so stale runs auto-clean.
  await redis.rpush(key, event);
  await redis.ltrim(key, -500, -1);   // keep last 500 events
  await redis.expire(key, 7_200);     // 2 hour TTL

  return NextResponse.json({ ok: true });
}
