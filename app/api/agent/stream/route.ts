/**
 * GET /api/agent/stream?runId=...
 *
 * Server-Sent Events endpoint. The browser subscribes here to receive
 * live task updates from the Modal agent in real-time — like watching
 * Claude Code run but for the background agent.
 *
 * The agent publishes events to Redis via POST /api/agent/events.
 * This endpoint reads from that Redis list on a short poll interval
 * and streams new events to the browser as they arrive.
 *
 * Connection lifecycle:
 *   1. Browser opens SSE connection with a runId
 *   2. We poll Redis every 500ms for new events past the last cursor
 *   3. Each event is flushed immediately to the browser
 *   4. When the agent sends a 'complete' event, we send it and close
 *   5. Request timeout or client disconnect also close the stream
 */

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Redis } from '@upstash/redis';
import { getSpaceForUser } from '@/lib/space';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

const POLL_INTERVAL_MS = 600;
const MAX_STREAM_DURATION_MS = 5 * 60 * 1000; // 5 minutes max

function eventKey(spaceId: string, runId: string): string {
  return `agent:stream:${spaceId}:${runId}`;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const space = await getSpaceForUser(userId);
  if (!space) {
    return new Response('Forbidden', { status: 403 });
  }

  const runId = req.nextUrl.searchParams.get('runId');
  if (!runId) {
    return new Response('Missing runId', { status: 400 });
  }

  const key = eventKey(space.id, runId);
  const encoder = new TextEncoder();

  let cursor = 0;
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: string) {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      // Send initial connected event
      send(JSON.stringify({ type: 'connected', message: 'Connected to agent stream', ts: Date.now() }));

      while (true) {
        // Timeout guard
        if (Date.now() - startedAt > MAX_STREAM_DURATION_MS) {
          send(JSON.stringify({ type: 'timeout', message: 'Stream timeout', ts: Date.now() }));
          controller.close();
          return;
        }

        try {
          // Read all events past the current cursor
          const events = await redis.lrange(key, cursor, -1);

          for (const event of events) {
            const str = typeof event === 'string' ? event : JSON.stringify(event);
            send(str);
            cursor++;

            // Close stream after completion event
            const parsed = typeof event === 'string' ? JSON.parse(event) : event;
            if (parsed.type === 'complete' || parsed.type === 'error') {
              controller.close();
              return;
            }
          }
        } catch {
          // Redis error — send keepalive and continue
        }

        // Keepalive comment every poll to prevent connection timeout
        controller.enqueue(encoder.encode(': keepalive\n\n'));

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    },
    cancel() {
      // Client disconnected — nothing to clean up, Redis key expires naturally
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering
    },
  });
}
