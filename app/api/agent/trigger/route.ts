/**
 * POST /api/agent/trigger
 *
 * Pushes an event into the Redis trigger queue for a space so the next
 * agent heartbeat processes it promptly.
 *
 * Secured with Clerk auth. Rate-limited to 20 triggers per space per minute
 * to prevent Redis abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const VALID_EVENTS = ['new_lead', 'tour_completed', 'deal_stage_changed', 'application_submitted'] as const;
type TriggerEvent = typeof VALID_EVENTS[number];

const RATE_LIMIT = 20;     // max triggers per window
const RATE_WINDOW_S = 60;  // 1 minute window

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
      { error: 'Invalid event type' },
      { status: 400 },
    );
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return NextResponse.json({ queued: false, reason: 'Redis not configured' });
  }

  // Rate limit: increment a per-space-per-minute counter
  const rateKey = `agent:trigger-rate:${space.id}:${Math.floor(Date.now() / 60_000)}`;
  const rateRes = await fetch(`${kvUrl}/incr/${encodeURIComponent(rateKey)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (rateRes.ok) {
    const { result: count } = await rateRes.json() as { result: number };
    if (count === 1) {
      // First request in this window — set TTL so the key self-cleans
      await fetch(`${kvUrl}/expire/${encodeURIComponent(rateKey)}/${RATE_WINDOW_S * 2}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}` },
      });
    }
    if (count > RATE_LIMIT) {
      return NextResponse.json({ error: 'Too many triggers — slow down' }, { status: 429 });
    }
  }

  const trigger = JSON.stringify({
    event,
    contactId: contactId ?? null,
    dealId: dealId ?? null,
    spaceId: space.id,
    queuedAt: new Date().toISOString(),
  });

  const key = `agent:triggers:${space.id}`;

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
