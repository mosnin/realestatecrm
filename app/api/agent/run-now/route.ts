/**
 * POST /api/agent/run-now
 *
 * Triggers an on-demand agent run for the caller's space.
 *
 * If MODAL_WEBHOOK_URL is configured, calls the Modal web endpoint directly.
 * Otherwise falls back to pushing a trigger into Redis — the agent will
 * process it on the next heartbeat (within 15 minutes).
 *
 * Set MODAL_WEBHOOK_URL after deploying with:
 *   modal deploy agent/modal_app.py
 * The URL is printed in the deploy output as the web_endpoint URL.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';
const MODAL_WEBHOOK_URL = process.env.MODAL_WEBHOOK_URL ?? '';

export async function POST() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Rate limit: max 5 runs per space per minute
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    const rateLimitKey = `agent:runnow-rate:${space.id}:${Math.floor(Date.now() / 60_000)}`;
    try {
      const incrRes = await fetch(`${kvUrl}/incr/${encodeURIComponent(rateLimitKey)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}` },
      });
      if (incrRes.ok) {
        const { result: count } = await incrRes.json() as { result: number };
        if (count === 1) {
          // Set expiry of 90 seconds on first increment
          await fetch(`${kvUrl}/expire/${encodeURIComponent(rateLimitKey)}/90`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${kvToken}` },
          });
        }
        if (count > 5) {
          return NextResponse.json(
            { triggered: false, reason: 'Rate limit exceeded — try again in a minute' },
            { status: 429 }
          );
        }
      }
    } catch {
      // If Redis is unavailable, allow the run (fail open)
    }
  }

  // Path 1: Modal web endpoint configured — fire-and-forget to avoid Vercel timeout.
  // Modal runs can take minutes; we must not await the response. We only await
  // the initial connection/dispatch — if that throws, the request never left.
  if (MODAL_WEBHOOK_URL && AGENT_INTERNAL_SECRET) {
    try {
      // Start the fetch but do NOT await the response — let it run in the background.
      const fetchPromise = fetch(MODAL_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AGENT_INTERNAL_SECRET}`,
        },
        body: JSON.stringify({ space_id: space.id, secret: AGENT_INTERNAL_SECRET }),
      });
      // Suppress unhandled-rejection warnings by attaching a no-op catch.
      fetchPromise.catch((err) => {
        console.error('[agent/run-now] Modal webhook background error', err);
      });
      return NextResponse.json({ triggered: true, method: 'modal' }, { status: 202 });
    } catch (err) {
      // fetch() itself threw before the request could be dispatched (e.g. bad URL).
      console.error('[agent/run-now] Modal webhook dispatch error', err);
    }
  }

  // Path 2: Fallback — push a trigger to Redis so it runs at next heartbeat
  if (kvUrl && kvToken) {
    const trigger = JSON.stringify({
      event: 'new_lead',  // generic trigger — prompts all agents to run
      spaceId: space.id,
      queuedAt: new Date().toISOString(),
      source: 'run_now',
    });
    const key = `agent:triggers:${space.id}`;
    await fetch(`${kvUrl}/rpush/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([trigger]),
    });
    return NextResponse.json({ triggered: true, method: 'queued', note: 'Will run at next heartbeat (≤15 min)' });
  }

  return NextResponse.json({ triggered: false, reason: 'Neither Modal webhook nor Redis is configured' });
}
