/**
 * POST /api/agent/trigger
 *
 * Fires an agent trigger for a CRM event. Two things happen:
 *
 * 1. The trigger is pushed to the Redis queue so the agent has it when it runs.
 * 2. If MODAL_WEBHOOK_URL is configured, the Modal agent is called immediately
 *    so event-driven agents (tour_followup, offer_agent) respond in seconds
 *    rather than waiting up to 15 minutes for the next heartbeat.
 *
 * The Redis push always happens first. If the Modal call fails, the trigger is
 * still in Redis and will be processed at the next heartbeat — no data loss.
 *
 * Secured with Clerk auth. Rate-limited to 20 triggers per space per minute.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const VALID_EVENTS = [
  'new_lead',
  'tour_completed',
  'deal_stage_changed',
  'application_submitted',
] as const;
type TriggerEvent = typeof VALID_EVENTS[number];

const RATE_LIMIT = 20;
const RATE_WINDOW_S = 60;

// Fire Modal immediately for every accepted CRM event so the background
// agent reacts continuously as new information arrives. Redis remains the
// durable queue fallback if the immediate webhook call fails.
const IMMEDIATE_EVENTS = new Set<TriggerEvent>(VALID_EVENTS);

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';
const MODAL_WEBHOOK_URL = process.env.MODAL_WEBHOOK_URL ?? '';

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
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
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

  // Step 1: Push to Redis. Always happens, regardless of Modal availability.
  const redisRes = await fetch(`${kvUrl}/rpush/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([trigger]),
  });

  if (!redisRes.ok) {
    console.error('[agent/trigger] Redis push failed', await redisRes.text());
    return NextResponse.json({ queued: false, reason: 'Redis error' });
  }

  // Step 2: For time-critical events, fire the Modal agent immediately.
  // Non-blocking: we don't await this or let it fail the request.
  // The trigger is already in Redis, so worst case the agent catches it at
  // the next heartbeat.
  let firedImmediately = false;
  if (IMMEDIATE_EVENTS.has(event) && MODAL_WEBHOOK_URL && AGENT_INTERNAL_SECRET) {
    // Fire-and-forget. The agent will pop the trigger from Redis when it runs.
    fetch(MODAL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: space.id, secret: AGENT_INTERNAL_SECRET }),
    }).then(async (res) => {
      if (!res.ok) {
        console.warn('[agent/trigger] Modal immediate fire returned', res.status, await res.text());
      }
    }).catch((err) => {
      console.warn('[agent/trigger] Modal immediate fire failed (trigger still in Redis)', err);
    });
    firedImmediately = true;
  }

  return NextResponse.json({
    queued: true,
    event,
    spaceId: space.id,
    firedImmediately,
    method: firedImmediately ? 'redis+modal' : 'redis',
  });
}
