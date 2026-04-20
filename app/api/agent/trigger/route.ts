/**
 * POST /api/agent/trigger
 *
 * Pushes an event into the Redis trigger queue for a space so the next
 * agent heartbeat processes it promptly. Called automatically by the app
 * when key events occur (new lead, tour completed, deal stage change).
 *
 * Secured with Clerk auth — only authenticated space members can trigger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const VALID_EVENTS = ['new_lead', 'tour_completed', 'deal_stage_changed', 'application_submitted'] as const;
type TriggerEvent = typeof VALID_EVENTS[number];

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { event, contactId, dealId } = body as {
    event: TriggerEvent;
    contactId?: string;
    dealId?: string;
  };

  if (!event || !VALID_EVENTS.includes(event)) {
    return NextResponse.json(
      { error: `event must be one of: ${VALID_EVENTS.join(', ')}` },
      { status: 400 },
    );
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    // Redis not configured — silently succeed (agent will pick up next heartbeat anyway)
    return NextResponse.json({ queued: false, reason: 'Redis not configured' });
  }

  const trigger = JSON.stringify({
    event,
    contactId: contactId ?? null,
    dealId: dealId ?? null,
    spaceId: space.id,
    queuedAt: new Date().toISOString(),
  });

  const key = `agent:triggers:${space.id}`;

  // RPUSH so orchestrator can LRANGE + delete in order
  const res = await fetch(`${kvUrl}/rpush/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([trigger]),
  });

  if (!res.ok) {
    console.error('[agent/trigger] Redis push failed', await res.text());
    return NextResponse.json({ queued: false, reason: 'Redis error' });
  }

  return NextResponse.json({ queued: true, event, spaceId: space.id });
}
